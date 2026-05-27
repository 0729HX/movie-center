import { Router } from 'express';
import { getProgress } from '../services/progress-tracker';
import { startScrape, previewScrape } from '../services/metadata-scraper';
import { badRequest, notFound, internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse } from '../types/api';
import type { ScrapeRequest, ScrapeResult, ScrapePreview } from '../services/metadata-scraper';
import type { OperationProgress } from '../services/progress-tracker';

const router = Router();

/**
 * POST /api/metadata/scrape
 * Trigger batch metadata scraping for local media.
 * Body: { ids?: number[] }
 */
router.post('/scrape', async (
  req: TypedRequest<Record<string, string>, ScrapeRequest>,
  res: TypedResponse<ScrapeResult>
) => {
  try {
    const result = await startScrape(req.body || {});
    if (!result.operationId) {
      throw badRequest(result.message);
    }
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Metadata scrape error:', message);
    throw internalError('Start scrape failed: ' + message);
  }
});

/**
 * GET /api/metadata/status/:operationId
 * Poll scrape progress.
 */
router.get('/status/:operationId', (
  req: TypedRequest<{ operationId: string }>,
  res: TypedResponse<OperationProgress>
) => {
  try {
    const { operationId } = req.params;
    const progress = getProgress(operationId);
    if (!progress) {
      throw notFound('Operation not found or expired');
    }
    res.json(progress);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Get status failed: ' + message);
  }
});

/**
 * GET /api/metadata/preview/:id
 * Preview scraped metadata for a single local media item.
 */
router.get('/preview/:id', async (
  req: TypedRequest<{ id: string }>,
  res: TypedResponse<ScrapePreview>
) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw badRequest('Invalid ID');

    const preview = await previewScrape(id);
    if (!preview) {
      throw notFound('Local media not found');
    }
    res.json(preview);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Preview failed: ' + message);
  }
});

export default router;
