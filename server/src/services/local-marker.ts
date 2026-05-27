/**
 * 本地已存标记 — 批量标记列表中哪些已经在本地收藏
 *
 * 策略：
 *  1. 精确 tmdb_id 匹配（速度快）
 *  2. 标题 + 年份模糊匹配（兜底 tmdb_id 为 NULL 的记录）
 */

import { query } from '../db';
import type { MediaWithRatings } from '../types';

export async function markLocalItems(items: MediaWithRatings[]): Promise<void> {
  if (items.length === 0) return;

  // 第一步：按 tmdb_id 精确匹配
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
  const allLocal: any[] = await query(
    "SELECT id, tmdb_id, title, year, media_type, local_path FROM local_media WHERE tmdb_id IS NULL"
  );

  for (const item of items) {
    const key = `${item.mediaType}-${item.tmdbId}`;
    if (localMap.has(key)) continue;

    const itemTitle = item.title.toLowerCase().trim();
    const itemTitleNorm = itemTitle
      .replace(/[：:].*$/, '')
      .replace(/[\(（].*[\)）]/g, '')
      .replace(/[^\w一-鿿]/g, '')
      .trim();

    const itemYear = parseInt(item.year);

    for (const local of allLocal) {
      if (local.media_type !== item.mediaType) continue;

      let localTitle = local.title.toLowerCase().trim();
      const localTitleNorm = localTitle
        .replace(/[\(（\[][^\)）\]]*[\)）\]]/g, '')
        .replace(/[：:].*$/, '')
        .replace(/[^\w一-鿿]/g, '')
        .replace(/\s+/g, '')
        .trim();

      const exactMatch = localTitle === itemTitle;
      const normMatch = localTitleNorm === itemTitleNorm;
      const containsMatch = localTitleNorm.includes(itemTitleNorm) || itemTitleNorm.includes(localTitleNorm);
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
