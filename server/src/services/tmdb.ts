import axios from 'axios';
import { query } from '../db';
import type {
  TmdbMovie, TmdbTv, TmdbDetail, TmdbExternalIds,
  MediaWithRatings, RatingSource, CastMember, RecommendationResult
} from '../types';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const OMDB_BASE = 'https://www.omdbapi.com';

// ======================== 内存缓存：tmdb_id → imdb_id ========================
// external_ids 的映射关系几乎不变，用内存缓存避免重复 TMDB 请求
const EXTERNAL_ID_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const externalIdCache = new Map<string, { imdbId: string | null; ts: number }>();

function cacheExternalId(tmdbId: number, mediaType: string, imdbId: string | null) {
  externalIdCache.set(`${mediaType}:${tmdbId}`, { imdbId, ts: Date.now() });
}

function getCachedExternalId(tmdbId: number, mediaType: string): string | null | undefined {
  const key = `${mediaType}:${tmdbId}`;
  const entry = externalIdCache.get(key);
  if (!entry) return undefined; // 未缓存
  if (Date.now() - entry.ts > EXTERNAL_ID_CACHE_TTL) {
    externalIdCache.delete(key);
    return undefined; // 过期
  }
  return entry.imdbId;
}

// ======================== API Key 获取 ========================

async function getApiKey(): Promise<string> {
  const rows: any[] = await query('SELECT `value` FROM config WHERE `key` = ?', ['tmdb_api_key']);
  return rows[0]?.value || '95777cd0ce9652f08bd77103f658cf2b';
}

async function getOmdbKey(): Promise<string | null> {
  const rows: any[] = await query('SELECT `value` FROM config WHERE `key` = ?', ['omdb_api_key']);
  return rows[0]?.value || null;
}

async function tmdbGet<T>(path: string, params: Record<string, any> = {}): Promise<T> {
  const apiKey = await getApiKey();
  const { data } = await axios.get(`${TMDB_BASE}${path}`, {
    params: { api_key: apiKey, language: 'zh-CN', ...params },
    timeout: 15000,
  });
  return data as T;
}

// ======================== OMDb 多源评分获取 + 缓存 ========================

interface OmdbRatings {
  imdb: number | null;       // IMDb 评分 (0-10)
  tomatoes: string | null;   // Rotten Tomatoes (如 "80%")
  metacritic: number | null; // Metacritic (0-100)
}

/**
 * 从 OMDb 获取全部评分并写入 rating_cache 表
 */
async function fetchAndCacheOmdb(imdbId: string, tmdbId: number, mediaType: string): Promise<OmdbRatings> {
  const defaultResult: OmdbRatings = { imdb: null, tomatoes: null, metacritic: null };

  try {
    const apiKey = await getOmdbKey();
    if (!apiKey) return defaultResult;

    const { data } = await axios.get(OMDB_BASE, {
      params: { i: imdbId, apikey: apiKey },
      timeout: 5000,
    });

    if (data?.Response === 'False') return defaultResult;

    const result: OmdbRatings = {
      imdb: data.imdbRating && data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null,
      tomatoes: null,
      metacritic: null,
    };

    // 从 OMDb Ratings 数组中提取更多来源
    if (data.Ratings) {
      for (const r of data.Ratings) {
        if (r.Source === 'Rotten Tomatoes') result.tomatoes = r.Value;   // "80%"
        if (r.Source === 'Metacritic') result.metacritic = parseInt(r.Value); // "67/100" → 67
      }
    }

    // 写入缓存
    await query(
      `INSERT INTO rating_cache (imdb_id, tmdb_id, media_type, imdb_score, tomatoes_score, metacritic_score)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE imdb_score = VALUES(imdb_score), tomatoes_score = VALUES(tomatoes_score),
        metacritic_score = VALUES(metacritic_score), updated_at = NOW()`,
      [imdbId, tmdbId, mediaType, result.imdb, result.tomatoes, result.metacritic]
    );

    console.log(`[OMDb] ${imdbId} → IMDb:${result.imdb} RT:${result.tomatoes} MC:${result.metacritic}`);
    return result;
  } catch (err: any) {
    console.log(`[OMDb] 请求异常: ${err.message}`);
    return defaultResult;
  }
}

/**
 * 从缓存读取 OMDb 评分
 */
