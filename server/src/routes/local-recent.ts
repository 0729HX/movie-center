import { Router } from 'express';
import { query } from '../db';
import { cacheGet } from '../services/cache';
import { internalError } from '../middleware/errorHandler';
import type { TypedResponse, LocalMediaItem } from '../types/api';

const router = Router();

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
