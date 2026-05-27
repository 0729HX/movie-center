/**
 * TMDB 服务 — TMDB API 封装 + 评分构建 + 聚合导出
 *
 * 职责（拆分后）：
 *  - TMDB API 请求封装 (tmdbGet)
 *  - Media 对象构建 (buildMediaWithRatings)
 *  - OMDb 评分注入 (addAllRatings / enrichItemWithOmdb / enrichListWithCachedRatings)
 *  - 导出所有对外 API 函数，路由层无需感知内部拆分
 *
 * 拆分出去的模块：
 *  - omdb.ts             — OMDb Key 管理、限流、评分获取、DB 缓存
 *  - external-id-cache.ts — tmdb_id ↔ imdb_id 内存缓存
 *  - local-marker.ts     — markLocalItems 本地已存标记
 */

import axios from 'axios';
import { query } from '../db';
import type {
  TmdbMovie, TmdbTv, TmdbDetail, TmdbExternalIds,
  MediaWithRatings, RatingSource
} from '../types';

// 内部模块
import { fetchAndCacheOmdb, getCachedOmdb, getOmdbUsageStats } from './omdb';
import { cacheExternalId, getCachedExternalId } from './external-id-cache';
import { markLocalItems } from './local-marker';

// re-export：路由层直接 import tmdb 即可，不感知内部拆分
export { getOmdbUsageStats, markLocalItems };

const TMDB_BASE = 'https://api.themoviedb.org/3';

// ======================== TMDB API 封装 ========================

async function getApiKey(): Promise<string> {
  const rows: any[] = await query('SELECT `value` FROM config WHERE `key` = ?', ['tmdb_api_key']);
  return rows[0]?.value || '95777cd0ce9652f08bd77103f658cf2b';
}

async function tmdbGet<T>(path: string, params: Record<string, any> = {}): Promise<T> {
  const apiKey = await getApiKey();
  const { data } = await axios.get(`${TMDB_BASE}${path}`, {
    params: { api_key: apiKey, language: 'zh-CN', ...params },
    timeout: 15000,
  });
  return data as T;
}

// ======================== 图像 URL ========================

export function imgUrl(path: string | null, size: 'w185' | 'w500' | 'original' = 'w500'): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

// ======================== 构建 Media 对象 ========================

function buildMediaWithRatings(
  item: TmdbMovie | TmdbTv,
  detail?: TmdbDetail,
  externalIds?: TmdbExternalIds,
): MediaWithRatings {
  const isMovie = item.media_type === 'movie';
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

// ======================== 评分注入 ========================

async function enrichItemWithOmdb(item: MediaWithRatings, imdbId: string, liveCount: number): Promise<void> {
  const doLiveFetch = liveCount > 0;

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
}

async function enrichListWithCachedRatings(items: MediaWithRatings[], liveCount: number = 0): Promise<void> {
  const needsRating = items.filter(i => i.ratings.length <= 1);
  if (needsRating.length === 0) return;

  const needExtIds: MediaWithRatings[] = [];
  for (const item of needsRating) {
    const cachedImdbId = getCachedExternalId(item.tmdbId, item.mediaType);
    if (cachedImdbId !== undefined) {
      if (cachedImdbId) {
        await enrichItemWithOmdb(item, cachedImdbId, 0);
      }
    } else {
      needExtIds.push(item);
    }
  }

  const CONCURRENCY = 5;
  for (let i = 0; i < needExtIds.length; i += CONCURRENCY) {
    const batch = needExtIds.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (item, bi) => {
      const globalIndex = i + bi;
      const doLiveFetch = globalIndex < liveCount;

      try {
        const extIds = await tmdbGet<TmdbExternalIds>(`/${item.mediaType}/${item.tmdbId}/external_ids`);
        cacheExternalId(item.tmdbId, item.mediaType, extIds?.imdb_id || null);
        if (!extIds?.imdb_id) return;

        await enrichItemWithOmdb(item, extIds.imdb_id, doLiveFetch ? 1 : 0);
      } catch {
        // 单个失败不影响整体
      }
    }));
  }
}

// ======================== 类型 ========================

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

interface TmdbCredit {
  id: number;
  name: string;
  profile_path: string | null;
  character: string;
  order: number;
  known_for_department: string;
}

// ======================== 导出 API 函数 ========================

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

  await enrichListWithCachedRatings(combined, 8);
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
  await markLocalItems(items);

  return { items, totalPages: data.total_pages, totalResults: data.total_results };
}

// === 5. 影视详情（带全量外部评分） ===
export async function getDetail(mediaType: 'movie' | 'tv', id: number): Promise<MediaWithRatings | null> {
  try {
    const detail = await tmdbGet<TmdbDetail & { external_ids?: TmdbExternalIds; credits?: { cast: TmdbCredit[] } }>(
      `/${mediaType}/${id}`,
      { append_to_response: 'external_ids,credits' },
    );

    const externalIds = detail.external_ids;

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

    if (externalIds?.imdb_id) cacheExternalId(id, mediaType, externalIds.imdb_id);

    const imdbId = externalIds?.imdb_id;
    if (imdbId) {
      fetchAndCacheOmdb(imdbId, id, mediaType).catch(() => {});
      await enrichItemWithOmdb(result, imdbId, 0);
    }

    return result;
  } catch {
    return null;
  }
}

// === 5b. 影视详情（完整版：含 credits + recommendations） ===
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
