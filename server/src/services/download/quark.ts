/**
 * QuarkService -- 夸克网盘 API 封装
 *
 * 依赖配置: quark_cookie, quark_target_dir
 * 夸克网盘 API 全部基于 Cookie 鉴权, 无需 OAuth
 */
import { query } from '../../db';
import type { QuarkResource } from './scorer';

const QUARK_API_BASE = 'https://drive-pc.quark.cn/1/clouddrive';

interface QuarkConfig {
  cookie: string;
  targetDir: string;
}

async function getConfig(): Promise<QuarkConfig> {
  const rows: any[] = await query(
    "SELECT `key`, `value` FROM config WHERE `key` IN ('quark_cookie', 'quark_target_dir')"
  );
  const map = new Map(rows.map((r: any) => [r.key, r.value]));
  return {
    cookie: map.get('quark_cookie') || '',
    targetDir: map.get('quark_target_dir') || '/影视',
  };
}

/**
 * 通用夸克 API 请求封装
 */
async function quarkFetch<T>(url: string, config: QuarkConfig, init?: RequestInit): Promise<T> {
  if (!config.cookie) {
    throw new Error('夸克网盘 Cookie 未配置, 请在设置中填写');
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': config.cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`夸克 API 请求失败: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as any;
  if (data.code !== 0 && data.status !== 200) {
    throw new Error(`夸克 API 错误: ${data.message || JSON.stringify(data)}`);
  }

  return data as T;
}

// ======================== 搜索功能 ========================

/**
 * 从分享链接中提取 share_id
 * 支持格式: https://pan.quark.cn/s/xxxxxx
 */
function extractShareId(url: string): string | null {
  const match = url.match(/pan\.quark\.cn\/s\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * 搜索夸克网盘资源
 *
 * 使用第三方聚合搜索 API 搜索公开分享的夸克网盘资源
 * 返回文件列表, 包含标题/大小/分享链接
 */
export async function searchResources(keyword: string): Promise<QuarkResource[]> {
  const config = await getConfig();
  const resources: QuarkResource[] = [];

  // 方式1: 通过夸克官方搜索 (需要 cookie)
  try {
    const searchResult = await quarkFetch<any>(
      `${QUARK_API_BASE}/file/search?pr=ucpro&fr=pc`,
      config,
      {
        method: 'POST',
        body: JSON.stringify({
          keyword,
          page: 1,
          size: 20,
          _sort: 'file_type',
          _order: 'desc',
        }),
      }
    );

    if (searchResult?.data?.list) {
      for (const item of searchResult.data.list) {
        resources.push({
          title: item.file_name || item.name || '',
          size: item.size || item.file_size || 0,
          shareUrl: item.share_url || item.share_link || '',
          fid: item.fid || item.file_id || '',
        });
      }
    }
  } catch (err) {
    console.warn('[Quark] 官方搜索失败:', (err as Error).message);
  }

  // 方式2: 通过第三方聚合搜索 (备用)
  if (resources.length === 0) {
    try {
      const backupResources = await searchViaAggregator(keyword);
      resources.push(...backupResources);
    } catch (err) {
      console.warn('[Quark] 聚合搜索也失败:', (err as Error).message);
    }
  }

  return resources;
}

/**
 * 第三方聚合搜索 (备用方案)
 * 接入网盘资源聚合搜索 API
 */
async function searchViaAggregator(keyword: string): Promise<QuarkResource[]> {
  // 可接入的聚合搜索源, 需要根据实际情况配置
  const AGGREGATOR_URLS: string[] = [
    // 'https://api.example.com/search',  // 替换为实际的聚合搜索 API
  ];

  for (const url of AGGREGATOR_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, type: 'quark' }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        return (data.results || []).map((r: any) => ({
          title: r.title || '',
          size: r.size || 0,
          shareUrl: r.url || r.shareUrl || '',
          fid: r.fid || '',
        }));
      }
    } catch { /* try next source */ }
  }

  return [];
}

// ======================== 转存功能 ========================

/**
 * 转存分享资源到自己的夸克网盘
 *
 * 步骤:
 * 1. 解析分享链接, 获取 share_id + pwd
 * 2. 获取 stoken
 * 3. 获取分享文件列表
 * 4. 执行转存到目标目录
 * 5. 返回转存后的文件 fid
 */
