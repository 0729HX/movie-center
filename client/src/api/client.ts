/**
 * Type-safe API client for Movie Center.
 *
 * Usage:
 *   import { api } from '../api/client'
 *   const { items } = await api.trending.get()
 *   const detail = await api.detail.get('movie', 123)
 */

import { showToast } from '../context/ToastContext'
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
  ApiOperationProgress,
  ApiScrapeRequest,
  ApiScrapeResult,
  ApiScrapePreview,
  ApiSubtitleSearchResult,
  ApiSubtitleDownloadRequest,
  ApiSubtitleDownloadResult,
  ApiSubtitleLanguage,
  ApiRenamePreview,
  ApiOrganizeRequest,
  ApiOrganizeResult,
  ApiMediaTrack,
  ApiTrackHealthStatus,
  ApiTrackRemoveRequest,
  ApiTrackRemoveResult,
  ApiDownloadStatusResponse,
  ApiDownloadQueueStatus,
  ApiDownloadLogEntry,
  ApiDownloadTestResult,
  ApiAria2HealthResult,
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
      showToast('网络请求失败，请检查网络连接', 'error')
      throw new NetworkError()
    }
    throw err
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    showToast(`请求失败: ${res.status} ${res.statusText}`, 'error')
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
      data: { tmdb_id: number; media_type: 'movie' | 'tv'; title: string; year?: number },
      signal?: AbortSignal,
    ): Promise<unknown> {
      return request('/local/save', { method: 'POST', body: data, signal })
    },

    delete(id: number, deleteFiles = true, signal?: AbortSignal): Promise<unknown> {
      return request(`/local/${id}?deleteFiles=${deleteFiles}`, { method: 'DELETE', signal })
    },

    scan(path: string, signal?: AbortSignal): Promise<ApiScanResult> {
      return request('/local/scan', { method: 'POST', body: { path }, signal })
    },

    play(id: number, signal?: AbortSignal): Promise<ApiPlayResult> {
      return request(`/local/play/${id}`, { method: 'POST', signal })
    },

    recentlyWatched(signal?: AbortSignal): Promise<ApiLocalListResponse> {
      return request('/local/recently-watched', { signal })
    },

    reportProgress(id: number, seconds: number, signal?: AbortSignal): Promise<unknown> {
      return request('/local/progress', { method: 'POST', body: { id, seconds }, signal })
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

  /** 元数据抓取 */
  metadata: {
    scrape(data: ApiScrapeRequest = {}, signal?: AbortSignal): Promise<ApiScrapeResult> {
      return request('/metadata/scrape', { method: 'POST', body: data, signal })
    },

    status(operationId: string, signal?: AbortSignal): Promise<ApiOperationProgress> {
      return request(`/metadata/status/${operationId}`, { signal })
    },

    preview(id: number, signal?: AbortSignal): Promise<ApiScrapePreview> {
      return request(`/metadata/preview/${id}`, { signal })
    },
  },

  /** 字幕管理 */
  subtitles: {
    languages(signal?: AbortSignal): Promise<{ languages: ApiSubtitleLanguage[]; configured: boolean }> {
      return request('/subtitles/languages', { signal })
    },

    search(id: number, language?: string, signal?: AbortSignal): Promise<{ results: ApiSubtitleSearchResult[]; configured: boolean }> {
      const params = new URLSearchParams()
      if (language) params.set('language', language)
      const qs = params.toString()
      return request(`/subtitles/search/${id}${qs ? `?${qs}` : ''}`, { signal })
    },

    download(data: ApiSubtitleDownloadRequest, signal?: AbortSignal): Promise<ApiSubtitleDownloadResult> {
      return request('/subtitles/download', { method: 'POST', body: data, signal })
    },
  },

  /** 文件整理 */
  organize: {
    preview(ids?: number[], pattern?: string, signal?: AbortSignal): Promise<ApiRenamePreview> {
      const params = new URLSearchParams()
      if (ids && ids.length > 0) params.set('ids', ids.join(','))
      if (pattern) params.set('pattern', pattern)
      const qs = params.toString()
      return request(`/organize/preview${qs ? `?${qs}` : ''}`, { signal })
    },

    rename(data: ApiOrganizeRequest, signal?: AbortSignal): Promise<ApiOrganizeResult> {
      return request('/organize/rename', { method: 'POST', body: data, signal })
    },

    structure(data: ApiOrganizeRequest, signal?: AbortSignal): Promise<ApiOrganizeResult> {
      return request('/organize/structure', { method: 'POST', body: data, signal })
    },

    rollback(operationId: string, signal?: AbortSignal): Promise<{ success: boolean; message: string }> {
      return request(`/organize/rollback/${operationId}`, { method: 'POST', signal })
    },
  },

  /** 轨道管理 */
  tracks: {
    health(signal?: AbortSignal): Promise<ApiTrackHealthStatus> {
      return request('/tracks/health', { signal })
    },

    list(id: number, signal?: AbortSignal): Promise<{ tracks: ApiMediaTrack[] }> {
      return request(`/tracks/${id}`, { signal })
    },

    remove(data: ApiTrackRemoveRequest, signal?: AbortSignal): Promise<ApiTrackRemoveResult> {
      return request('/tracks/remove', { method: 'POST', body: data, signal })
    },

    preview(mediaId: number, indices: number[], signal?: AbortSignal): Promise<{ tracks: ApiMediaTrack[]; toRemove: number[]; toKeep: number[] }> {
      const params = new URLSearchParams({
        mediaId: String(mediaId),
        indices: indices.join(','),
      })
      return request(`/tracks/preview?${params}`, { signal })
    },

    status(operationId: string, signal?: AbortSignal): Promise<ApiOperationProgress> {
      return request(`/tracks/status/${operationId}`, { signal })
    },
  },

  /** 下载管理 */
  download: {
    /** 加入下载队列 */
    queue(localId: number, signal?: AbortSignal): Promise<{ success: boolean; status: string; message: string }> {
      return request('/download/queue', { method: 'POST', body: { local_id: localId }, signal })
    },

    /** 批量加入队列 */
    queueBatch(localIds: number[], signal?: AbortSignal): Promise<{ queued: number; skipped: number; messages: string[] }> {
      return request('/download/queue/batch', { method: 'POST', body: { local_ids: localIds }, signal })
    },

    /** 获取队列状态 */
    queueStatus(signal?: AbortSignal): Promise<ApiDownloadQueueStatus> {
      return request('/download/queue', { signal })
    },

    /** 取消下载 */
    cancel(localId: number, signal?: AbortSignal): Promise<{ success: boolean; message: string }> {
      return request(`/download/queue/${localId}`, { method: 'DELETE', signal })
    },

    /** 重试失败下载 */
    retry(localId: number, signal?: AbortSignal): Promise<{ queued: boolean; message: string }> {
      return request(`/download/retry/${localId}`, { method: 'POST', signal })
    },

    /** 查询下载状态 */
    status(localId: number, signal?: AbortSignal): Promise<ApiDownloadStatusResponse> {
      return request(`/download/status/${localId}`, { signal })
    },

    /** 获取下载日志 */
    log(limit = 50, signal?: AbortSignal): Promise<{ logs: ApiDownloadLogEntry[] }> {
      return request(`/download/log?limit=${limit}`, { signal })
    },

    /** 测试夸克连接 */
    testQuark(signal?: AbortSignal): Promise<ApiDownloadTestResult> {
      return request('/download/test/quark', { signal })
    },

    /** 测试 Aria2 连接 */
    testAria2(signal?: AbortSignal): Promise<ApiAria2HealthResult> {
      return request('/download/test/aria2', { signal })
    },

    readBrowserCookie(signal?: AbortSignal): Promise<{ success: boolean; browser?: string; cookie?: string; domains?: string[]; error?: string }> {
      return request('/download/browser-cookie', { signal })
    },
  },
} as const
