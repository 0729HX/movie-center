/**
 * Metadata Scraper Service - TMDB + OMDb fallback, batch scraping with concurrency control
 *
 * Scrapes metadata for local media files that lack TMDB IDs.
 * Uses ProgressTracker for polling-based progress reporting.
 * Concurrency limit: 3 concurrent API requests.
 */

import { query } from '../db';
import { searchMedia, getDetail } from './tmdb';
import {
  startOperation,
  updateProgress,
  completeOperation,
  failOperation,
  generateOperationId,
} from './progress-tracker';

// ======================== Types ========================

export interface ScrapeRequest {
  /** Specific media IDs to scrape. If empty, scrapes all without tmdb_id. */
  ids?: number[];
}

export interface ScrapeResult {
  operationId: string;
  message: string;
}

export interface ScrapePreview {
  id: number;
  title: string;
  year: number | null;
  currentTmdbId: number | null;
  foundTmdbId: number | null;
  foundTitle: string | null;
  foundPoster: string | null;
  foundBackdrop: string | null;
  foundOverview: string | null;
  matchScore: 'high' | 'medium' | 'low' | 'none';
}

interface ScrapeItem {
  id: number;
  title: string;
  year: number | null;
  media_type: 'movie' | 'tv';
}

const CONCURRENCY_LIMIT = 3;

// ======================== Helpers ========================

function matchScore(
  titleA: string,
  titleB: string,
  yearA: number | null,
  yearB: string
): 'high' | 'medium' | 'low' | 'none' {
  const a = titleA.toLowerCase().trim();
  const b = titleB.toLowerCase().trim();

  if (a === b) {
    if (yearA && yearB && String(yearA) === yearB) return 'high';
    return 'medium';
  }
  if (a.includes(b) || b.includes(a)) {
    if (yearA && yearB && String(yearA) === yearB) return 'medium';
    return 'low';
  }
  if (a.slice(0, 6) === b.slice(0, 6)) {
    if (yearA && yearB && String(yearA) === yearB) return 'low';
  }
  return 'none';
}

// ======================== Core Scraping ========================

async function scrapeSingle(item: ScrapeItem): Promise<{
  tmdbId: number | null;
  title: string | null;
  poster: string | null;
  backdrop: string | null;
  overview: string | null;
  matchScore: 'high' | 'medium' | 'low' | 'none';
}> {
  try {
    let searchText = item.title;
    if (item.year) searchText += ' ' + item.year;

    const { items: results } = await searchMedia(searchText, 1);
    if (results.length === 0) {
      return { tmdbId: null, title: null, poster: null, backdrop: null, overview: null, matchScore: 'none' };
    }

    let bestMatch = results[0];
    let bestScore: 'high' | 'medium' | 'low' | 'none' = 'none';
    const scoreOrder: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };

    for (const r of results) {
      const score = matchScore(item.title, r.title, item.year, r.year);
      if (scoreOrder[score] > scoreOrder[bestScore]) {
        bestScore = score;
        bestMatch = r;
      }
    }

    const detail = await getDetail(item.media_type, bestMatch.tmdbId);

    return {
      tmdbId: bestMatch.tmdbId,
      title: detail?.title || bestMatch.title,
      poster: detail?.posterPath || bestMatch.posterPath,
      backdrop: detail?.backdropPath || bestMatch.backdropPath,
      overview: detail?.overview || bestMatch.overview,
      matchScore: bestScore,
    };
  } catch (err: any) {
    console.error('[MetadataScraper] Failed to scrape "' + item.title + '": ' + err.message);
    return { tmdbId: null, title: null, poster: null, backdrop: null, overview: null, matchScore: 'none' };
  }
}

// ======================== Batch Scraping ========================

async function runBatchScrape(operationId: string, items: ScrapeItem[]): Promise<void> {
  const total = items.length;
  let completed = 0;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i += CONCURRENCY_LIMIT) {
    const batch = items.slice(i, i + CONCURRENCY_LIMIT);

    await Promise.allSettled(
      batch.map(async (item) => {
        const result = await scrapeSingle(item);

        if (result.tmdbId && result.matchScore !== 'none') {
          await query(
            "UPDATE local_media SET tmdb_id = ?, scrape_status = 'scraped', last_scraped_at = NOW() WHERE id = ?",
            [result.tmdbId, item.id]
          );
          successCount++;
        } else {
          await query(
            "UPDATE local_media SET scrape_status = 'failed', last_scraped_at = NOW() WHERE id = ?",
            [item.id]
          );
          failCount++;
        }

        completed++;
        updateProgress(operationId, completed, 'Scraped ' + completed + '/' + total + ': ' + item.title);
      })
    );
  }

  completeOperation(operationId, { total, success: successCount, failed: failCount });
  console.log('[MetadataScraper] Batch complete: ' + successCount + ' found, ' + failCount + ' failed out of ' + total);
}

// ======================== Public API ========================

/**
 * Trigger batch scraping for local media.
 * Returns an operation ID for polling progress via ProgressTracker.
 */
export async function startScrape(req: ScrapeRequest): Promise<ScrapeResult> {
  let items: ScrapeItem[];

  if (req.ids && req.ids.length > 0) {
    const placeholders = req.ids.map(() => '?').join(',');
    const rows: any[] = await query(
      'SELECT id, title, year, media_type FROM local_media WHERE id IN (' + placeholders + ')',
      req.ids
    );
    items = rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      year: r.year,
      media_type: r.media_type as 'movie' | 'tv',
    }));
  } else {
    const rows: any[] = await query(
      "SELECT id, title, year, media_type FROM local_media WHERE (tmdb_id IS NULL OR tmdb_id = 0) AND (scrape_status IS NULL OR scrape_status = 'failed')"
    );
    items = rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      year: r.year,
      media_type: r.media_type as 'movie' | 'tv',
    }));
  }

  if (items.length === 0) {
    return { operationId: '', message: 'No media to scrape' };
  }

  const operationId = generateOperationId('scrape');
  startOperation(operationId, items.length, 'Scraping metadata for ' + items.length + ' items');

  for (const item of items) {
    await query("UPDATE local_media SET scrape_status = 'pending' WHERE id = ?", [item.id]);
  }

  // Run batch scrape asynchronously (does not block the response)
  runBatchScrape(operationId, items).catch((err) => {
    console.error('[MetadataScraper] Batch scrape error: ' + err.message);
    failOperation(operationId, err.message);
  });

  return { operationId, message: 'Started scraping ' + items.length + ' items' };
}

/**
 * Preview scraped metadata for a single local media item.
 * Searches TMDB and returns the best match without writing to DB.
 */
export async function previewScrape(id: number): Promise<ScrapePreview | null> {
  const rows: any[] = await query(
    'SELECT id, title, year, media_type, tmdb_id FROM local_media WHERE id = ?',
    [id]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  const item: ScrapeItem = { id: row.id, title: row.title, year: row.year, media_type: row.media_type };
  const result = await scrapeSingle(item);

  return {
    id: item.id,
    title: item.title,
    year: item.year,
    currentTmdbId: row.tmdb_id,
    foundTmdbId: result.tmdbId,
    foundTitle: result.title,
    foundPoster: result.poster,
    foundBackdrop: result.backdrop,
    foundOverview: result.overview,
    matchScore: result.matchScore,
  };
}
