/**
 * Type-safe API client for Movie Center.
 *
 * Usage:
 *   import { api } from '../api/client'
 *   const { items } = await api.trending.get()
 *   const detail = await api.detail.get('movie', 123)
 */

import type {
  ApiTrendingResponse,
  ApiMovieListResponse,
  ApiTvListResponse,
  ApiSearchResponse,
  ApiGenreListResponse,
  ApiMediaWithRatings,
  ApiLocalListResponse,
  ApiLocalMedia,
  ApiScanResult,
  ApiPlayResult,
  ApiAppConfig,
  ApiOmdbUsageItem,
  ApiWatcherStatus,
  ApiWatcherAction,
} from '../types/api'

// ─── Error hierarchy ────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class NetworkError extends Error {
  constructor(message = '网络请求失败，请检查网络连接') {
    super(message)
    this.name = 'NetworkError'
  }
}

export class RequestAbortedError extends Error {
  constructor(message = '请求已取消') {
    super(message)
    this.name = 'RequestAbortedError'
  }
}

// ─── Core fetch wrapper ─────────────────────────────────────────────

const BASE = '/api'

interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, headers: extraHeaders } = opts

  const headers: Record<string, string> = { ...extraHeaders }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new RequestAbortedError()
    }
    if (err instanceof TypeError) {
      throw new NetworkError()
    }
    throw err
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(`请求失败: ${res.status} ${res.statusText}`, res.status, text)
  }

  return res.json() as Promise<T>
}

// ─── API surface ────────────────────────────────────────────────────

export const api = {
  /** 热门榜单 */
  trending: {
    get(signal?: AbortSignal): Promise<ApiTrendingResponse> {
      return request('/trending', { signal })
    },
  },

  /** 电影列表 */
  movies: {
    list(page = 1, genre = '', signal?: AbortSignal): Promise<ApiMovieListResponse> {
      const params = new URLSearchParams({ page: String(page) })
      if (genre) params.set('genre', genre)
      return request(`/movies?${params}`, { signal })
    },
    genres(signal?: AbortSignal): Promise<ApiGenreListResponse> {
      return request('/movies/genres', { signal })
    },
  },

  /** 剧集列表 */
  tv: {
    list(page = 1, genre = '', signal?: AbortSignal): Promise<ApiTvListResponse> {
      const params = new URLSearchParams({ page: String(page) })
      if (genre) params.set('genre', genre)
      return request(`/tv?${params}`, { signal })
    },
    genres(signal?: AbortSignal): Promise<ApiGenreListResponse> {
      return request('/tv/genres', { signal })
    },
  },

  /** 搜索 */
  search(q: string, page = 1, signal?: AbortSignal): Promise<ApiSearchResponse> {
    const params = new URLSearchParams({ q, page: String(page) })
    return request(`/search?${params}`, { signal })
  },

  /** 影视详情 */
  detail: {
    get(type: 'movie' | 'tv', id: number, signal?: AbortSignal): Promise<ApiMediaWithRatings> {
      return request(`/detail/${type}/${id}`, { signal })
    },
  },

  /** 本地影视管理 */
  local: {
    list(signal?: AbortSignal): Promise<ApiLocalListResponse> {
      return request('/local', { signal })
    },

    detail(id: number, signal?: AbortSignal): Promise<ApiMediaWithRatings> {
      return request(`/local/detail/${id}`, { signal })
    },

    save(
      data: { tmdb_id: number; media_type: 'movie' | 'tv'; title: string },
      signal?: AbortSignal,
    ): Promise<unknown> {
      return request('/local/save', { method: 'POST', body: data, signal })
    },

    delete(id: number, signal?: AbortSignal): Promise<unknown> {
      return request(`/local/${id}`, { method: 'DELETE', signal })
    },

    scan(path: string, signal?: AbortSignal): Promise<ApiScanResult> {
      return request('/local/scan', { method: 'POST', body: { path }, signal })
    },

    play(id: number, signal?: AbortSignal): Promise<ApiPlayResult> {
      return request(`/local/play/${id}`, { method: 'POST', signal })
    },

    batchDelete(ids: number[]): Promise<unknown[]> {
      return Promise.all(ids.map(id => api.local.delete(id)))
    },
  },

  /** 应用配置 */
  config: {
    get(signal?: AbortSignal): Promise<ApiAppConfig> {
      return request('/config', { signal })
    },

    update(data: Partial<ApiAppConfig>, signal?: AbortSignal): Promise<unknown> {
      return request('/config', { method: 'PUT', body: data, signal })
    },

    omdbUsage(signal?: AbortSignal): Promise<ApiOmdbUsageItem[]> {
      return request('/config/omdb-usage', { signal })
    },
  },

  /** 文件监控 */
  watcher: {
    status(signal?: AbortSignal): Promise<ApiWatcherStatus> {
      return request('/watcher/status', { signal })
    },

    start(watchDir: string, signal?: AbortSignal): Promise<ApiWatcherAction> {
      return request('/watcher/start', { method: 'POST', body: { watch_dir: watchDir }, signal })
    },

    stop(signal?: AbortSignal): Promise<ApiWatcherAction> {
      return request('/watcher/stop', { method: 'POST', signal })
    },
  },
} as const