async function getCachedOmdb(imdbId: string): Promise<OmdbRatings | null> {
  try {
    const rows: any[] = await query(
      'SELECT imdb_score, tomatoes_score, metacritic_score FROM rating_cache WHERE imdb_id = ?',
      [imdbId]
    );
    if (rows.length > 0) {
      // mysql2 将 DECIMAL 列作为字符串返回，需要显式转换
      const imdbRaw = rows[0].imdb_score;
      const mcRaw = rows[0].metacritic_score;
      return {
        imdb: imdbRaw !== null && imdbRaw !== undefined ? Number(imdbRaw) : null,
        tomatoes: rows[0].tomatoes_score,
        metacritic: mcRaw !== null && mcRaw !== undefined ? Number(mcRaw) : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ======================== 豆瓣评分获取 + 缓存 ========================

const DOUBAN_PROXY = 'https://douban.uieee.xyz';

interface DoubanResult {
  doubanId: string;
  score: number;  // 0-10
}

/**
 * 从豆瓣代理 API 搜索并获取评分，写入缓存
 * 策略：按 IMDb ID 搜索 → 按标题+年份匹配 → 提取评分
 */
async function fetchAndCacheDouban(
  imdbId: string,
  tmdbId: number,
  mediaType: string,
  title: string,
  year: string,
): Promise<DoubanResult | null> {
  try {
    // 用 IMDb ID 或标题搜索豆瓣
    const searchQ = imdbId || title;
    const { data } = await axios.get(`${DOUBAN_PROXY}/v2/movie/search`, {
      params: { q: searchQ, count: 5 },
      timeout: 3000,
    });

    if (!data.subjects || data.subjects.length === 0) {
      console.log(`[Douban] 未搜到: ${title}`);
      return null;
    }

    // 按年份匹配最佳结果
    let match = data.subjects[0];
    const yearNum = parseInt(year);
    for (const s of data.subjects) {
      if (!isNaN(yearNum) && parseInt(s.year) === yearNum) {
        match = s;
        break;
      }
    }

    const score = match.rating?.average;
    if (!score || score <= 0) {
      console.log(`[Douban] ${title} 无评分`);
      return null;
    }

    const doubanId = String(match.id);

    // 更新缓存（仅豆瓣字段，不影响 OMDb 字段）
    await query(
      `INSERT INTO rating_cache (imdb_id, tmdb_id, media_type, douban_id, douban_score)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE douban_id = VALUES(douban_id), douban_score = VALUES(douban_score), updated_at = NOW()`,
      [imdbId, tmdbId, mediaType, doubanId, score],
    );

    console.log(`[Douban] ${title} → ${score} (id:${doubanId})`);
    return { doubanId, score };
  } catch (err: any) {
    console.log(`[Douban] 请求异常: ${err.message}`);
    return null;
  }
}

/**
 * 从缓存读取豆瓣评分
 */
async function getCachedDouban(imdbId: string): Promise<DoubanResult | null> {
  try {
    const rows: any[] = await query(
      'SELECT douban_id, douban_score FROM rating_cache WHERE imdb_id = ? AND douban_score IS NOT NULL',
      [imdbId],
    );
    if (rows.length > 0 && rows[0].douban_score) {
      // mysql2 将 DECIMAL 列作为字符串返回，需要显式转换
      return { doubanId: rows[0].douban_id, score: Number(rows[0].douban_score) };
    }
    return null;
  } catch {
    return null;
  }
}

// ======================== 本地已存标记 ========================

/**
 * 批量标记列表中哪些已经在本地收藏
 * 策略：①精确 tmdb_id 匹配 → ②标题+年份模糊匹配
 */
async function markLocalItems(items: MediaWithRatings[]): Promise<void> {
  if (items.length === 0) return;

  // 第一步：按 tmdb_id 精确匹配（速度快）
  const movieIds = items.filter(i => i.mediaType === 'movie').map(i => i.tmdbId);
  const tvIds = items.filter(i => i.mediaType === 'tv').map(i => i.tmdbId);

  const localMap = new Map<string, { id: number; local_path: string }>();

  if (movieIds.length > 0) {
    const placeholders = movieIds.map(() => '?').join(',');
    const rows: any[] = await query(
      `SELECT tmdb_id, id, local_path FROM local_media WHERE media_type = 'movie' AND tmdb_id IN (${placeholders})`,
      movieIds
    );
    for (const r of rows) {
      localMap.set(`movie-${r.tmdb_id}`, { id: r.id, local_path: r.local_path });
    }
  }

  if (tvIds.length > 0) {
    const placeholders = tvIds.map(() => '?').join(',');
    const rows: any[] = await query(
      `SELECT tmdb_id, id, local_path FROM local_media WHERE media_type = 'tv' AND tmdb_id IN (${placeholders})`,
      tvIds
    );
    for (const r of rows) {
      localMap.set(`tv-${r.tmdb_id}`, { id: r.id, local_path: r.local_path });
    }
  }

  // 第二步：对本地 tmdb_id 为 NULL 的，按标题+年份匹配
  // 获取所有本地记录（包含 tmdb_id 为 NULL 的）
  const allLocal: any[] = await query(
    "SELECT id, tmdb_id, title, year, media_type, local_path FROM local_media WHERE tmdb_id IS NULL"
  );

  // 对每个 TMDB 条目，尝试用标题匹配本地无 tmdb_id 的记录
  for (const item of items) {
    const key = `${item.mediaType}-${item.tmdbId}`;
    if (localMap.has(key)) continue; // 已通过 tmdb_id 匹配

    // 尝试标题匹配（宽松模式）
    const itemTitle = item.title.toLowerCase().trim();
    // 标准化 TMDB 标题：移除括号内容、"："后主标题、分隔符
    const itemTitleNorm = itemTitle
      .replace(/[：:].*$/, '')           // "Movie：副标题" → "Movie"
      .replace(/[\(（].*[\)）]/g, '')     // 移除括号及内容
      .replace(/[^\w\u4e00-\u9fff]/g, '') // 只保留中英文数字
      .trim();

    const itemYear = parseInt(item.year);

    for (const local of allLocal) {
      if (local.media_type !== item.mediaType) continue;

      let localTitle = local.title.toLowerCase().trim();
      // 本地标题可能是目录名："Movie Name (2024) [BluRay x265]" → "Movie Name"
      const localTitleNorm = localTitle
        .replace(/[\(（\[][^\)）\]]*[\)）\]]/g, '')  // 移除所有括号内容
        .replace(/[：:].*$/, '')
        .replace(/[^\w\u4e00-\u9fff]/g, '')
        .replace(/\s+/g, '')
        .trim();

      // 匹配策略（任一满足即可）
      const exactMatch = localTitle === itemTitle;
      const normMatch = localTitleNorm === itemTitleNorm;
      const containsMatch = localTitleNorm.includes(itemTitleNorm) || itemTitleNorm.includes(localTitleNorm);
      // 中文拼音/别名特殊处理：取前4个字符匹配
      const shortMatch = itemTitleNorm.length >= 4 && localTitleNorm.length >= 4
        && (itemTitleNorm.slice(0, 4) === localTitleNorm.slice(0, 4));

      const titleMatch = exactMatch || normMatch || containsMatch || shortMatch;
      const yearMatch = !itemYear || !local.year || local.year === itemYear;

      if (titleMatch && yearMatch) {
        localMap.set(key, { id: local.id, local_path: local.local_path });
        break;
      }
    }
  }

  // 标记
  for (const item of items) {
    const key = `${item.mediaType}-${item.tmdbId}`;
    const local = localMap.get(key);
    if (local) {
      item.isLocal = true;
      item.localId = local.id;
      item.localPath = local.local_path;
    }
  }
}

// ======================== 图像 URL ========================

export function imgUrl(path: string | null, size: 'w185' | 'w500' | 'original' = 'w500'): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

// ======================== 评分构建 ========================

/**
 * 为 MediaWithRatings 添加所有评分源
 * 会检查缓存中是否有 OMDb 评分
 */
async function addAllRatings(
  result: MediaWithRatings,
  imdbId?: string | null,
): Promise<void> {
  // 始终有 TMDB 评分
  if (!result.ratings.some(r => r.source === 'TMDB')) {
    // TMDB 评分已在 buildMediaWithRatings 中添加
  }

  // 如果有 IMDb ID，添加 IMDb + RT + Metacritic
  if (imdbId) {
    // 先检查缓存
    let omdb = await getCachedOmdb(imdbId);

    // 缓存没有且这是详情请求（非列表），直接获取
    if (!omdb) {
      omdb = await fetchAndCacheOmdb(imdbId, result.tmdbId, result.mediaType);
    }

    if (omdb) {
      // IMDb
      if (!result.ratings.some(r => r.source === 'IMDb')) {
        result.ratings.push({
          source: 'IMDb',
          icon: 'imdb',
          score: omdb.imdb ?? result.ratings[0]?.score ?? 0,
          maxScore: 10,
          url: `https://www.imdb.com/title/${imdbId}`,
        });
      } else {
        // 更新现有 IMDb 评分
        const imdbRating = result.ratings.find(r => r.source === 'IMDb');
        if (imdbRating && omdb.imdb !== null) imdbRating.score = omdb.imdb;
      }

      // Rotten Tomatoes
      if (omdb.tomatoes && !result.ratings.some(r => r.source === 'Rotten Tomatoes')) {
        const score = parseInt(omdb.tomatoes);
        result.ratings.push({
          source: 'Rotten Tomatoes',
          icon: 'tomatoes',
          score: isNaN(score) ? 0 : score,
          maxScore: 100,
          url: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(result.title)}`,
        });
      }

      // Metacritic
      if (omdb.metacritic !== null && !result.ratings.some(r => r.source === 'Metacritic')) {
        result.ratings.push({
          source: 'Metacritic',
          icon: 'metacritic',
          score: omdb.metacritic,
          maxScore: 100,
          url: `https://www.metacritic.com/search/${encodeURIComponent(result.title)}`,
        });
      }
    }
  }
}

/**
 * 为列表中的每个 item 批量填充评分
 * @param items 待填充的列表
 * @param liveCount 前 N 个做实时 OMDb 抓取，其余仅读缓存。默认 0（全读缓存）
 */
/**
 * 为单个 item 填充 OMDb + 豆瓣评分
 */
async function enrichItemWithOmdb(item: MediaWithRatings, imdbId: string, liveCount: number): Promise<void> {
  const doLiveFetch = liveCount > 0;

  // OMDb 评分
  const omdb = doLiveFetch
    ? await fetchAndCacheOmdb(imdbId, item.tmdbId, item.mediaType)
    : await getCachedOmdb(imdbId);

  if (omdb) {
    if (!item.ratings.some(r => r.source === 'IMDb')) {
      item.ratings.push({
        source: 'IMDb', icon: 'imdb',
        score: omdb.imdb ?? item.ratings[0]?.score ?? 0,
        maxScore: 10,
        url: `https://www.imdb.com/title/${imdbId}`,
      });
    }
    if (omdb.tomatoes && !item.ratings.some(r => r.source === 'Rotten Tomatoes')) {
      const score = parseInt(omdb.tomatoes);
      item.ratings.push({
        source: 'Rotten Tomatoes', icon: 'tomatoes',
        score: isNaN(score) ? 0 : score, maxScore: 100,
        url: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(item.title)}`,
      });
    }
    if (omdb.metacritic !== null && !item.ratings.some(r => r.source === 'Metacritic')) {
      item.ratings.push({
        source: 'Metacritic', icon: 'metacritic',
        score: omdb.metacritic, maxScore: 100,
        url: `https://www.metacritic.com/search/${encodeURIComponent(item.title)}`,
      });
    }
  }

  // 豆瓣评分
  if (doLiveFetch) {
    fetchAndCacheDouban(imdbId, item.tmdbId, item.mediaType, item.title, item.year).catch(() => {});
  } else {
    const douban = await getCachedDouban(imdbId);
    if (douban && !item.ratings.some(r => r.source === '豆瓣')) {
      item.ratings.push({
        source: '豆瓣', icon: 'douban',
        score: douban.score, maxScore: 10,
        url: `https://movie.douban.com/subject/${douban.doubanId}/`,
      });
    }
  }
}

