import { Router } from 'express';
import { previewRename, executeRename, restructureDirectories, rollbackOperation, cleanupOldManifests } from '../services/file-organizer';
import { notFound, internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse } from '../types/api';
import type { OrganizeRequest, RenamePreview, OrganizeResult } from '../services/file-organizer';

const router = Router();

/**
 * GET /api/organize/preview
 * Preview rename changes without applying.
 * Query params: ?ids=1,2,3&pattern=title-year
 */
router.get('/preview', async (
  req: TypedRequest<Record<string, string>, unknown, { ids?: string; pattern?: string }>,
  res: TypedResponse<RenamePreview>
) => {
  try {
    const mediaIds = req.query.ids
      ? req.query.ids.split(',').map(Number).filter(n => !isNaN(n))
      : undefined;

    const result = await previewRename({
      mediaIds,
      pattern: req.query.pattern,
    });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Preview failed: ' + message);
  }
});

/**
 * POST /api/organize/rename
 * Execute batch rename based on metadata.
 */
router.post('/rename', async (
  req: TypedRequest<Record<string, string>, OrganizeRequest>,
  res: TypedResponse<OrganizeResult>
) => {
  try {
    const result = await executeRename(req.body || {});
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Rename failed: ' + message);
  }
});

/**
 * POST /api/organize/structure
 * Restructure directories to organized structure.
 */
router.post('/structure', async (
  req: TypedRequest<Record<string, string>, OrganizeRequest>,
  res: TypedResponse<OrganizeResult>
) => {
  try {
    const result = await restructureDirectories(req.body || {});
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Restructure failed: ' + message);
  }
});

/**
 * POST /api/organize/rollback/:operationId
 * Rollback a completed operation using its manifest.
 */
router.post('/rollback/:operationId', async (
  req: TypedRequest<{ operationId: string }>,
  res: TypedResponse<{ success: boolean; message: string }>
) => {
  try {
    const { operationId } = req.params;
    const result = await rollbackOperation(operationId);
    if (!result.success && result.message.includes('not found')) {
      throw notFound(result.message);
    }
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Rollback failed: ' + message);
  }
});

/**
 * POST /api/organize/cleanup
 * Clean up old rollback manifests.
 */
router.post('/cleanup', async (_req, res: TypedResponse<{ cleaned: number }>) => {
  try {
    const cleaned = await cleanupOldManifests();
    res.json({ cleaned });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Cleanup failed: ' + message);
  }
});

export default router;
