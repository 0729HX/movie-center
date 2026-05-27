import { Router } from 'express';
import fs from 'fs/promises';
import { query } from '../db';
import { scanDirectory, getLocalMediaList, addToLocal, removeFromLocal } from '../services/scanner';
import { playWithPotPlayer } from '../services/player';
import { getDetail, getDetailFull, getCredits, getRecommendations, searchMedia } from '../services/tmdb';
import { cacheGet, cacheDel } from '../services/cache';
import { badRequest, notFound, internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse, LocalMediaItem } from '../types/api';

const router = Router();

// 收藏/取消收藏后，清除受影响缓存
function invalidateCaches(mediaType?: string, tmdbId?: number) {
  cacheDel('trending');
  cacheDel('movies:*');
  cacheDel('tv:*');
  if (mediaType && tmdbId) {
    cacheDel(`detail:${mediaType}:${tmdbId}`);
  }
}

// ======================== 全量预缓存 ========================

/**
 * 后台异步预热所有本地影视的 TMDB 详情缓存
 * - 有 TMDB ID → 直接预热 getDetail + getCredits + getRecommendations
 * - 无 TMDB ID → 标题搜索 TMDB → 匹配成功则预热 + 回写 tmdb_id
 * - 限制并发数，不阻塞主流程
 */
async function preCacheAllLocalDetails(items: LocalMediaItem[]) {
  const withTmdb = items.filter((i) => i.tmdb_id && i.tmdb_id > 0);
  const withoutTmdb = items.filter((i) => !i.tmdb_id || i.tmdb_id <= 0);

  console.log(`[PreCache] 开始预热 ${items.length} 个本地影视 (有TMDB:${withTmdb.length} 无TMDB:${withoutTmdb.length})`);

  // 1. 有 TMDB ID 的 → 使用 append_to_response 合并为单次请求，并发 5
  let done = 0;
  const CONCURRENCY = 5;
  for (let i = 0; i < withTmdb.length; i += CONCURRENCY) {
    const batch = withTmdb.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (item) => {
        try {
          // 先查 Redis 是否已有缓存，有则跳过
          const cacheKey = `detail:${item.media_type}:${item.tmdb_id}`;
          const cached = await cacheGet(cacheKey);
          if (cached) return;
          // 单次请求获取 detail + credits + recommendations
          await getDetailFull(item.media_type, item.tmdb_id!);
        } catch { /* 单个失败不影响整体 */ }
        done++;
      })
    );
  }

  // 2. 无 TMDB ID 的 → 标题搜索匹配后预热，并发 3
  if (withoutTmdb.length > 0) {
    const SEARCH_CONCURRENCY = 3;
    for (let i = 0; i < withoutTmdb.length; i += SEARCH_CONCURRENCY) {
      const batch = withoutTmdb.slice(i, i + SEARCH_CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (item) => {
          try {
            let searchText = item.title;
            if (item.year) searchText += ` ${item.year}`;
            const { items: results } = await searchMedia(searchText, 1);

            const match = results.find((r) => {
              const titleMatch = r.title.toLowerCase() === item.title.toLowerCase();
              const yearMatch = !item.year || r.year === String(item.year);
              return titleMatch || (r.title.includes(item.title.slice(0, 6)) && yearMatch);
            }) || results[0];

            if (match && match.tmdbId > 0) {
              // 单次请求获取 detail + credits + recommendations
              await getDetailFull(item.media_type, match.tmdbId);
              // 回写 TMDB ID
              await query('UPDATE local_media SET tmdb_id = ? WHERE id = ?', [match.tmdbId, item.id]);
            }
          } catch { /* skip */ }
          done++;
        })
      );
    }
  }

  console.log(`[PreCache] 预热完成: ${done}/${items.length}`);
}

// ======================== 路由 ========================