async function enrichListWithCachedRatings(items: MediaWithRatings[], liveCount: number = 0): Promise<void> {
  const needsRating = items.filter(i => i.ratings.length <= 1);
  if (needsRating.length === 0) return;

  // 先从内存缓存获取 tmdb_id → imdb_id 映射，只对未命中的发起 TMDB 请求
  const needExtIds: MediaWithRatings[] = [];
  for (const item of needsRating) {
    const cachedImdbId = getCachedExternalId(item.tmdbId, item.mediaType);
    if (cachedImdbId !== undefined) {
      // 内存缓存命中，直接用
      if (cachedImdbId) {
        await enrichItemWithOmdb(item, cachedImdbId, 0);
      }
    } else {
      needExtIds.push(item);
    }
  }

  // 只对未缓存的 item 调用 TMDB external_ids
  const CONCURRENCY = 5;
  for (let i = 0; i < needExtIds.length; i += CONCURRENCY) {
    const batch = needExtIds.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (item, bi) => {
      const globalIndex = i + bi;
      const doLiveFetch = globalIndex < liveCount;

      try {
        const extIds = await tmdbGet<TmdbExternalIds>(`/${item.mediaType}/${item.tmdbId}/external_ids`);
        // 写入内存缓存
        cacheExternalId(item.tmdbId, item.mediaType, extIds?.imdb_id || null);
        if (!extIds?.imdb_id) return;

        // 前 liveCount 个：实时抓取并缓存；其余：仅读缓存
        await enrichItemWithOmdb(item, extIds.imdb_id, doLiveFetch ? 1 : 0);
      } catch {
        // 单个失败不影响整体
      }
    }));
  }
}

