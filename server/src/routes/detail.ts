import { Router } from 'express';
import { getDetailFull } from '../services/tmdb';
import { query } from '../db';
import { cacheGet, cacheSet } from '../services/cache';
import { badRequest, notFound, internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse, DetailResponse } from '../types/api';

const router = Router();
const TTL = 3600; // 1 小时

router.get('/:type/:id', async (req: TypedRequest<{ type: string; id: string }>, res: TypedResponse<DetailResponse>) => {
  try {
    const { type, id } = req.params;
    if (type !== 'movie' && type !== 'tv') {
      throw badRequest('类型必须是 movie 或 tv');
    }

    const tmdbId = parseInt(id);
    if (isNaN(tmdbId)) throw badRequest('无效的 ID');

    const cacheKey = `detail:${type}:${tmdbId}`;
    const cached = await cacheGet<DetailResponse>(cacheKey);
    if (cached) {
      // 补充实时本地状态（local 数据变化频繁，不缓存）
      const localRows: any[] = await query(
        'SELECT id, local_path FROM local_media WHERE tmdb_id = ? AND media_type = ?',
        [tmdbId, type]
      );
      if (localRows.length > 0) {
        (cached as any).isLocal = true;
        (cached as any).localId = localRows[0].id;
        (cached as any).localPath = localRows[0].local_path;
      }
      return res.json(cached);
    }

    // 单次请求获取详情+演员+推荐（append_to_response 合并）
    const full = await getDetailFull(type, tmdbId);
    if (!full) throw notFound('未找到该影视');

    // 查询本地是否存在
    const localRows: any[] = await query(
      'SELECT id, local_path FROM local_media WHERE tmdb_id = ? AND media_type = ?',
      [tmdbId, type]
    );

    if (localRows.length > 0) {
      full.detail.isLocal = true;
      full.detail.localId = localRows[0].id;
      full.detail.localPath = localRows[0].local_path;
    }

    const result = { ...full.detail, credits: full.credits, recommendations: full.recommendations };
    await cacheSet(cacheKey, result, TTL);
    res.json(result as DetailResponse);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Detail error:', message);
    throw internalError('获取详情失败');
  }
});

export default router;
