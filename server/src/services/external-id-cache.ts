/**
 * External ID 内存缓存 — tmdb_id ↔ imdb_id 映射
 *
 * external_ids 的映射关系几乎不变，用内存缓存避免重复 TMDB 请求。
 * TTL 24 小时，过期自动清理。
 */

const EXTERNAL_ID_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const externalIdCache = new Map<string, { imdbId: string | null; ts: number }>();

export function cacheExternalId(tmdbId: number, mediaType: string, imdbId: string | null): void {
  externalIdCache.set(`${mediaType}:${tmdbId}`, { imdbId, ts: Date.now() });
}

/**
 * 查询内存缓存。
 * - 返回 `string`  → 命中且有 imdbId
 * - 返回 `null`    → 命中但无 imdbId（该条目没有 IMDb 关联）
 * - 返回 `undefined` → 未命中或已过期
 */
export function getCachedExternalId(tmdbId: number, mediaType: string): string | null | undefined {
  const key = `${mediaType}:${tmdbId}`;
  const entry = externalIdCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > EXTERNAL_ID_CACHE_TTL) {
    externalIdCache.delete(key);
    return undefined;
  }
  return entry.imdbId;
}
