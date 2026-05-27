/**
 * API response types for the Movie Center frontend.
 *
 * Naming convention:
 *   - Api* prefix for all API response shapes
 *   - camelCase fields (matching what the frontend already consumes)
 *   - snake_case only where the server literally returns snake_case
 *     (LocalMedia, AppConfig) — these are kept as-is to avoid runtime breakage
 */

// ─── Rating ─────────────────────────────────────────────────────────

export interface ApiRatingSource {
  source: string
  icon: string
  score: number
  maxScore: number
  url?: string
}

// ─── Cast & Recommendations ─────────────────────────────────────────

export interface ApiCastMember {
  id: number
  name: string
  character: string
  profilePath: string | null
  order: number
}

export interface ApiRecommendation {
  id: number
  title: string
  posterPath: string | null
  year: string
  mediaType: 'movie' | 'tv'
}

// ─── Core media (list + detail) ─────────────────────────────────────

export interface ApiMediaWithRatings {
  id: number
  tmdbId: number
  title: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  year: string
  mediaType: 'movie' | 'tv'
  ratings: ApiRatingSource[]
  genres: string[]
  runtime?: number
  status: string
  tagline: string
  // local fields
  localPath?: string
  localId?: number
  isLocal: boolean
  // NFO local data
  nfoRatings?: ApiNfoRating[]
  streamInfo?: ApiStreamInfo | null
  clearlogoPath?: string | null
  // detail-only fields
  credits?: ApiCastMember[]
  recommendations?: ApiRecommendation[]
}

// ─── NFO rating from local scrape ───────────────────────────────────

export interface ApiNfoRating {
  source: string
  displayName: string
  score: number
  maxScore: number
  icon: string
}

// ─── Stream info from NFO ───────────────────────────────────────────

export interface ApiStreamInfo {
  video?: {
    codec?: string
    width?: number
    height?: number
    resolution?: string
  }
  audio?: {
    codec?: string
    channels?: number
    language?: string
  }
  subtitles?: string[]
}

// ─── Local media (server returns snake_case) ────────────────────────

export interface ApiLocalMedia {
  id: number
  tmdb_id: number
  media_type: 'movie' | 'tv'
  title: string
  year: number
  local_path: string
  poster_path: string | null
  backdrop_path: string | null
  clearlogo_path: string | null
  file_size: number
  nfo_ratings: ApiNfoRating[] | null
  stream_info: ApiStreamInfo | null
  added_at: string
}

// ─── App config (server returns snake_case) ─────────────────────────

export interface ApiAppConfig {
  potplayer_path: string
  media_root: string
  tmdb_api_key: string
  omdb_api_key?: string
  tmm_path?: string
  tmm_args?: string
  watch_dir?: string
  output_dir?: string
}

// ─── Genre ──────────────────────────────────────────────────────────

export interface ApiGenre {
  id: number
  name: string
}

// ─── Paginated list envelope ────────────────────────────────────────

export interface ApiPaginatedResponse<T> {
  items: T[]
  totalPages: number
  totalResults?: number
}

// ─── Specific list responses ────────────────────────────────────────

export type ApiTrendingResponse = ApiPaginatedResponse<ApiMediaWithRatings>
export type ApiMovieListResponse = ApiPaginatedResponse<ApiMediaWithRatings>
export type ApiTvListResponse = ApiPaginatedResponse<ApiMediaWithRatings>
export type ApiSearchResponse = ApiPaginatedResponse<ApiMediaWithRatings>

export interface ApiGenreListResponse {
  genres: ApiGenre[]
}

export type ApiLocalListResponse = ApiPaginatedResponse<ApiLocalMedia>

// ─── Scan result ────────────────────────────────────────────────────

export interface ApiScanResult {
  added: number
  updated: number
  skipped: number
  errors: string[]
  message?: string
}

// ─── Play result ────────────────────────────────────────────────────

export interface ApiPlayResult {
  success: boolean
  message?: string
}

// ─── OMDb usage ─────────────────────────────────────────────────────

export interface ApiOmdbUsageItem {
  key: string
  usage: number
  limit: number
  remaining: number
}

// ─── Watcher status ─────────────────────────────────────────────────

export interface ApiWatcherStatus {
  active: boolean
}

export interface ApiWatcherAction {
  message?: string
}
