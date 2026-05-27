/**
 * Re-export hub — preserves all existing imports while canonical
 * definitions live in ./types/api.ts.
 *
 * Existing code that does `import { MediaWithRatings } from '../types'`
 * continues to work without changes.
 */

// ─── Canonical API types (Api* prefix) ──────────────────────────────
export type {
  ApiRatingSource,
  ApiCastMember,
  ApiRecommendation,
  ApiMediaWithRatings,
  ApiLocalMedia,
  ApiNfoRating,
  ApiStreamInfo,
  ApiAppConfig,
  ApiGenre,
  ApiPaginatedResponse,
  ApiTrendingResponse,
  ApiMovieListResponse,
  ApiTvListResponse,
  ApiSearchResponse,
  ApiGenreListResponse,
  ApiLocalListResponse,
  ApiScanResult,
  ApiPlayResult,
  ApiOmdbUsageItem,
  ApiWatcherStatus,
  ApiWatcherAction,
} from './types/api'

// ─── Backward-compatible aliases (same shape, old names) ────────────
export type {
  ApiRatingSource as RatingSource,
  ApiCastMember as CastMember,
  ApiRecommendation as Recommendation,
  ApiMediaWithRatings as MediaWithRatings,
  ApiLocalMedia as LocalMedia,
  ApiNfoRating as NfoRating,
  ApiStreamInfo as StreamInfo,
  ApiAppConfig as AppConfig,
} from './types/api'
