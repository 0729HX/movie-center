/**
 * DownloadQueue -- 下载队列管理器 (单例)
 *
 * 职责:
 * 1. 管理下载队列 (并发控制, 重试逻辑)
 * 2. 编排完整下载流程 (搜索→评分→转存→下载→完成)
 * 3. 更新 local_media 表的 download_status/progress
 * 4. 写入 download_log 历史记录
 * 5. 下载完成后触发 scanner.scanDirectory
 */
import { query } from '../../db';
import { searchResources, saveToDrive } from './quark';
import { addUri, getProgress, getStatus, remove } from './aria2';
import { rankResources, applyPreferenceBonus } from './scorer';
import { filterMatches } from './matcher';
import type { DownloadQueueItem, DownloadStatus } from '../../types';
import type { QuarkResource } from './scorer';

// 重新导出子模块
export { rankResources, applyPreferenceBonus, parseResourceMeta, scoreResource } from './scorer';
export type { QuarkResource, ResourceMeta, ScoredResource } from './scorer';
export { isMatch, filterMatches } from './matcher';
export { searchResources, saveToDrive, testConnection as testQuarkConnection } from './quark';
export { addUri, getProgress, getStatus, remove, pause, unpause, healthCheck as aria2HealthCheck, getGlobalStat } from './aria2';

// ======================== 配置常量 ========================

const MAX_RETRIES = 3;
const PROGRESS_POLL_INTERVAL = 5000; // 5 秒轮询一次进度
const SEARCH_DELAY = 2000; // 搜索间隔, 避免频繁请求

// ======================== 队列状态 ========================

const queue: DownloadQueueItem[] = [];
let activeCount = 0;
let maxConcurrent = 2;
let processing = false;

// ======================== 配置读取 ========================

async function loadConfig(): Promise<{
  maxConcurrent: number;
  minQualityScore: number;
  preferQuality: string;
  downloadDir: string;
}> {
  const rows: any[] = await query(
    "SELECT `key`, `value` FROM config WHERE `key` IN ('max_concurrent_downloads', 'min_quality_score', 'prefer_quality', 'download_dir')"
  );
  const map = new Map(rows.map((r: any) => [r.key, r.value]));
  return {
    maxConcurrent: parseInt(map.get('max_concurrent_downloads') || '2'),
    minQualityScore: parseInt(map.get('min_quality_score') || '25'),
    preferQuality: map.get('prefer_quality') || '4K,BluRay,Remux',
    downloadDir: map.get('download_dir') || '',
  };
}

// ======================== 状态更新 ========================

async function updateDownloadStatus(
  localId: number,
  status: DownloadStatus,
  extra?: { progress?: number; quality?: string; error?: string; url?: string; gid?: string },
): Promise<void> {
  const sets: string[] = ['download_status = ?'];
  const params: any[] = [status];

  if (extra?.progress !== undefined) {
    sets.push('download_progress = ?');
    params.push(extra.progress);
  }
  if (extra?.quality !== undefined) {
    sets.push('download_quality = ?');
    params.push(extra.quality);
  }
  if (extra?.error !== undefined) {
    sets.push('download_error = ?');
    params.push(extra.error);
  }
  if (extra?.url !== undefined) {
    sets.push('download_url = ?');
    params.push(extra.url);
  }
  if (extra?.gid !== undefined) {
    sets.push('aria2_gid = ?');
    params.push(extra.gid);
  }
  if (status === 'searching') {
    sets.push('download_started_at = NOW()');
  }
  if (status === 'downloaded' || status === 'failed') {
    sets.push('download_completed_at = NOW()');
  }

  params.push(localId);
  await query(`UPDATE local_media SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function writeDownloadLog(
  localId: number,
  title: string,
  mediaType: 'movie' | 'tv',
  tmdbId: number | null,
  status: string,
  extra?: { quality?: string; url?: string; fileSize?: number; error?: string; gid?: string; retryCount?: number },
): Promise<void> {
  await query(
    `INSERT INTO download_log (local_id, title, media_type, tmdb_id, quality, source_url, file_size, status, error_msg, aria2_gid, retry_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      localId, title, mediaType, tmdbId,
      extra?.quality || null, extra?.url || null, extra?.fileSize || 0,
      status, extra?.error || null, extra?.gid || null, extra?.retryCount || 0,
    ],
  );
}

