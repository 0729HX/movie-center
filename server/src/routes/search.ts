import { Router } from 'express';
import { searchMedia } from '../services/tmdb';
import { badRequest, internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse, SearchResponse } from '../types/api';

const router = Router();

router.get('/', async (req: TypedRequest<Record<string, string>, unknown, { q?: string; page?: string }>, res: TypedResponse<SearchResponse>) => {
  try {
    const q = req.query.q as string;
    if (!q) throw badRequest('请输入搜索关键词');

    const page = parseInt(req.query.page as string) || 1;
    const { items, totalPages, totalResults } = await searchMedia(q, page);
    res.json({ items, totalPages, totalResults });
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Search error:', message);
    throw internalError('搜索失败');
  }
});

export default router;