// 获取本地媒体列表 — 返回后异步预热全部详情
router.get('/', async (_req, res: TypedResponse<{ items: LocalMediaItem[] }>) => {
  try {
    const rawItems = await getLocalMediaList();
    // 解析 JSON 字段
    const items = rawItems.map((item: any) => ({
      ...item,
      nfo_ratings: item.nfo_ratings ? (typeof item.nfo_ratings === 'string' ? JSON.parse(item.nfo_ratings) : item.nfo_ratings) : null,
      stream_info: item.stream_info ? (typeof item.stream_info === 'string' ? JSON.parse(item.stream_info) : item.stream_info) : null,
      clearlogo_path: item.clearlogo_path || null,
    }));

    // 海报回退：poster_path 为空但有 tmdb_id 的，尝试从 Redis 缓存取 TMDB 海报
    const needPoster = items.filter((i) => !i.poster_path && i.tmdb_id && i.tmdb_id > 0);
    if (needPoster.length > 0) {
      await Promise.allSettled(needPoster.map(async (item) => {
        try {
          const cacheKey = `detail:${item.media_type}:${item.tmdb_id}`;
          const cached: any = await cacheGet(cacheKey);
          if (cached?.posterPath) {
            item.poster_path = cached.posterPath;
          }
        } catch { /* skip */ }
      }));
    }

    res.json({ items });

    // 后台异步预热所有详情缓存（不阻塞响应）
    if (items.length > 0) {
      preCacheAllLocalDetails(items).catch(err =>
        console.error('[PreCache] 预热异常:', err.message)
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Local list error:', message);
    throw internalError('获取本地媒体失败');
  }
});

// 扫描媒体目录
router.post('/scan', async (req: TypedRequest<Record<string, string>, { path?: string }>, res: TypedResponse<Record<string, unknown>>) => {
  try {
    let rootPath = req.body.path;

    if (!rootPath) {
      const rows: any[] = await query('SELECT `value` FROM config WHERE `key` = ?', ['media_root']);
      rootPath = rows[0]?.value;
    }

    if (!rootPath) {
      throw badRequest('请提供媒体目录路径，或在设置中配置 media_root');
    }

    const result = await scanDirectory(rootPath);

    // 扫描完成后，异步预热新发现/更新的 TMDB 详情（单次请求/项）
    if (result.tmdbItems.length > 0) {
      const uniqueItems = result.tmdbItems.filter(
        (v, i, a) => a.findIndex(t => t.tmdbId === v.tmdbId && t.mediaType === v.mediaType) === i
      );
      Promise.allSettled(
        uniqueItems.map(item => getDetailFull(item.mediaType, item.tmdbId).catch(() => {}))
      ).then(() => {
        console.log(`[PreCache] 扫描预热完成: ${uniqueItems.length} 个详情`);
      });
    }

    invalidateCaches();

    res.json({
      ...result,
      message: `新增 ${result.added}，更新 ${result.updated}，跳过 ${result.skipped}，错误 ${result.errors.length}`,
    });
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Scan error:', message);
    throw internalError(`扫描失败: ${message}`);
  }
});

// 从 TMDB 添加到本地收藏
router.post('/save', async (req: TypedRequest<Record<string, string>, { tmdb_id: number; media_type: string; title?: string }>, res: TypedResponse<{ id: number; success: boolean }>) => {
  try {
    const { tmdb_id, media_type, title } = req.body;
    if (!tmdb_id || !media_type) {
      throw badRequest('缺少必要参数');
    }
    const type = media_type as 'movie' | 'tv';
    const id = await addToLocal(tmdb_id, type, title ?? '');
    invalidateCaches(type, tmdb_id);

    // 后台预热该影片的详情缓存（单次请求）
    getDetailFull(type, tmdb_id).catch(() => {});

    res.json({ id, success: true });
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Save error:', message);
    throw internalError(`保存失败: ${message}`);
  }
});

// 从本地删除 — ?deleteFiles=true 时同时删除磁盘文件夹，否则仅移除记录
router.delete('/:id', async (req: TypedRequest<{ id: string }>, res: TypedResponse<{ success: boolean }>) => {
  try {
    const id = parseInt(req.params.id);
    const deleteFiles = req.query.deleteFiles === 'true';
    const rows: any[] = await query(
      'SELECT tmdb_id, media_type, local_path, poster_path, backdrop_path FROM local_media WHERE id = ?',
      [id]
    );
    if (rows.length === 0) return res.json({ success: false });

    const row = rows[0];
    const ok = await removeFromLocal(id);

    // 删除影视文件夹（仅 deleteFiles=true 时执行）
    if (ok && deleteFiles && row.local_path) {
      try {
        const path = await import('path');
        const videoDir = path.dirname(row.local_path);
        // 如果 videoDir 下有 season 子目录，说明是剧集结构，删上一级
        let dirToDelete = videoDir;
        const parentDir = path.dirname(videoDir);
        const dirName = path.basename(videoDir).toLowerCase();
        if (dirName.startsWith('season')) {
          dirToDelete = parentDir;
        }
        await fs.rm(dirToDelete, { recursive: true, force: true });
        console.log(`[Delete] 已删除文件夹: ${dirToDelete}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '未知错误';
        console.error(`[Delete] 文件夹删除失败: ${message}`);
      }
    }

    if (ok) invalidateCaches(row.media_type, row.tmdb_id);
    res.json({ success: ok });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Delete error:', message);
    throw internalError('删除失败');
  }
});

// 本地影视详情（含 TMDB 元数据匹配）
router.get('/detail/:id', async (req: TypedRequest<{ id: string }>, res: TypedResponse<Record<string, unknown>>) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw badRequest('无效的 ID');

    const rows: any[] = await query('SELECT * FROM local_media WHERE id = ?', [id]);
    if (rows.length === 0) throw notFound('未找到该本地媒体');

    const local = rows[0];
    let detail: any = null;

    // 如果有 TMDB ID，单次请求获取详情+演员+推荐（通常已预热，Redis 命中 <10ms）
    if (local.tmdb_id && local.tmdb_id > 0) {
      const full = await getDetailFull(local.media_type, local.tmdb_id);
      if (full) {
        detail = { ...full.detail, credits: full.credits, recommendations: full.recommendations };
      }
    }

    // 没有 TMDB ID → 按标题+年份搜索 TMDB
    if (!detail) {
      let searchText = local.title;
      if (local.year) searchText += ` ${local.year}`;
      const { items: results } = await searchMedia(searchText, 1);

      const match = results.find((r) => {
        const titleMatch = r.title.toLowerCase() === local.title.toLowerCase();
        const yearMatch = !local.year || r.year === String(local.year);
        return titleMatch || (r.title.includes(local.title.slice(0, 6)) && yearMatch);
      }) || results[0];

      if (match) {
        const full = await getDetailFull(local.media_type, match.tmdbId);
        if (full) detail = { ...full.detail, credits: full.credits, recommendations: full.recommendations };

        if (match.tmdbId > 0) {
          await query('UPDATE local_media SET tmdb_id = ? WHERE id = ?', [match.tmdbId, id]);
        }
      }
    }

    // NFO 本地数据（评分、流媒体信息、clearlogo）
    const nfoRatings = local.nfo_ratings ? (typeof local.nfo_ratings === 'string' ? JSON.parse(local.nfo_ratings) : local.nfo_ratings) : [];
    const streamInfo = local.stream_info ? (typeof local.stream_info === 'string' ? JSON.parse(local.stream_info) : local.stream_info) : null;
    const clearlogoUrl = local.clearlogo_path ? `/api/local/file?path=${encodeURIComponent(local.clearlogo_path)}` : null;

    if (!detail) {
      return res.json({
        id: local.id,
        tmdbId: 0,
        title: local.title,
        overview: '',
        posterPath: local.poster_path ? `/api/local/file?path=${encodeURIComponent(local.poster_path)}` : null,
        backdropPath: local.backdrop_path ? `/api/local/file?path=${encodeURIComponent(local.backdrop_path)}` : null,
        year: String(local.year || ''),
        mediaType: local.media_type,
        ratings: [],
        genres: [],
        runtime: 0,
        status: '',
        tagline: '',
        isLocal: true,
        localPath: local.local_path,
        localId: local.id,
        nfoRatings,
        streamInfo,
        clearlogoPath: clearlogoUrl,
      });
    }

    detail.isLocal = true;
    detail.localId = local.id;
    detail.localPath = local.local_path;
    detail.nfoRatings = nfoRatings;
    detail.streamInfo = streamInfo;
    detail.clearlogoPath = clearlogoUrl;

    if (local.poster_path) {
      detail.posterPath = `/api/local/file?path=${encodeURIComponent(local.poster_path)}`;
    }
    if (local.backdrop_path) {
      detail.backdropPath = `/api/local/file?path=${encodeURIComponent(local.backdrop_path)}`;
    }

    res.json(detail);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Local detail error:', message);
    throw internalError('获取本地详情失败');
  }
});

// 播放本地媒体（同时更新 last_played_at）
router.post('/play/:id', async (req: TypedRequest<{ id: string }>, res: TypedResponse<Record<string, unknown>>) => {
  try {
    const id = parseInt(req.params.id);
    const rows: any[] = await query('SELECT local_path FROM local_media WHERE id = ?', [id]);

    if (rows.length === 0) {
      throw notFound('未找到该媒体');
    }

    // 更新最后播放时间
    await query('UPDATE local_media SET last_played_at = NOW() WHERE id = ?', [id]);

    const result = await playWithPotPlayer(rows[0].local_path);
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Play error:', message);
    throw internalError(`播放失败: ${message}`);
  }
});

// 上报播放进度
router.post('/progress', async (req: TypedRequest<Record<string, unknown>, { id: number; seconds: number }>, res: TypedResponse<{ success: boolean }>) => {
  try {
    const { id, seconds } = req.body;
    if (!id || typeof seconds !== 'number') {
      throw badRequest('缺少必要参数 id 或 seconds');
    }
    await query('UPDATE local_media SET play_progress = ? WHERE id = ?', [Math.max(0, Math.floor(seconds)), id]);
    res.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Progress error:', message);
    throw internalError('更新进度失败');
  }
});

// 最近观看（继续观看）
router.get('/recently-watched', async (_req, res: TypedResponse<{ items: LocalMediaItem[] }>) => {
  try {
    const rawItems: any[] = await query(
      'SELECT * FROM local_media WHERE last_played_at IS NOT NULL ORDER BY last_played_at DESC LIMIT 10'
    );

    const items = rawItems.map((item: any) => ({
      ...item,
      nfo_ratings: item.nfo_ratings ? (typeof item.nfo_ratings === 'string' ? JSON.parse(item.nfo_ratings) : item.nfo_ratings) : null,
      stream_info: item.stream_info ? (typeof item.stream_info === 'string' ? JSON.parse(item.stream_info) : item.stream_info) : null,
      clearlogo_path: item.clearlogo_path || null,
    }));

    // 海报回退
    const needPoster = items.filter((i) => !i.poster_path && i.tmdb_id && i.tmdb_id > 0);
    if (needPoster.length > 0) {
      await Promise.allSettled(needPoster.map(async (item) => {
        try {
          const cacheKey = `detail:${item.media_type}:${item.tmdb_id}`;
          const cached: any = await cacheGet(cacheKey);
          if (cached?.posterPath) {
            item.poster_path = cached.posterPath;
          }
        } catch { /* skip */ }
      }));
    }

    res.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Recently watched error:', message);
    throw internalError('获取最近观看失败');
  }
});

export default router;