export async function saveToDrive(shareUrl: string): Promise<{
  success: boolean;
  fid?: string;
  downloadUrl?: string;
  error?: string;
}> {
  const config = await getConfig();

  try {
    // 1. 提取 share_id
    const shareId = extractShareId(shareUrl);
    if (!shareId) {
      return { success: false, error: '无法解析分享链接' };
    }

    // 2. 获取 stoken
    const shareInfo = await quarkFetch<any>(
      `${QUARK_API_BASE}/share/sharepage/token?pr=ucpro&fr=pc`,
      config,
      {
        method: 'POST',
        body: JSON.stringify({ pwd_id: shareId, passcode: '' }),
      }
    );

    const stoken = shareInfo?.data?.stoken;
    if (!stoken) {
      return { success: false, error: '获取分享 token 失败, 链接可能已失效' };
    }

    // 3. 获取分享文件列表
    const fileList = await quarkFetch<any>(
      `${QUARK_API_BASE}/share/sharepage/detail?pr=ucpro&fr=pc&pwd_id=${shareId}&stoken=${encodeURIComponent(stoken)}&force=0`,
      config
    );

    const files = fileList?.data?.list || [];
    if (files.length === 0) {
      return { success: false, error: '分享链接中没有文件' };
    }

    // 4. 获取目标目录的 fid (如果需要)
    let targetFid = '0'; // 默认根目录
    if (config.targetDir && config.targetDir !== '/') {
      targetFid = await getOrCreateDir(config.targetDir, config);
    }

    // 5. 执行转存
    const saveResult = await quarkFetch<any>(
      `${QUARK_API_BASE}/share/sharepage/save?pr=ucpro&fr=pc`,
      config,
      {
        method: 'POST',
        body: JSON.stringify({
          fid_list: files.map((f: any) => f.fid),
          fid_token_list: files.map((f: any) => f.share_fid_token),
          to_pdir_fid: targetFid,
          pwd_id: shareId,
          stoken,
          pdir_fid: '0',
          scene: 'link',
        }),
      }
    );

    const savedFids = saveResult?.data?.save_as?.save_as_top_fids || [];
    if (savedFids.length === 0) {
      return { success: false, error: '转存失败' };
    }

    // 6. 获取下载直链
    const downloadUrl = await getDownloadUrl(savedFids[0], config);

    return {
      success: true,
      fid: savedFids[0],
      downloadUrl,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 获取或创建网盘目录
 */
async function getOrCreateDir(dirPath: string, config: QuarkConfig): Promise<string> {
  const parts = dirPath.split('/').filter(Boolean);
  let currentFid = '0';

  for (const part of parts) {
    try {
      // 尝试查找子目录
      const listResult = await quarkFetch<any>(
        `${QUARK_API_BASE}/file/sort?pr=ucpro&fr=pc`,
        config,
        {
          method: 'POST',
          body: JSON.stringify({
            pdir_fid: currentFid,
            _page: 1,
            _size: 100,
            _sort: 'file_type:asc',
          }),
        }
      );

      const items = listResult?.data?.list || [];
      const existing = items.find((item: any) =>
        item.file_name === part && item.file_type === 0
      );

      if (existing) {
        currentFid = existing.fid;
      } else {
        // 创建目录
        const createResult = await quarkFetch<any>(
          `${QUARK_API_BASE}/file?pr=ucpro&fr=pc`,
          config,
          {
            method: 'POST',
            body: JSON.stringify({
              pdir_fid: currentFid,
              file_name: part,
              dir_path: '',
              dir_init_lock: false,
            }),
          }
        );
        currentFid = createResult?.data?.fid || currentFid;
      }
    } catch (err) {
      console.warn(`[Quark] 处理目录 ${part} 失败:`, (err as Error).message);
      break;
    }
  }

  return currentFid;
}

/**
 * 获取夸克网盘文件的下载直链
 */
async function getDownloadUrl(fid: string, config: QuarkConfig): Promise<string | undefined> {
  try {
    const result = await quarkFetch<any>(
      `${QUARK_API_BASE}/file/v2/download?pr=ucpro&fr=pc`,
      config,
      {
        method: 'POST',
        body: JSON.stringify({ fids: [fid] }),
      }
    );
    return result?.data?.[0]?.download_url || undefined;
  } catch {
    return undefined;
  }
}

// ======================== 连接测试 ========================

/**
 * 测试夸克 Cookie 是否有效
 */
export async function testConnection(): Promise<{ success: boolean; message: string; nickname?: string }> {
  const config = await getConfig();
  if (!config.cookie) {
    return { success: false, message: 'Cookie 未配置' };
  }

  try {
    const result = await quarkFetch<any>(
      `${QUARK_API_BASE}/member/info?pr=ucpro&fr=pc`,
      config
    );
    const nickname = result?.data?.nickname || '已连接';
    return { success: true, message: `连接成功: ${nickname}`, nickname };
  } catch (err) {
    return { success: false, message: `连接失败: ${(err as Error).message}` };
  }
}
