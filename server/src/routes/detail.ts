import { Router } from 'express';
import { getDetail, getCredits, getRecommendations } from '../services/tmdb';
import { query } from '../db';
import { cacheGet, cacheSet } from '../services/cache';

const router = Router();
const TTL = 3600; // 1 小时

router.get('/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    if (type !== 'movie' && type !== 'tv') {
      return res.status(400).json({ error: '类型必须是 movie 或 tv' });
    }

    const tmdbId = parseInt(id);
    if (isNaN(tmdbId)) return res.status(400).json({ error: '无效的 ID' });

    const cacheKey = `detail:${type}:${tmdbId}`;
    const cached = await cacheGet<any>(cacheKey);
    if (cached) {
      // 补充实时本地状态（local 数据变化频繁，不缓存）
      const localRows: any[] = await query(
        'SELECT id, local_path FROM local_media WHERE tmdb_id = ? AND media_type = ?',
        [tmdbId, type]
      );
      if (localRows.length > 0) {
        cached.isLocal = true;
        cached.localId = localRows[0].id;
        cached.localPath = localRows[0].local_path;
      }
      return res.json(cached);
    }

    // 并行获取详情、演员、推荐
    const [detail, credits, recommendations] = await Promise.all([
      getDetail(type, tmdbId),
      getCredits(type, tmdbId),
      getRecommendations(type, tmdbId),
    ]);

    if (!detail) return res.status(404).json({ error: '未找到该影视' });

    // 查询本地是否存在
    const localRows: any[] = await query(
      'SELECT id, local_path FROM local_media WHERE tmdb_id = ? AND media_type = ?',
      [tmdbId, type]
    );

    if (localRows.length > 0) {
      detail.isLocal = true;
      detail.localId = localRows[0].id;
      detail.localPath = localRows[0].local_path;
    }

    const result = { ...detail, credits, recommendations };
    await cacheSet(cacheKey, result, TTL);
    res.json(result);
  } catch (err: any) {
    console.error('Detail error:', err.message);
    res.status(500).json({ error: '获取详情失败' });
  }
});

export default router;