// ======================== 构建 Media 对象 ========================

function buildMediaWithRatings(
  item: TmdbMovie | TmdbTv,
  detail?: TmdbDetail,
  externalIds?: TmdbExternalIds,
): MediaWithRatings {
  const isMovie = 'title' in item;
  const title = isMovie ? (item as TmdbMovie).title : (item as TmdbTv).name;
  const date = isMovie ? (item as TmdbMovie).release_date : (item as TmdbTv).first_air_date;

  const ratings: RatingSource[] = [
    {
      source: 'TMDB',
      icon: 'tmdb',
      score: item.vote_average,
      maxScore: 10,
      url: `https://www.themoviedb.org/${isMovie ? 'movie' : 'tv'}/${item.id}`,
    }
  ];

  // 如果有 externalIds，预先添加占位（后续由 addAllRatings 填充真实值）
  if (externalIds?.imdb_id) {
    ratings.push({
      source: 'IMDb',
      icon: 'imdb',
      score: item.vote_average,
      maxScore: 10,
      url: `https://www.imdb.com/title/${externalIds.imdb_id}`,
    });
  }

  return {
    id: item.id,
    tmdbId: item.id,
    title,
    overview: item.overview,
    posterPath: imgUrl(item.poster_path),
    backdropPath: imgUrl(item.backdrop_path, 'original'),
    year: date ? date.substring(0, 4) : '',
    mediaType: item.media_type,
    ratings,
    genres: detail?.genres.map(g => g.name) || [],
    runtime: detail?.runtime || detail?.episode_run_time?.[0],
    status: detail?.status || '',
    tagline: detail?.tagline || '',
    isLocal: false,
  };
}

