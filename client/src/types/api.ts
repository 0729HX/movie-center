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
  imdb_id: string | null
  nfo_plot: string | null
  nfo_genres: string[] | null
  nfo_runtime: number | null
  nfo_tagline: string | null
  nfo_actors: { name: string; character: string }[] | null
  added_at: string
  last_played_at: string | null
  play_progress: number
  // 下载相关字段
  download_status?: 'none' | 'pending' | 'searching' | 'downloading' | 'downloaded' | 'failed'
  download_progress?: number
  download_quality?: string | null
  download_error?: string | null
  download_url?: string | null
  aria2_gid?: string | null
  download_started_at?: string | null
  download_completed_at?: string | null
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

// ─── Operation progress (polling-based) ─────────────────────────────

export type ApiOperationStatus = 'running' | 'completed' | 'failed'

export interface ApiOperationProgress {
  id: string
  status: ApiOperationStatus
  total: number
  current: number
  description: string
  message?: string
  result?: unknown
  error?: string
  startedAt: number
  completedAt?: number
}

// ─── Metadata scraping ──────────────────────────────────────────────

export interface ApiScrapeRequest {
  ids?: number[]
}

export interface ApiScrapeResult {
  operationId: string
  message: string
}

export interface ApiScrapePreview {
  id: number
  title: string
  year: number | null
  currentTmdbId: number | null
  foundTmdbId: number | null
  foundTitle: string | null
  foundPoster: string | null
  foundBackdrop: string | null
  foundOverview: string | null
  matchScore: 'high' | 'medium' | 'low' | 'none'
}

// ─── Subtitles ──────────────────────────────────────────────────────

export interface ApiSubtitleSearchResult {
  id: number
  filename: string
  downloadCount: number
  language: string
  languageCode: string
  format: string
  rating: number
  uploader: string
  url: string
}

export interface ApiSubtitleDownloadRequest {
  mediaId: number
  subtitleId: number
}

export interface ApiSubtitleDownloadResult {
  success: boolean
  filePath: string
  message: string
}

export interface ApiSubtitleLanguage {
  code: string
  name: string
  localName: string
}

// ─── File organization ──────────────────────────────────────────────

export interface ApiRenameItem {
  mediaId: number
  oldPath: string
  newPath: string
}

export interface ApiOrganizeRequest {
  mediaIds?: number[]
  targetRoot?: string
  pattern?: string
}

export interface ApiRenamePreview {
  operationId: string
  items: ApiRenameItem[]
  conflicts: { path: string; existingFile: boolean }[]
}

export interface ApiOrganizeResult {
  operationId: string
  success: boolean
  renamed: number
  failed: number
  errors: string[]
  message: string
}

// ─── Track management ───────────────────────────────────────────────

export interface ApiMediaTrack {
  index: number
  type: 'video' | 'audio' | 'subtitle'
  codec: string
  language: string
  title: string
  default: boolean
  forced: boolean
  duration?: number
  width?: number
  height?: number
  channels?: number
  bitRate?: string
}

export interface ApiTrackHealthStatus {
  available: boolean
  version?: string
  error?: string
}

export interface ApiTrackRemoveRequest {
  mediaId: number
  trackIndices: number[]
}

export interface ApiTrackRemoveResult {
  operationId: string
  success: boolean
  originalSize: number
  newSize: number
  removedTracks: number
  message: string
}

// ─── Download ──────────────────────────────────────────────────────

export type ApiDownloadStatus = 'none' | 'pending' | 'searching' | 'downloading' | 'downloaded' | 'failed'

export interface ApiDownloadStatusResponse {
  download_status: ApiDownloadStatus
  download_progress: number
  download_quality: string | null
  download_error: string | null
  download_url: string | null
  estimated_time?: string
}

export interface ApiDownloadQueueStatus {
  queueLength: number
  activeCount: number
  maxConcurrent: number
  items: Array<{ localId: number; title: string; enqueuedAt: number }>
}

export interface ApiDownloadLogEntry {
  id: number
  local_id: number
  title: string
  media_type: 'movie' | 'tv'
  tmdb_id: number | null
  quality: string | null
  source_url: string | null
  file_size: number
  status: string
  error_msg: string | null
  aria2_gid: string | null
  retry_count: number
  started_at: string
  completed_at: string | null
}

export interface ApiDownloadTestResult {
  success: boolean
  message: string
}

export interface ApiAria2HealthResult {
  available: boolean
  version?: string
  error?: string
}