// ======================== 核心下载流程 ========================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 处理单个下载任务 (完整流程)
 */
async function processItem(item: DownloadQueueItem): Promise<void> {
  const config = await loadConfig();
  let retryCount = 0;

  const fail = async (error: string) => {
    console.error(`[Download] 任务失败: ${item.title} - ${error}`);
    await updateDownloadStatus(item.localId, 'failed', { error });
    await writeDownloadLog(item.localId, item.title, item.mediaType, item.tmdbId, 'failed', { error, retryCount });
  };

  try {
    // === Step 1: 搜索资源 ===
    await updateDownloadStatus(item.localId, 'searching');
    await writeDownloadLog(item.localId, item.title, item.mediaType, item.tmdbId, 'searching');

    let searchKeyword = item.title;
    if (item.year) searchKeyword += ` ${item.year}`;

    let resources: QuarkResource[] = [];

    // 重试搜索
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        resources = await searchResources(searchKeyword);
        if (resources.length > 0) break;
      } catch (err) {
        console.warn(`[Download] 搜索失败 (第${attempt + 1}次): ${(err as Error).message}`);
        if (attempt < MAX_RETRIES - 1) {
          await delay(SEARCH_DELAY * (attempt + 1));
        }
      }
    }

    if (resources.length === 0) {
      await fail('未找到可用的夸克网盘资源');
      return;
    }

    // === Step 2: 匹配 + 评分 ===
    const matched = filterMatches(item.title, item.year, resources);
    const toScore = matched.length > 0 ? matched : resources; // 无精确匹配时用全部结果

    const scored = applyPreferenceBonus(
      rankResources(toScore as QuarkResource[], config.minQualityScore),
      config.preferQuality,
    );

    if (scored.length === 0) {
      await fail('没有达到最低质量标准的资源');
      return;
    }

    const best = scored[0];
    const qualityDesc = `${best.meta.resolution} ${best.meta.encoding} ${best.meta.audio}`;

    console.log(`[Download] 选定资源: ${best.resource.title} (评分:${best.score}, ${qualityDesc})`);

    // === Step 3: 转存到夸克网盘 ===
    await updateDownloadStatus(item.localId, 'downloading', { quality: qualityDesc, url: best.resource.shareUrl });
    await writeDownloadLog(item.localId, item.title, item.mediaType, item.tmdbId, 'transferring', {
      quality: qualityDesc, url: best.resource.shareUrl, fileSize: best.resource.size,
    });

    const saveResult = await saveToDrive(best.resource.shareUrl);

    if (!saveResult.success || !saveResult.downloadUrl) {
      await fail(`转存失败: ${saveResult.error || '未知原因'}`);
      return;
    }

    // === Step 4: 推送到 Aria2 ===
    const gid = await addUri(saveResult.downloadUrl, {
      dir: config.downloadDir || undefined,
    });

    await updateDownloadStatus(item.localId, 'downloading', {
      gid, quality: qualityDesc, progress: 0,
    });
    await writeDownloadLog(item.localId, item.title, item.mediaType, item.tmdbId, 'downloading', {
      quality: qualityDesc, url: saveResult.downloadUrl, fileSize: best.resource.size, gid,
    });

    // === Step 5: 轮询下载进度 ===
    await pollDownloadProgress(item, gid);

  } catch (err) {
    await fail((err as Error).message);
  }
}

/**
 * 轮询 Aria2 下载进度
 */
