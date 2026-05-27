import { Router } from 'express';
import { getTrending } from '../services/tmdb';
import { cacheGet, cacheSet } from '../services/cache';
import { internalError } from '../middleware/errorHandler';
import type { TypedResponse } from '../types/api';
import type { MediaWithRatings } from '../types';

const router = Router();
const CACHE_KEY = 'trending';
const TTL = 600; // 10 分钟

router.get('/', async (_req, res: TypedResponse<{ items: MediaWithRatings[] }>) => {
  try {
    const cached = await cacheGet<{ items: MediaWithRatings[] }>(CACHE_KEY);
    if (cached) return res.json(cached);

    const items = await getTrending();
    const data = { items };
    await cacheSet(CACHE_KEY, data, TTL);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Trending error:', message);
    throw internalError('获取热门数据失败');
  }
});

export default router;
