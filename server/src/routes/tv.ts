import { Router } from 'express';
import { getTv, getTvGenres } from '../services/tmdb';
import { cacheGet, cacheSet } from '../services/cache';

const router = Router();
const LIST_TTL = 1800;   // 30 分钟
const GENRE_TTL = 86400; // 24 小时

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const genre = req.query.genre as string | undefined;
    const key = `tv:${page}:${genre || 'all'}`;

    const cached = await cacheGet<{ items: any[]; totalPages: number }>(key);
    if (cached) return res.json(cached);

    const liveCount = page === 1 ? 6 : 0;
    const result = await getTv(page, genre, liveCount);
    await cacheSet(key, result, LIST_TTL);
    res.json(result);
  } catch (err: any) {
    console.error('TV error:', err.message);
    res.status(500).json({ error: '获取剧集列表失败' });
  }
});

router.get('/genres', async (_req, res) => {
  try {
    const key = 'genres:tv';
    const cached = await cacheGet<{ genres: any[] }>(key);
    if (cached) return res.json(cached);

    const genres = await getTvGenres();
    const data = { genres };
    await cacheSet(key, data, GENRE_TTL);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: '获取剧集分类失败' });
  }
});

export default router;
