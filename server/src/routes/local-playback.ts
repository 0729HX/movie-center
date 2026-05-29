import { Router } from 'express';
import { query } from '../db';
import { playWithPotPlayer } from '../services/player';
import { badRequest, notFound, internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse } from '../types/api';

const router = Router();

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

export default router;
