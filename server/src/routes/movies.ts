import { Router } from 'express';
import { getMovies, getMovieGenres } from '../services/tmdb';
import { cacheGet, cacheSet } from '../services/cache';
import { internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse, ListResponse, GenreItem } from '../types/api';

const router = Router();
const LIST_TTL = 1800;   // 30 分钟
const GENRE_TTL = 86400; // 24 小时

router.get('/', async (req: TypedRequest<Record<string, string>, unknown, { page?: string; genre?: string }>, res: TypedResponse<ListResponse>) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const genre = req.query.genre as string | undefined;
    const key = `movies:${page}:${genre || 'all'}`;

    const cached = await cacheGet<ListResponse>(key);
    if (cached) return res.json(cached);

    const liveCount = page === 1 ? 6 : 0;
    const result = await getMovies(page, genre, liveCount);
    await cacheSet(key, result, LIST_TTL);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Movies error:', message);
    throw internalError('获取电影列表失败');
  }
});

router.get('/genres', async (_req, res: TypedResponse<{ genres: GenreItem[] }>) => {
  try {
    const key = 'genres:movie';
    const cached = await cacheGet<{ genres: GenreItem[] }>(key);
    if (cached) return res.json(cached);

    const genres = await getMovieGenres();
    const data = { genres };
    await cacheSet(key, data, GENRE_TTL);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Movie genres error:', message);
    throw internalError('获取电影分类失败');
  }
});

export default router;
