import { Router } from 'express';
import { query } from '../db';
import { scanDirectory, getLocalMediaList, addToLocal, removeFromLocal } from '../services/scanner';
import { playWithPotPlayer } from '../services/player';
import { getDetail, getCredits, getRecommendations, searchMedia } from '../services/tmdb';
import { cacheGet, cacheDel } from '../services/cache';

const router = Router();

// 收藏/取消收藏后，清除受影响缓存
function invalidateCaches(mediaType?: string, tmdbId?: number) {
  cacheDel('trending');
  cacheDel('movies:*');
  cacheDel('tv:*');
  if (mediaType && tmdbId) {
    cacheDel(`detail:${mediaType}:${tmdbId}`);
  }
}

// ======================== 全量预缓存 ========================

/**
 * 后台异步预热所有本地影视的 TMDB 详情缓存
 * - 有 TMDB ID → 直接预热 getDetail + getCredits + getRecommendations
 * - 无 TMDB ID → 标题搜索 TMDB → 匹配成功则预热 + 回写 tmdb_id
 * - 限制并发数，不阻塞主流程
 */
async function preCacheAllLocalDetails(items: any[]) {
  const withTmdb = items.filter((i: any) => i.tmdb_id && i.tmdb_id > 0);
  const withoutTmdb = items.filter((i: any) => !i.tmdb_id || i.tmdb_id <= 0);

  console.log(`[PreCache] 开始预热 ${items.length} 个本地影视 (有TMDB:${withTmdb.length} 无TMDB:${withoutTmdb.length})`);

  // 1. 有 TMDB ID 的 → 直接预热 Redis 缓存，并发 3
  let done = 0;
  const CONCURRENCY = 3;
  for (let i = 0; i < withTmdb.length; i += CONCURRENCY) {
    const batch = withTmdb.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (item: any) => {
        try {
          // 先查 Redis 是否已有缓存，有则跳过
          const cacheKey = `detail:${item.media_type}:${item.tmdb_id}`;
          const cached = await cacheGet(cacheKey);
          if (cached) return;
          await Promise.all([
            getDetail(item.media_type, item.tmdb_id),
            getCredits(item.media_type, item.tmdb_id),
            getRecommendations(item.media_type, item.tmdb_id),
          ]);
        } catch { /* 单个失败不影响整体 */ }
        done++;
      })
    );
  }

  // 2. 无 TMDB ID 的 → 标题搜索匹配后预热，并发 2（避免触发 TMDB 频率限制）
  if (withoutTmdb.length > 0) {
    const SEARCH_CONCURRENCY = 2;
    for (let i = 0; i < withoutTmdb.length; i += SEARCH_CONCURRENCY) {
      const batch = withoutTmdb.slice(i, i + SEARCH_CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (item: any) => {
          try {
            let searchText = item.title;
            if (item.year) searchText += ` ${item.year}`;
            const { items: results } = await searchMedia(searchText, 1);

            const match = results.find((r: any) => {
              const titleMatch = r.title.toLowerCase() === item.title.toLowerCase();
              const yearMatch = !item.year || r.year === String(item.year);
              return titleMatch || (r.title.includes(item.title.slice(0, 6)) && yearMatch);
            }) || results[0];

            if (match && match.tmdbId > 0) {
              await Promise.all([
                getDetail(item.media_type, match.tmdbId),
                getCredits(item.media_type, match.tmdbId),
                getRecommendations(item.media_type, match.tmdbId),
              ]);
              // 回写 TMDB ID
              await query('UPDATE local_media SET tmdb_id = ? WHERE id = ?', [match.tmdbId, item.id]);
            }
          } catch { /* skip */ }
          done++;
        })
      );
    }
  }

  console.log(`[PreCache] 预热完成: ${done}/${items.length}`);
}

// ======================== 路由 ========================

// 获取本地媒体列表 — 返回后异步预热全部详情
router.get('/', async (_req, res) => {
  try {
    const items = await getLocalMediaList();
    res.json({ items });

    // 后台异步预热所有详情缓存（不阻塞响应）
    if (items.length > 0) {
      preCacheAllLocalDetails(items).catch(err =>
        console.error('[PreCache] 预热异常:', err.message)
      );
    }
  } catch (err: any) {
    res.status(500).json({ error: '获取本地媒体失败' });
  }
});

