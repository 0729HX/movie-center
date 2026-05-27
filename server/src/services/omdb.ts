/**
 * OMDb 服务 — Key 管理、限流、评分获取、DB 缓存读写
 *
 * 从 tmdb.ts 拆分而来，职责：
 * - 多 Key 轮转 + 日限额计数
 * - 从 OMDb API 获取 IMDb / RT / Metacritic 评分
 * - 写入/读取 rating_cache 表
 */

import axios from 'axios';
import { query } from '../db';
import { cacheIncr, cacheExpire, cacheCount, cacheSet } from './cache';

const OMDB_BASE = 'https://www.omdbapi.com';

// ======================== 常量 ========================

const OMDB_DAILY_LIMIT = 950;
const OMDB_KEY_QUOTA_BUMP = 9999;

// ======================== 评分类型 ========================

export interface OmdbRatings {
  imdb: number | null;       // IMDb 评分 (0-10)
  tomatoes: string | null;   // Rotten Tomatoes (如 "80%")
  metacritic: number | null; // Metacritic (0-100)
}

// ======================== Key 管理 + 限流 ========================

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function keySuffix(key: string): string {
  return key.slice(-6);
}

function usageRedisKey(key: string): string {
  return `omdb:usage:${getTodayStr()}:${keySuffix(key)}`;
}

function secondsUntilMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return Math.ceil((tomorrow.getTime() - now.getTime()) / 1000);
}

/** 从 config 值拆分逗号/换行分隔的 key 数组，过滤空值 */
function parseKeys(raw: string): string[] {
  return raw.split(/[,\n]+/).map(k => k.trim()).filter(Boolean);
}

/** 选择当日用量最少且未达限的 key，返回 null 表示全部用尽 */
export async function getBestKey(): Promise<string | null> {
  const rows: any[] = await query('SELECT `value` FROM config WHERE `key` = ?', ['omdb_api_key']);
  const raw = rows[0]?.value || '';
  const keys = parseKeys(raw);
  if (keys.length === 0) return null;

  let bestKey: string | null = null;
  let bestUsage = Infinity;

  for (const key of keys) {
    const usage = await cacheCount(usageRedisKey(key));
    if (usage < OMDB_DAILY_LIMIT && usage < bestUsage) {
      bestUsage = usage;
      bestKey = key;
    }
  }

  return bestKey;
}

/** 记录一次 OMDb 请求用量 */
export async function recordUsage(key: string): Promise<void> {
  const redisKey = usageRedisKey(key);
  await cacheIncr(redisKey);
  await cacheExpire(redisKey, secondsUntilMidnight() + 3600);
}

/** 标记某 key 当日已用尽 */
export async function markKeyExhausted(key: string): Promise<void> {
  const redisKey = usageRedisKey(key);
  await cacheSet(redisKey, OMDB_KEY_QUOTA_BUMP, secondsUntilMidnight() + 3600);
}

/** 获取所有 key 的当日用量统计（供 API 展示） */
export async function getOmdbUsageStats(): Promise<{ key: string; usage: number; limit: number; remaining: number }[]> {
  const rows: any[] = await query('SELECT `value` FROM config WHERE `key` = ?', ['omdb_api_key']);
  const raw = rows[0]?.value || '';
  const keys = parseKeys(raw);

  const stats = [];
  for (const key of keys) {
    const usage = await cacheCount(usageRedisKey(key));
    stats.push({
      key: keySuffix(key),
      usage,
      limit: 1000,
      remaining: Math.max(0, 1000 - usage),
    });
  }
  return stats;
}

// ======================== 评分获取 + DB 缓存 ========================

/**
 * 从 OMDb 获取全部评分并写入 rating_cache 表
 */
export async function fetchAndCacheOmdb(imdbId: string, tmdbId: number, mediaType: string): Promise<OmdbRatings> {
  const defaultResult: OmdbRatings = { imdb: null, tomatoes: null, metacritic: null };

  try {
    const apiKey = await getBestKey();
    if (!apiKey) {
      console.log(`[OMDb] 所有 key 已达日限额，跳过 ${imdbId}`);
      return defaultResult;
    }

    const { data } = await axios.get(OMDB_BASE, {
      params: { i: imdbId, apikey: apiKey },
      timeout: 5000,
    });

    if (data?.Response === 'False') {
      if (data?.Error?.includes('Request limit reached')) {
        console.log(`[OMDb] key ***${keySuffix(apiKey)} 达到限额，标记用尽`);
        await markKeyExhausted(apiKey);
      }
      return defaultResult;
    }

    await recordUsage(apiKey);

    const result: OmdbRatings = {
      imdb: data.imdbRating && data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null,
      tomatoes: null,
      metacritic: null,
    };

    if (data.Ratings) {
      for (const r of data.Ratings) {
        if (r.Source === 'Rotten Tomatoes') result.tomatoes = r.Value;
        if (r.Source === 'Metacritic') result.metacritic = parseInt(r.Value);
      }
    }

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
export async function getCachedOmdb(imdbId: string): Promise<OmdbRatings | null> {
  try {
    const rows: any[] = await query(
      'SELECT imdb_score, tomatoes_score, metacritic_score FROM rating_cache WHERE imdb_id = ?',
      [imdbId]
    );
    if (rows.length > 0) {
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