interface TmdbPaginated<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

// ======================== API 函数 ========================

// === 1. 本周热门（电影 + 剧集混合） ===
export async function getTrending(): Promise<MediaWithRatings[]> {
  const [movieData, tvData] = await Promise.all([
    tmdbGet<TmdbPaginated<TmdbMovie>>('/trending/movie/week', { page: 1 }),
    tmdbGet<TmdbPaginated<TmdbTv>>('/trending/tv/week', { page: 1 }),
  ]);

  const movies = movieData.results.slice(0, 10).map(m => ({ ...m, media_type: 'movie' as const }));
  const tvs = tvData.results.slice(0, 10).map(t => ({ ...t, media_type: 'tv' as const }));

  const combined = [...movies, ...tvs]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 12)
    .map(item => buildMediaWithRatings(item));

  // 异步填充缓存的 OMDb 评分
  await enrichListWithCachedRatings(combined, 8);

  // 标记本地已收藏的
  await markLocalItems(combined);

  return combined;
}

// === 2. 电影列表（按上映时间排序） ===
export async function getMovies(page: number = 1, genre?: string, liveCount: number = 0): Promise<{ items: MediaWithRatings[]; totalPages: number }> {
  const params: Record<string, any> = { page, sort_by: 'primary_release_date.desc', 'vote_count.gte': 50 };
  if (genre) params.with_genres = genre;

  const data = await tmdbGet<TmdbPaginated<TmdbMovie>>('/discover/movie', params);
  const items = data.results.map(m => buildMediaWithRatings({ ...m, media_type: 'movie' }));

  await enrichListWithCachedRatings(items, liveCount);
  await markLocalItems(items);

  return { items, totalPages: data.total_pages };
}