async function pollDownloadProgress(item: DownloadQueueItem, gid: string): Promise<void> {
  let lastProgress = 0;
  let staleCount = 0;
  const MAX_STALE = 60; // 连续 60 次无进展 (5分钟) 则认为卡住

  while (true) {
    await delay(PROGRESS_POLL_INTERVAL);

    try {
      const { progress, speed, status } = await getProgress(gid);

      // 下载完成
      if (status === 'complete') {
        await updateDownloadStatus(item.localId, 'downloaded', { progress: 100 });
        await writeDownloadLog(item.localId, item.title, item.mediaType, item.tmdbId, 'completed');
        console.log(`[Download] 下载完成: ${item.title}`);

        // 触发后续处理 (非阻塞)
        triggerPostDownload(item).catch(err =>
          console.error('[Download] 后处理失败:', (err as Error).message)
        );
        return;
      }

      // 下载失败或被移除
      if (status === 'error' || status === 'removed') {
        const detail = await getStatus(gid).catch(() => null);
        const errorMsg = detail?.errorMessage || `Aria2 状态: ${status}`;
        await updateDownloadStatus(item.localId, 'failed', { error: errorMsg });
        await writeDownloadLog(item.localId, item.title, item.mediaType, item.tmdbId, 'failed', { error: errorMsg, gid });
        return;
      }

      // 更新进度
      if (progress !== lastProgress) {
        await updateDownloadStatus(item.localId, 'downloading', { progress });
        lastProgress = progress;
        staleCount = 0;
      } else {
        staleCount++;
        if (staleCount >= MAX_STALE) {
          console.warn(`[Download] 下载疑似卡住: ${item.title}, gid=${gid}`);
          staleCount = 0;
        }
      }
    } catch (err) {
      console.warn(`[Download] 进度查询失败: ${(err as Error).message}`);
      // Aria2 可能暂时不可用, 继续轮询
    }
  }
}

/**
 * 下载完成后的后处理
 */
async function triggerPostDownload(item: DownloadQueueItem): Promise<void> {
  const config = await loadConfig();
  const scanDir = config.downloadDir;

  if (scanDir) {
    console.log(`[Download] 触发目录扫描: ${scanDir}`);
    // 动态导入 scanner 避免循环依赖
    try {
      const { scanDirectory } = await import('../scanner');
      const scanResult = await scanDirectory(scanDir);
      console.log(`[Download] 扫描结果: 新增${scanResult.added}, 更新${scanResult.updated}`);
    } catch (err) {
      console.error('[Download] 扫描失败:', (err as Error).message);
    }
  }
}

// ======================== 队列调度 ========================

/**
 * 处理队列中的下一个任务
 */
async function processNext(): Promise<void> {
  if (processing) return;
  processing = true;

  const config = await loadConfig();
  maxConcurrent = config.maxConcurrent;

  while (queue.length > 0 && activeCount < maxConcurrent) {
    const item = queue.shift()!;
    activeCount++;

    processItem(item)
      .catch(err => console.error('[Download] 未捕获的错误:', (err as Error).message))
      .finally(() => {
        activeCount--;
        processNext();
      });

    // 搜索间隔
    if (queue.length > 0) {
      await delay(SEARCH_DELAY);
    }
  }

  processing = false;
}

// ======================== 公共 API ========================

/**
 * 将影视加入下载队列
 */
export async function enqueue(
  localId: number,
  title: string,
  year: number | null,
  mediaType: 'movie' | 'tv',
  tmdbId: number | null,
): Promise<{ queued: boolean; message: string }> {
  // 检查是否已在队列中
  if (queue.some(q => q.localId === localId)) {
    return { queued: false, message: '已在下载队列中' };
  }

  // 检查当前状态
  const rows: any[] = await query('SELECT download_status FROM local_media WHERE id = ?', [localId]);
  if (rows.length === 0) {
    return { queued: false, message: '本地记录不存在' };
  }

  const currentStatus = rows[0].download_status;
  if (['pending', 'searching', 'downloading'].includes(currentStatus)) {
    return { queued: false, message: `当前状态: ${currentStatus}, 无法重复添加` };
  }

  // 加入队列
  const item: DownloadQueueItem = {
    localId, title, year, mediaType, tmdbId,
    enqueuedAt: Date.now(),
  };
  queue.push(item);

  await updateDownloadStatus(localId, 'pending');
  await writeDownloadLog(localId, title, mediaType, tmdbId, 'searching');

  console.log(`[Download] 加入队列: ${title} (队列长度: ${queue.length})`);

  // 触发队列处理 (非阻塞)
  processNext().catch(err =>
    console.error('[Download] 队列处理异常:', (err as Error).message)
  );

  return { queued: true, message: '已加入下载队列, 正在搜索资源...' };
}

/**
 * 批量加入队列
 */
