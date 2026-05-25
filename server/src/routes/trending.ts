import { Router } from 'express';
import { getTrending } from '../services/tmdb';
import { cacheGet, cacheSet } from '../services/cache';

const router = Router();
const CACHE_KEY = 'trending';
const TTL = 600; // 10 分钟

router.get('/', async (_req, res) => {
  try {
    const cached = await cacheGet<{ items: any[] }>(CACHE_KEY);
    if (cached) return res.json(cached);

    const items = await getTrending();
    const data = { items };
    await cacheSet(CACHE_KEY, data, TTL);
    res.json(data);
  } catch (err: any) {
    console.error('Trending error:', err.message);
    res.status(500).json({ error: '获取热门数据失败' });
  }
});

export default router;
