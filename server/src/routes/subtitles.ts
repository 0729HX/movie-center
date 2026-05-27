import { Router } from 'express';
import { searchSubtitles, downloadSubtitle, getSupportedLanguages, isApiKeyConfigured } from '../services/subtitle-manager';
import { badRequest, internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse } from '../types/api';
import type { SubtitleSearchResult, SubtitleDownloadRequest, SubtitleDownloadResult, SubtitleLanguage } from '../services/subtitle-manager';

const router = Router();

/**
 * GET /api/subtitles/languages
 * List supported subtitle languages.
 */
router.get('/languages', (_req, res: TypedResponse<{ languages: SubtitleLanguage[]; configured: boolean }>) => {
  try {
    const languages = getSupportedLanguages();
    res.json({ languages, configured: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw internalError('Get languages failed: ' + message);
  }
});

/**
 * GET /api/subtitles/search/:id
 * Search subtitles for a local media item.
 * Query params: ?language=zh
 */
router.get('/search/:id', async (
  req: TypedRequest<{ id: string }, unknown, { language?: string }>,
  res: TypedResponse<{ results: SubtitleSearchResult[]; configured: boolean }>
) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw badRequest('Invalid ID');

    const configured = await isApiKeyConfigured();
    if (!configured) {
      return res.json({ results: [], configured: false });
    }

    const results = await searchSubtitles(id, req.query.language);
    res.json({ results, configured: true });
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('API Key')) {
      throw badRequest(message);
    }
    throw internalError('Search subtitles failed: ' + message);
  }
});

/**
 * POST /api/subtitles/download
 * Download a subtitle file alongside the video.
 */
router.post('/download', async (
  req: TypedRequest<Record<string, string>, SubtitleDownloadRequest>,
  res: TypedResponse<SubtitleDownloadResult>
) => {
  try {
    const { mediaId, subtitleId } = req.body;
    if (!mediaId || !subtitleId) {
      throw badRequest('Missing mediaId or subtitleId');
    }

    const result = await downloadSubtitle({ mediaId, subtitleId });
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('API Key')) {
      throw badRequest(message);
    }
    throw internalError('Download subtitle failed: ' + message);
  }
});

export default router;
