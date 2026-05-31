import { Router } from 'express';
import { query } from '../db';
import { getOmdbUsageStats } from '../services/tmdb';
import { internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse, ConfigResponse, OmdbUsageStat } from '../types/api';

const router = Router();

// 获取所有配置
router.get('/', async (_req, res: TypedResponse<ConfigResponse>) => {
  try {
    const rows: any[] = await query('SELECT `key`, `value` FROM config');
    const config: ConfigResponse = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }
    res.json(config);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Config error:', message);
    throw internalError('获取配置失败');
  }
});

// OMDb 用量统计
router.get('/omdb-usage', async (_req, res: TypedResponse<OmdbUsageStat[]>) => {
  try {
    const stats = await getOmdbUsageStats();
    res.json(stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('OMDB usage error:', message);
    throw internalError('获取 OMDb 用量失败');
  }
});

// 更新配置
router.put('/', async (req: TypedRequest<Record<string, string>, Record<string, string>>, res: TypedResponse<{ success: boolean }>) => {
  try {
    const updates: Record<string, string> = req.body;
    const allowedKeys = [
      'potplayer_path', 'media_root', 'tmdb_api_key', 'omdb_api_key',
      'opensubtitles_api_key', 'tmm_path', 'tmm_args', 'watch_dir', 'output_dir',
      // 下载相关
      'quark_cookie', 'quark_target_dir', 'aria2_rpc_url', 'aria2_rpc_secret',
      'download_dir', 'max_concurrent_downloads', 'min_quality_score', 'prefer_quality',
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
        await query(
          'INSERT INTO config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
          [key, value, value]
        );
      }
    }

    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Config update error:', message);
    throw internalError('更新配置失败');
  }
});

export default router;