export async function enqueueBatch(
  items: Array<{ localId: number; title: string; year: number | null; mediaType: 'movie' | 'tv'; tmdbId: number | null }>,
): Promise<{ queued: number; skipped: number; messages: string[] }> {
  let queued = 0;
  let skipped = 0;
  const messages: string[] = [];

  for (const item of items) {
    const result = await enqueue(item.localId, item.title, item.year, item.mediaType, item.tmdbId);
    if (result.queued) queued++;
    else skipped++;
    messages.push(`${item.title}: ${result.message}`);
  }

  return { queued, skipped, messages };
}

/**
 * 取消下载任务
 */
export async function cancel(localId: number): Promise<{ success: boolean; message: string }> {
  // 从队列中移除
  const idx = queue.findIndex(q => q.localId === localId);
  if (idx >= 0) {
    queue.splice(idx, 1);
    await updateDownloadStatus(localId, 'none');
    return { success: true, message: '已从队列中移除' };
  }

  // 如果正在下载, 取消 Aria2 任务
  const rows: any[] = await query('SELECT aria2_gid, download_status FROM local_media WHERE id = ?', [localId]);
  if (rows.length > 0 && rows[0].aria2_gid && rows[0].download_status === 'downloading') {
    try {
      await remove(rows[0].aria2_gid);
      await updateDownloadStatus(localId, 'failed', { error: '用户取消' });
      return { success: true, message: '已取消下载' };
    } catch (err) {
      return { success: false, message: `取消失败: ${(err as Error).message}` };
    }
  }

  return { success: false, message: '该任务不在下载队列中' };
}

/**
 * 重试失败的下载
 */
export async function retry(localId: number): Promise<{ queued: boolean; message: string }> {
  const rows: any[] = await query(
    'SELECT title, year, media_type, tmdb_id, download_status FROM local_media WHERE id = ?',
    [localId],
  );
  if (rows.length === 0) return { queued: false, message: '记录不存在' };

  const row = rows[0];
  if (row.download_status !== 'failed') {
    return { queued: false, message: '只能重试失败的任务' };
  }

  // 清除失败状态, 重新入队
  await updateDownloadStatus(localId, 'none', { error: '' });
  return enqueue(localId, row.title, row.year, row.media_type, row.tmdb_id);
}

/**
 * 获取队列状态
 */
export function getQueueStatus(): {
  queueLength: number;
  activeCount: number;
  maxConcurrent: number;
  items: Array<{ localId: number; title: string; enqueuedAt: number }>;
} {
  return {
    queueLength: queue.length,
    activeCount,
    maxConcurrent,
    items: queue.map(q => ({ localId: q.localId, title: q.title, enqueuedAt: q.enqueuedAt })),
  };
}

/**
 * 获取单个影视的下载状态
 */
export async function getDownloadStatus(localId: number): Promise<{
  download_status: DownloadStatus;
  download_progress: number;
  download_quality: string | null;
  download_error: string | null;
  download_url: string | null;
  estimated_time?: string;
} | null> {
  const rows: any[] = await query(
    'SELECT download_status, download_progress, download_quality, download_error, download_url, file_size, aria2_gid FROM local_media WHERE id = ?',
    [localId],
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  const result: any = {
    download_status: row.download_status,
    download_progress: row.download_progress || 0,
    download_quality: row.download_quality,
    download_error: row.download_error,
    download_url: row.download_url,
  };

  // 估算剩余时间
  if (row.download_status === 'downloading' && row.aria2_gid) {
    try {
      const { progress, speed } = await getProgress(row.aria2_gid);
      if (speed > 0 && progress < 100) {
        const remainingBytes = (1 - progress / 100) * (row.file_size || 0);
        const remainingSec = remainingBytes / speed;
        if (remainingSec < 60) {
          result.estimated_time = `约 ${Math.ceil(remainingSec)} 秒`;
        } else if (remainingSec < 3600) {
          result.estimated_time = `约 ${Math.ceil(remainingSec / 60)} 分钟`;
        } else {
          result.estimated_time = `约 ${(remainingSec / 3600).toFixed(1)} 小时`;
        }
      }
    } catch { /* 静默 */ }
  }

  return result;
}

/**
 * 获取下载历史日志
 */
export async function getDownloadLog(limit: number = 50): Promise<any[]> {
  return query(
    'SELECT * FROM download_log ORDER BY started_at DESC LIMIT ?',
    [limit],
  );
}
