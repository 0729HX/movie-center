import { Router } from 'express';
import { searchMedia } from '../services/tmdb';
import { query } from '../db';
import { badRequest, internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse, SearchResponse } from '../types/api';
import type { MediaWithRatings } from '../types';

const router = Router();

router.get('/', async (req: TypedRequest<Record<string, string>, unknown, { q?: string; page?: string }>, res: TypedResponse<SearchResponse>) => {
  try {
    const q = req.query.q as string;
    if (!q) throw badRequest('请输入搜索关键词');

    const page = parseInt(req.query.page as string) || 1;

    // 1. TMDB 在线搜索
    const tmdbResult = await searchMedia(q, page);
    const tmdbItems = tmdbResult.items;

    // 2. 本地数据库搜索
    const localRows: any[] = await query(
      `SELECT id, tmdb_id, title, year, media_type, poster_path, local_path
       FROM local_media
       WHERE title LIKE ? OR overview LIKE ?`,
      [`%${q}%`, `%${q}%`]
    );

    // 收集 TMDB 结果中已有的 tmdb_id，用于去重
    const existingTmdbIds = new Set(
      tmdbItems.map(item => `${item.mediaType}-${item.tmdbId}`)
    );

    // 3. 将本地结果转换为 MediaWithRatings 格式
    const localItems: MediaWithRatings[] = localRows
      .filter(row => {
        const key = `${row.media_type}-${row.tmdb_id}`;
        // 跳过已在 TMDB 结果中存在的
        if (row.tmdb_id && existingTmdbIds.has(key)) return false;
        return true;
      })
      .map(row => ({
        id: row.tmdb_id || row.id,
        tmdbId: row.tmdb_id || 0,
        title: row.title,
        overview: '',
        posterPath: row.poster_path
          ? (row.poster_path.startsWith('http') ? row.poster_path : row.poster_path)
          : null,
        backdropPath: null,
        year: row.year ? String(row.year) : '',
        mediaType: row.media_type as 'movie' | 'tv',
        ratings: [],
        genres: [],
        status: '',
        tagline: '',
        isLocal: true,
        localId: row.id,
        localPath: row.local_path,
      }));

    // 4. 合并结果：本地结果在前，TMDB 结果在后
    const mergedItems = [...localItems, ...tmdbItems];
    const totalResults = localItems.length + tmdbResult.totalResults;

    res.json({
      items: mergedItems,
      totalPages: tmdbResult.totalPages,
      totalResults,
    });
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Search error:', message);
    throw internalError('搜索失败');
  }
});

export default router;
