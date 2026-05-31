// === TMDB API 类型 ===

export interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  media_type: 'movie' | 'tv';
  original_language: string;
  popularity: number;
}

export interface TmdbTv {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  media_type: 'tv' | 'movie';
  original_language: string;
  popularity: number;
}

export interface TmdbDetail {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  genres: { id: number; name: string }[];
  production_countries: { iso_3166_1: string; name: string }[];
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status: string;
  release_date?: string;
  first_air_date?: string;
  last_air_date?: string;
  tagline: string;
  homepage: string;
  adult: boolean;
}

// === 下载相关类型 ===

export type DownloadStatus = 'none' | 'pending' | 'searching' | 'downloading' | 'downloaded' | 'failed';

export interface DownloadQueueItem {
  localId: number;
  title: string;
  year: number | null;
  mediaType: 'movie' | 'tv';
  tmdbId: number | null;
  enqueuedAt: number;
}

export interface DownloadLogEntry {
  id: number;
  local_id: number;
  title: string;
  media_type: 'movie' | 'tv';
  tmdb_id: number | null;
  quality: string | null;
  source_url: string | null;
  file_size: number;
  status: string;
  error_msg: string | null;
  aria2_gid: string | null;
  retry_count: number;
  started_at: string;
  completed_at: string | null;
}

export interface TmdbExternalIds {
  imdb_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
}

// === 聚合评分类型 ===

export interface RatingSource {
  source: string;      // 'TMDB' | 'IMDb'
  icon: string;        // 图标标识
  score: number;       // 评分（0-10）
  maxScore: number;    // 满分
  url?: string;        // 链接
}

export interface MediaWithRatings {
  id: number;
  tmdbId: number;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  year: string;
  mediaType: 'movie' | 'tv';
  ratings: RatingSource[];
  genres: string[];
  runtime?: number;
  status: string;
  tagline: string;
  // 本地字段
  localPath?: string;
  localId?: number;
  isLocal: boolean;
  // 扩展字段（详情页）
  credits?: CastMember[];
  recommendations?: RecommendationResult[];
}

// === 本地媒体类型 ===

export interface NfoRating {
  source: string;      // 'imdb' | 'tmdb' | 'rt' | 'metacritic' 等
  displayName: string;  // 'IMDb' | 'TMDB' 等
  score: number;
  maxScore: number;
  icon: string;         // 图标标识
}

export interface StreamInfo {
  video?: {
    codec?: string;       // 'hevc' | 'h264' 等
    width?: number;
    height?: number;
    resolution?: string;  // '3840x2160'
  };
  audio?: {
    codec?: string;       // 'dts' | 'aac' 等
    channels?: number;
    language?: string;
  };
  subtitles?: string[];   // 字幕语言列表 ['chi', 'eng']
}

export interface LocalMedia {
  id: number;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  year: number;
  local_path: string;
  poster_path: string | null;
  backdrop_path: string | null;
  clearlogo_path: string | null;
  file_size: number;
  nfo_ratings: NfoRating[] | null;
  stream_info: StreamInfo | null;
  imdb_id: string | null;
  nfo_plot: string | null;
  nfo_genres: string[] | null;
  nfo_runtime: number | null;
  nfo_tagline: string | null;
  nfo_actors: { name: string; character: string }[] | null;
  added_at: string;
  last_played_at: string | null;
  play_progress: number;
}

// === 演员阵容 ===
export interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
  order: number;
}

// === 推荐结果 ===
export interface RecommendationResult {
  id: number;
  title: string;
  posterPath: string | null;
  year: string;
  mediaType: 'movie' | 'tv';
}

export interface AppConfig {
  potplayer_path: string;
  media_root: string;
  tmdb_api_key: string;
  omdb_api_key?: string;
}