// 扫描媒体目录
router.post('/scan', async (req, res) => {
  try {
    let rootPath = req.body.path;

    if (!rootPath) {
      const rows: any[] = await query('SELECT `value` FROM config WHERE `key` = ?', ['media_root']);
      rootPath = rows[0]?.value;
    }

    if (!rootPath) {
      return res.status(400).json({ error: '请提供媒体目录路径，或在设置中配置 media_root' });
    }

    const result = await scanDirectory(rootPath);

    // 扫描完成后，异步预热新发现/更新的 TMDB 详情
    if (result.tmdbItems.length > 0) {
      const uniqueItems = result.tmdbItems.filter(
        (v, i, a) => a.findIndex(t => t.tmdbId === v.tmdbId && t.mediaType === v.mediaType) === i
      );
      Promise.allSettled(
        uniqueItems.map(item =>
          Promise.all([
            getDetail(item.mediaType, item.tmdbId),
            getCredits(item.mediaType, item.tmdbId),
            getRecommendations(item.mediaType, item.tmdbId),
          ]).catch(() => {})
        )
      ).then(() => {
        console.log(`[PreCache] 扫描预热完成: ${uniqueItems.length} 个详情`);
      });
    }

    invalidateCaches();

    res.json({
      ...result,
      message: `新增 ${result.added}，更新 ${result.updated}，跳过 ${result.skipped}，错误 ${result.errors.length}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: `扫描失败: ${err.message}` });
  }
});

// 从 TMDB 添加到本地收藏
router.post('/save', async (req, res) => {
  try {
    const { tmdb_id, media_type, title } = req.body;
    if (!tmdb_id || !media_type) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    const id = await addToLocal(tmdb_id, media_type, title);
    invalidateCaches(media_type, tmdb_id);

    // 后台预热该影片的详情缓存
    Promise.all([
      getDetail(media_type, tmdb_id),
      getCredits(media_type, tmdb_id),
      getRecommendations(media_type, tmdb_id),
    ]).catch(() => {});

    res.json({ id, success: true });
  } catch (err: any) {
    res.status(500).json({ error: `保存失败: ${err.message}` });
  }
});

// 从本地删除
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows: any[] = await query('SELECT tmdb_id, media_type FROM local_media WHERE id = ?', [id]);
    const ok = await removeFromLocal(id);
    if (rows.length > 0) {
      invalidateCaches(rows[0].media_type, rows[0].tmdb_id);
    }
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: '删除失败' });
  }
});

// 本地影视详情（含 TMDB 元数据匹配）
router.get('/detail/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: '无效的 ID' });

    const rows: any[] = await query('SELECT * FROM local_media WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: '未找到该本地媒体' });

    const local = rows[0];
    let detail: any = null;

    // 如果有 TMDB ID，直接获取详情+演员+推荐（通常已预热，Redis 命中 <10ms）
    if (local.tmdb_id && local.tmdb_id > 0) {
      const [d, credits, recommendations] = await Promise.all([
        getDetail(local.media_type, local.tmdb_id),
        getCredits(local.media_type, local.tmdb_id),
        getRecommendations(local.media_type, local.tmdb_id),
      ]);
      detail = { ...d, credits, recommendations };
    }

    // 没有 TMDB ID → 按标题+年份搜索 TMDB
    if (!detail) {
      let searchText = local.title;
      if (local.year) searchText += ` ${local.year}`;
      const { items: results } = await searchMedia(searchText, 1);

      const match = results.find((r: any) => {
        const titleMatch = r.title.toLowerCase() === local.title.toLowerCase();
        const yearMatch = !local.year || r.year === String(local.year);
        return titleMatch || (r.title.includes(local.title.slice(0, 6)) && yearMatch);
      }) || results[0];

      if (match) {
        const [d, credits, recommendations] = await Promise.all([
          getDetail(local.media_type, match.tmdbId),
          getCredits(local.media_type, match.tmdbId),
          getRecommendations(local.media_type, match.tmdbId),
        ]);
        detail = { ...d, credits, recommendations };

        if (match.tmdbId > 0) {
          await query('UPDATE local_media SET tmdb_id = ? WHERE id = ?', [match.tmdbId, id]);
        }
      }
    }

    if (!detail) {
      return res.json({
        id: local.id,
        tmdbId: 0,
        title: local.title,
        overview: '',
        posterPath: local.poster_path ? `/api/local/file?path=${encodeURIComponent(local.poster_path)}` : null,
        backdropPath: local.backdrop_path ? `/api/local/file?path=${encodeURIComponent(local.backdrop_path)}` : null,
        year: String(local.year || ''),
        mediaType: local.media_type,
        ratings: [],
        genres: [],
        runtime: 0,
        status: '',
        tagline: '',
        isLocal: true,
        localPath: local.local_path,
        localId: local.id,
      });
    }

    detail.isLocal = true;
    detail.localId = local.id;
    detail.localPath = local.local_path;

    if (local.poster_path) {
      detail.posterPath = `/api/local/file?path=${encodeURIComponent(local.poster_path)}`;
    }
    if (local.backdrop_path) {
      detail.backdropPath = `/api/local/file?path=${encodeURIComponent(local.backdrop_path)}`;
    }

    res.json(detail);
  } catch (err: any) {
    console.error('Local detail error:', err.message);
    res.status(500).json({ error: '获取本地详情失败' });
  }
});

// 播放本地媒体
router.post('/play/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows: any[] = await query('SELECT local_path FROM local_media WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: '未找到该媒体' });
    }

    const result = await playWithPotPlayer(rows[0].local_path);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: `播放失败: ${err.message}` });
  }
});

export default router;
