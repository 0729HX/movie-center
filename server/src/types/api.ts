/**
 * API 请求/响应类型定义
 *
 * 为 Express 路由处理器提供类型安全的 Request / Response 泛型。
 * 用法示例：
 *   import type { TypedRequest, TypedResponse } from '../types/api';
 *   router.get('/:id', (req: TypedRequest<{ id: string }>, res: TypedResponse<DetailResponse>) => { ... });
 */

import type { Request, Response } from 'express';
import type { MediaWithRatings, RatingSource, CastMember, RecommendationResult } from '../types';

// ======================== 通用响应 ========================

/** 标准错误响应 */
export interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

/** 分页元数据 */
export interface PaginationMeta {
  totalPages: number;
  totalResults?: number;
}

// ======================== 详情相关 ========================

export interface DetailResponse extends MediaWithRatings {
  credits: CastMember[];
  recommendations: RecommendationResult[];
}

// ======================== 列表相关 ========================

export interface ListResponse {
  items: MediaWithRatings[];
  totalPages: number;
}

export interface SearchResponse {
  items: MediaWithRatings[];
  totalPages: number;
  totalResults: number;
}

// ======================== 配置相关 ========================

export interface ConfigResponse {
  [key: string]: string;
}

export interface OmdbUsageStat {
  key: string;
  usage: number;
  limit: number;
  remaining: number;
}

// ======================== 分类相关 ========================

export interface GenreItem {
  id: number;
  name: string;
}

// ======================== 推荐/演员 ========================

export interface CreditItem {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
  order: number;
}

export interface RecommendationItem {
  id: number;
  title: string;
  posterPath: string | null;
  year: string;
  mediaType: 'movie' | 'tv';
}

// ======================== 本地媒体 ========================

export interface LocalMediaItem {
  id: number;
  tmdb_id: number | null;
  media_type: 'movie' | 'tv';
  title: string;
  year: number | null;
  local_path: string;
  poster_path: string | null;
  backdrop_path: string | null;
  clearlogo_path: string | null;
  file_size: number;
  nfo_ratings: any[] | null;
  stream_info: any | null;
  imdb_id: string | null;
  nfo_plot: string | null;
  nfo_genres: string[] | null;
  nfo_runtime: number | null;
  nfo_tagline: string | null;
  nfo_actors: { name: string; character: string }[] | null;
  added_at: string;
  last_played_at: string | null;
  play_progress: number;
  // 下载相关字段
  download_status?: 'none' | 'pending' | 'searching' | 'downloading' | 'downloaded' | 'failed';
  download_progress?: number;
  download_quality?: string | null;
  download_error?: string | null;
  download_url?: string | null;
  aria2_gid?: string | null;
  download_started_at?: string | null;
  download_completed_at?: string | null;
}

// ======================== 下载相关 ========================

export type ApiDownloadStatus = 'none' | 'pending' | 'searching' | 'downloading' | 'downloaded' | 'failed';

export interface ApiDownloadStatusResponse {
  download_status: ApiDownloadStatus;
  download_progress: number;
  download_quality: string | null;
  download_error: string | null;
  download_url: string | null;
  estimated_time?: string;
}

export interface ApiDownloadQueueStatus {
  queueLength: number;
  activeCount: number;
  maxConcurrent: number;
  items: Array<{ localId: number; title: string; enqueuedAt: number }>;
}

export interface ApiDownloadLogEntry {
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

// ======================== 健康检查 ========================

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

// ======================== Typed Request / Response 工具类型 ========================

/**
 * 类型化的 Express Request
 * @tparam P - URL params 类型
 * @tparam B - request body 类型
 * @tparam Q - query string 类型
 */
export type TypedRequest<
  P = Record<string, string>,
  B = unknown,
  Q = Record<string, string>,
> = Request<P, unknown, B, Q>;

/**
 * 类型化的 Express Response，强制 res.json() 的参数类型
 * @tparam T - 响应体类型
 */
export type TypedResponse<T> = Response<T | ErrorResponse>;
