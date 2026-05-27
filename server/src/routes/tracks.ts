import { Router } from 'express';
import { listTracks, removeTracks, getFfmpegHealth } from '../services/track-manager';
import { getProgress } from '../services/progress-tracker';
import { badRequest, notFound, internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse } from '../types/api';
import type { MediaTrack, TrackRemoveRequest, TrackRemoveResult, TrackHealthStatus } from '../services/track-manager';
import type { OperationProgress } from '../services/progress-tracker';

const router = Router();

// ======================== Middleware: ffmpeg check ========================

function requireFfmpeg(_req: any, _res: any, next: any) {
  const health = getFfmpegHealth();
  if (!health.available) {
    return _res.status(503).json({
      error: 'ffmpeg not installed. Please install ffmpeg and restart the server.',
      code: 'SERVICE_UNAVAILABLE',
      details: health.error,
    });
  }
  next();
}

// ======================== Routes ========================

/**
 * GET /api/tracks/health
 * Check ffmpeg availability (does not require ffmpeg).
 */
router.get('/health', async (
  _req,
  res: TypedResponse<TrackHealthStatus>
) => {
  try {
    const health = getFfmpegHealth();
    res.json(health);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Check ffmpeg status failed: ' + message);
  }
});

/**
 * GET /api/tracks/:id
 * List all tracks for a media file.
 */
router.get('/:id', requireFfmpeg, async (
  req: TypedRequest<{ id: string }>,
  res: TypedResponse<{ tracks: MediaTrack[] }>
) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw badRequest('Invalid ID');

    const tracks = await listTracks(id);
    res.json({ tracks });
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Get track info failed: ' + message);
  }
});

/**
 * POST /api/tracks/remove
 * Remove specified tracks from a media file.
 */
router.post('/remove', requireFfmpeg, async (
  req: TypedRequest<Record<string, string>, TrackRemoveRequest>,
  res: TypedResponse<TrackRemoveResult>
) => {
  try {
    const { mediaId, trackIndices } = req.body;
    if (!mediaId || !trackIndices || trackIndices.length === 0) {
      throw badRequest('Missing mediaId or trackIndices');
    }

    const result = await removeTracks({ mediaId, trackIndices });
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Remove tracks failed: ' + message);
  }
});

/**
 * GET /api/tracks/preview
 * Preview what tracks would be removed (dry run).
 * Query params: ?mediaId=1&indices=2,3
 */
router.get('/preview', requireFfmpeg, async (
  req: TypedRequest<Record<string, string>, unknown, { mediaId?: string; indices?: string }>,
  res: TypedResponse<{ tracks: MediaTrack[]; toRemove: number[]; toKeep: number[] }>
) => {
  try {
    const mediaId = parseInt(req.query.mediaId || '');
    if (isNaN(mediaId)) throw badRequest('Invalid mediaId');

    const toRemove = (req.query.indices || '')
      .split(',')
      .map(Number)
      .filter(n => !isNaN(n));

    const tracks = await listTracks(mediaId);
    const toKeep = tracks
      .filter(t => !toRemove.includes(t.index))
      .map(t => t.index);

    res.json({ tracks, toRemove, toKeep });
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Preview failed: ' + message);
  }
});

/**
 * GET /api/tracks/status/:operationId
 * Poll track removal progress.
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

export default router;