// === 3. 剧集列表（按首播时间排序） ===
export async function getTv(page: number = 1, genre?: string, liveCount: number = 0): Promise<{ items: MediaWithRatings[]; totalPages: number }> {
  const params: Record<string, any> = { page, sort_by: 'first_air_date.desc', 'vote_count.gte': 20 };
  if (genre) params.with_genres = genre;

  const data = await tmdbGet<TmdbPaginated<TmdbTv>>('/discover/tv', params);
  const items = data.results.map(t => buildMediaWithRatings({ ...t, media_type: 'tv' }));

  await enrichListWithCachedRatings(items, liveCount);
  await markLocalItems(items);

  return { items, totalPages: data.total_pages };
}

// === 4. 搜索 ===
export async function searchMedia(query: string, page: number = 1): Promise<{ items: MediaWithRatings[]; totalPages: number; totalResults: number }> {
  const data = await tmdbGet<TmdbPaginated<TmdbMovie | TmdbTv>>('/search/multi', { query, page });
  const items = data.results
    .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
    .map(item => buildMediaWithRatings(item));

  await enrichListWithCachedRatings(items);

  // 标记本地已收藏的
  await markLocalItems(items);

  return { items, totalPages: data.total_pages, totalResults: data.total_results };
}

// === 5. 影视详情（带全量外部评分） — 单次请求合并 external_ids + credits ===
export async function getDetail(mediaType: 'movie' | 'tv', id: number): Promise<MediaWithRatings | null> {
  try {
    // append_to_response 将 external_ids + credits 合并到 1 次 TMDB 请求
    const detail = await tmdbGet<TmdbDetail & { external_ids?: TmdbExternalIds; credits?: { cast: TmdbCredit[] } }>(
      `/${mediaType}/${id}`,
      { append_to_response: 'external_ids,credits' },
    );

    const externalIds = detail.external_ids;

    const isMovie = mediaType === 'movie';
    const item: TmdbMovie | TmdbTv = {
      id: detail.id,
      title: detail.title || '',
      name: detail.name || '',
      overview: detail.overview,
      poster_path: detail.poster_path,
      backdrop_path: detail.backdrop_path,
      vote_average: detail.vote_average,
      vote_count: detail.vote_count,
      genre_ids: detail.genres.map(g => g.id),
      media_type: mediaType,
      original_language: '',
      popularity: 0,
      release_date: detail.release_date || '',
      first_air_date: detail.first_air_date || '',
    };

    const result = buildMediaWithRatings(item, detail, externalIds);

    // 缓存 external_id 映射
    if (externalIds?.imdb_id) cacheExternalId(id, mediaType, externalIds.imdb_id);

    // OMDb + 豆瓣评分：缓存优先，非阻塞回填
    const imdbId = externalIds?.imdb_id;
    if (imdbId) {
      // 后台抓取 OMDb（不阻塞响应），下次访问自动命中缓存
      fetchAndCacheOmdb(imdbId, id, mediaType).catch(() => {});
      // 当前请求用缓存
      await enrichItemWithOmdb(result, imdbId, 0);
    }

    return result;
  } catch {
    return null;
  }
}

