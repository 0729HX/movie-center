/**
 * Aria2Client -- Aria2 JSON-RPC 客户端
 *
 * 依赖配置: aria2_rpc_url, aria2_rpc_secret, download_dir
 * 使用 Aria2 JSON-RPC 协议控制下载任务
 */
import { query } from '../../db';

interface Aria2Config {
  rpcUrl: string;
  secret: string;
  downloadDir: string;
}

export interface Aria2Status {
  gid: string;
  status: 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed';
  totalLength: string;
  completedLength: string;
  downloadSpeed: string;
  errorCode?: string;
  errorMessage?: string;
  files: Array<{
    index: string;
    path: string;
    length: string;
    completedLength: string;
  }>;
}

async function getConfig(): Promise<Aria2Config> {
  const rows: any[] = await query(
    "SELECT `key`, `value` FROM config WHERE `key` IN ('aria2_rpc_url', 'aria2_rpc_secret', 'download_dir')"
  );
  const map = new Map(rows.map((r: any) => [r.key, r.value]));
  return {
    rpcUrl: map.get('aria2_rpc_url') || 'http://localhost:6800/jsonrpc',
    secret: map.get('aria2_rpc_secret') || '',
    downloadDir: map.get('download_dir') || '',
  };
}

/**
 * 调用 Aria2 JSON-RPC
 */
async function aria2Call<T>(method: string, params: any[] = []): Promise<T> {
  const config = await getConfig();

  // 如果配置了 secret, 加入 token 前缀
  const fullParams = config.secret
    ? [`token:${config.secret}`, ...params]
    : params;

  const res = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method: `aria2.${method}`,
      params: fullParams,
    }),
  });

  if (!res.ok) {
    throw new Error(`Aria2 RPC 请求失败: ${res.status}`);
  }

  const data = await res.json() as any;
  if (data.error) {
    throw new Error(`Aria2 错误 [${data.error.code}]: ${data.error.message}`);
  }

  return data.result as T;
}

// ======================== 下载控制 ========================

/**
 * 添加下载任务
 *
 * @param uri 下载直链
 * @param options 额外选项 (文件名/目录等)
 * @returns Aria2 GID (任务标识)
 */
export async function addUri(uri: string, options?: { dir?: string; filename?: string }): Promise<string> {
  const config = await getConfig();
  const aria2Options: Record<string, string> = {};

  if (options?.dir) {
    aria2Options.dir = options.dir;
  } else if (config.downloadDir) {
    aria2Options.dir = config.downloadDir;
  }

  if (options?.filename) {
    aria2Options.out = options.filename;
  }

  // 设置并发连接数和分片数, 提升下载速度
  aria2Options['max-connection-per-server'] = '16';
  aria2Options['split'] = '16';
  aria2Options['min-split-size'] = '10M';
  aria2Options['continue'] = 'true';
  aria2Options['auto-file-renaming'] = 'true';
  aria2Options['allow-overwrite'] = 'true';

  const gid = await aria2Call<string>('addUri', [[uri], aria2Options]);
  console.log(`[Aria2] 添加下载任务: gid=${gid}, dir=${aria2Options.dir || 'default'}`);
  return gid;
}

/**
 * 查询下载任务状态
 */
export async function getStatus(gid: string): Promise<Aria2Status> {
  return aria2Call<Aria2Status>('tellStatus', [gid]);
}

/**
 * 获取下载进度百分比
 */
export async function getProgress(gid: string): Promise<{ progress: number; speed: number; status: string }> {
  try {
    const status = await getStatus(gid);
    const total = parseInt(status.totalLength) || 0;
    const completed = parseInt(status.completedLength) || 0;
    const speed = parseInt(status.downloadSpeed) || 0;
    const progress = total > 0 ? (completed / total) * 100 : 0;

    return {
      progress: Math.round(progress * 10) / 10,
      speed,
      status: status.status,
    };
  } catch {
    return { progress: 0, speed: 0, status: 'unknown' };
  }
}

/**
 * 暂停下载任务
 */
export async function pause(gid: string): Promise<string> {
  return aria2Call<string>('pause', [gid]);
}

/**
 * 恢复下载任务
 */
export async function unpause(gid: string): Promise<string> {
  return aria2Call<string>('unpause', [gid]);
}

/**
 * 取消下载任务
 */
export async function remove(gid: string): Promise<string> {
  return aria2Call<string>('remove', [gid]);
}

/**
 * 获取全局统计信息
 */
export async function getGlobalStat(): Promise<{
  downloadSpeed: string;
  uploadSpeed: string;
  numActive: string;
  numWaiting: string;
  numStopped: string;
}> {
  return aria2Call<any>('getGlobalStat');
}

// ======================== 健康检查 ========================

/**
 * 检查 Aria2 是否可用
 */
export async function healthCheck(): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const version = await aria2Call<string>('getVersion');
    return { available: true, version };
  } catch (err) {
    return { available: false, error: (err as Error).message };
  }
}