// === 5b. 影视详情（完整版：含 credits + recommendations，单次 TMDB 请求） ===
export async function getDetailFull(
  mediaType: 'movie' | 'tv', id: number,
): Promise<{ detail: MediaWithRatings; credits: any[]; recommendations: any[] } | null> {
  try {
    const raw = await tmdbGet<TmdbDetail & {
      external_ids?: TmdbExternalIds;
      credits?: { cast: TmdbCredit[] };
      recommendations?: TmdbPaginated<TmdbMovie | TmdbTv>;
    }>(`/${mediaType}/${id}`, { append_to_response: 'external_ids,credits,recommendations' });

    const externalIds = raw.external_ids;
    const isMovie = mediaType === 'movie';
    const item: TmdbMovie | TmdbTv = {
      id: raw.id,
      title: raw.title || '',
      name: raw.name || '',
      overview: raw.overview,
      poster_path: raw.poster_path,
      backdrop_path: raw.backdrop_path,
      vote_average: raw.vote_average,
      vote_count: raw.vote_count,
      genre_ids: raw.genres.map(g => g.id),
      media_type: mediaType,
      original_language: '',
      popularity: 0,
      release_date: raw.release_date || '',
      first_air_date: raw.first_air_date || '',
    };

    const detail = buildMediaWithRatings(item, raw, externalIds);

    // credits
    const credits = (raw.credits?.cast || [])
      .sort((a, b) => a.order - b.order)
      .slice(0, 15)
      .map(c => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profilePath: imgUrl(c.profile_path, 'w185'),
        order: c.order,
      }));

    // recommendations
    const recommendations = (raw.recommendations?.results || []).slice(0, 10).map(r => {
      const rIsMovie = 'title' in r;
      const title = rIsMovie ? (r as TmdbMovie).title : (r as TmdbTv).name;
      const date = rIsMovie ? (r as TmdbMovie).release_date : (r as TmdbTv).first_air_date;
      return {
        id: r.id,
        title,
        posterPath: imgUrl(r.poster_path),
        year: date ? date.substring(0, 4) : '',
        mediaType,
      };
    });

    // OMDb + 豆瓣评分
    const imdbId = externalIds?.imdb_id;
    if (imdbId) {
      let omdb = await getCachedOmdb(imdbId);
      if (!omdb) fetchAndCacheOmdb(imdbId, id, mediaType).catch(() => {});
      if (omdb) {
        const imdbRating = detail.ratings.find(r => r.source === 'IMDb');
        if (imdbRating && omdb.imdb !== null) imdbRating.score = omdb.imdb;
        if (omdb.tomatoes && !detail.ratings.some(r => r.source === 'Rotten Tomatoes')) {
          const score = parseInt(omdb.tomatoes);
          detail.ratings.push({ source: 'Rotten Tomatoes', icon: 'tomatoes', score: isNaN(score) ? 0 : score, maxScore: 100, url: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(detail.title)}` });
        }
        if (omdb.metacritic !== null && !detail.ratings.some(r => r.source === 'Metacritic')) {
          detail.ratings.push({ source: 'Metacritic', icon: 'metacritic', score: omdb.metacritic, maxScore: 100, url: `https://www.metacritic.com/search/${encodeURIComponent(detail.title)}` });
        }
      }
      fetchAndCacheDouban(imdbId, id, mediaType, detail.title, detail.year).catch(() => {});
      const cachedDouban = await getCachedDouban(imdbId);
      if (cachedDouban && !detail.ratings.some(r => r.source === '豆瓣')) {
        detail.ratings.push({ source: '豆瓣', icon: 'douban', score: cachedDouban.score, maxScore: 10, url: `https://movie.douban.com/subject/${cachedDouban.doubanId}/` });
      }
    }

    return { detail, credits, recommendations };
  } catch {
    return null;
  }
}

// === 6. 电影分类列表 ===
export async function getMovieGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbGet<{ genres: TmdbGenre[] }>('/genre/movie/list');
  return data.genres;
}

// === 7. 剧集分类列表 ===
export async function getTvGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbGet<{ genres: TmdbGenre[] }>('/genre/tv/list');
  return data.genres;
}

// === 8. 演员阵容 ===
interface TmdbCredit {
  id: number;
  name: string;
  profile_path: string | null;
  character: string;
  order: number;
  known_for_department: string;
}

export async function getCredits(mediaType: 'movie' | 'tv', id: number) {
  try {
    const data = await tmdbGet<{ cast: TmdbCredit[] }>(`/${mediaType}/${id}/credits`);
    return data.cast
      .sort((a, b) => a.order - b.order)
      .slice(0, 15)
      .map(c => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profilePath: imgUrl(c.profile_path, 'w185'),
        order: c.order,
      }));
  } catch {
    return [];
  }
}

// === 9. 类似推荐 ===
export async function getRecommendations(mediaType: 'movie' | 'tv', id: number) {
  try {
    const data = await tmdbGet<TmdbPaginated<TmdbMovie | TmdbTv>>(`/${mediaType}/${id}/recommendations`);
    return data.results.slice(0, 10).map(item => {
      const isMovie = 'title' in item;
      const title = isMovie ? (item as TmdbMovie).title : (item as TmdbTv).name;
      const date = isMovie ? (item as TmdbMovie).release_date : (item as TmdbTv).first_air_date;
      return {
        id: item.id,
        title,
        posterPath: imgUrl(item.poster_path),
        year: date ? date.substring(0, 4) : '',
        mediaType,
      };
    });
  } catch {
    return [];
  }
}
