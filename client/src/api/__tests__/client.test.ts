import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { api, ApiError, NetworkError, RequestAbortedError } from '../client'

// ======================== Mock global fetch ========================

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  } as unknown as Response
}

function textResponse(body: string, status: number) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: vi.fn().mockRejectedValue(new Error('not json')),
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

// ======================== 测试用例 ========================

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  // ---------- Error classes ----------
  describe('Error classes', () => {
    it('ApiError 应包含 status 和 body', () => {
      const err = new ApiError('test', 404, 'not found')
      expect(err.name).toBe('ApiError')
      expect(err.status).toBe(404)
      expect(err.body).toBe('not found')
      expect(err.message).toBe('test')
    })

    it('NetworkError 应有默认中文消息', () => {
      const err = new NetworkError()
      expect(err.name).toBe('NetworkError')
      expect(err.message).toContain('网络')
    })

    it('RequestAbortedError 应有默认中文消息', () => {
      const err = new RequestAbortedError()
      expect(err.name).toBe('RequestAbortedError')
      expect(err.message).toContain('取消')
    })
  })

  // ---------- trending.get ----------
  describe('trending.get', () => {
    it('应请求 GET /api/trending', async () => {
      const data = { items: [] }
      mockFetch.mockResolvedValueOnce(jsonResponse(data))

      const result = await api.trending.get()
      expect(result).toEqual(data)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/trending',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('应传递 AbortSignal', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }))
      const controller = new AbortController()
      await api.trending.get(controller.signal)

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/trending',
        expect.objectContaining({ signal: controller.signal }),
      )
    })
  })

  // ---------- movies.list ----------
  describe('movies.list', () => {
    it('默认参数应请求 GET /api/movies?page=1', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], totalPages: 1 }))

      await api.movies.list()
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/movies?page=1',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('应支持自定义 page 和 genre', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], totalPages: 10 }))

      await api.movies.list(3, '28')
      const url = (mockFetch as Mock).mock.calls[0][0] as string
      expect(url).toContain('page=3')
      expect(url).toContain('genre=28')
    })

    it('genre 为空时不传 genre 参数', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], totalPages: 1 }))
      await api.movies.list(1, '')
      const url = (mockFetch as Mock).mock.calls[0][0] as string
      expect(url).not.toContain('genre')
    })
  })

  // ---------- tv.list ----------
  describe('tv.list', () => {
    it('默认参数应请求 GET /api/tv?page=1', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], totalPages: 1 }))
      await api.tv.list()
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tv?page=1',
        expect.objectContaining({ method: 'GET' }),
      )
    })
  })

  // ---------- genres ----------
  describe('genres', () => {
    it('movies.genres 应请求 /api/movies/genres', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]))
      await api.movies.genres()
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/movies/genres',
        expect.anything(),
      )
    })

    it('tv.genres 应请求 /api/tv/genres', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]))
      await api.tv.genres()
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tv/genres',
        expect.anything(),
      )
    })
  })

  // ---------- search ----------
  describe('search', () => {
    it('应构建正确的搜索 URL', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], totalPages: 0 }))
      await api.search('inception', 2)
      const url = (mockFetch as Mock).mock.calls[0][0] as string
      expect(url).toContain('/api/search?')
      expect(url).toContain('q=inception')
      expect(url).toContain('page=2')
    })
  })

  // ---------- detail.get ----------
  describe('detail.get', () => {
    it('应请求 GET /api/detail/movie/123', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 123 }))
      await api.detail.get('movie', 123)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/detail/movie/123',
        expect.anything(),
      )
    })

    it('应支持 tv 类型', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 456 }))
      await api.detail.get('tv', 456)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/detail/tv/456',
        expect.anything(),
      )
    })
  })

  // ---------- local ----------
  describe('local', () => {
    it('list 应请求 GET /api/local', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }))
      await api.local.list()
      expect(mockFetch).toHaveBeenCalledWith('/api/local', expect.anything())
    })

    it('detail 应请求 GET /api/local/detail/:id', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }))
      await api.local.detail(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/local/detail/1', expect.anything())
    })

    it('save 应发送 POST 请求及 body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
      const data = { tmdb_id: 100, media_type: 'movie' as const, title: 'Test' }
      await api.local.save(data)

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/local/save',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
        }),
      )
    })

    it('delete 应发送 DELETE 请求', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
      await api.local.delete(42)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/local/42?deleteFiles=true',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })

    it('scan 应发送 POST 请求及 path', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ scanned: 5 }))
      await api.local.scan('/media/movies')
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/local/scan',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ path: '/media/movies' }),
        }),
      )
    })

    it('play 应发送 POST 请求', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
      await api.local.play(7)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/local/play/7',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('batchDelete 应依次 delete 每个 id', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ ok: true }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }))

      await api.local.batchDelete([1, 2, 3])
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  // ---------- config ----------
  describe('config', () => {
    it('get 应请求 GET /api/config', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}))
      await api.config.get()
      expect(mockFetch).toHaveBeenCalledWith('/api/config', expect.anything())
    })

    it('update 应发送 PUT 请求及 body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
      await api.config.update({ theme: 'dark' } as any)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/config',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ theme: 'dark' }),
        }),
      )
    })

    it('omdbUsage 应请求 GET /api/config/omdb-usage', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]))
      await api.config.omdbUsage()
      expect(mockFetch).toHaveBeenCalledWith('/api/config/omdb-usage', expect.anything())
    })
  })

  // ---------- watcher ----------
  describe('watcher', () => {
    it('status 应请求 GET /api/watcher/status', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ running: false }))
      await api.watcher.status()
      expect(mockFetch).toHaveBeenCalledWith('/api/watcher/status', expect.anything())
    })

    it('start 应发送 POST 请求及 watch_dir', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
      await api.watcher.start('/media')
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/watcher/start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ watch_dir: '/media' }),
        }),
      )
    })

    it('stop 应发送 POST 请求', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
      await api.watcher.stop()
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/watcher/stop',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  // ---------- HTTP 错误处理 ----------
  describe('HTTP 错误处理', () => {
    it('应抛出 ApiError 包含 status 和 body', async () => {
      mockFetch.mockResolvedValue(textResponse('Not Found', 404))

      await expect(api.trending.get()).rejects.toMatchObject({
        name: 'ApiError',
        status: 404,
        body: 'Not Found',
      })
    })

    it('500 错误应抛出 ApiError', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('Internal Error', 500))

      await expect(api.movies.list()).rejects.toThrow(ApiError)
    })

    it('应包含请求失败中文消息', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('', 403))

      await expect(api.detail.get('movie', 1)).rejects.toThrow(/请求失败/)
    })
  })

  // ---------- 网络错误处理 ----------
  describe('网络错误处理', () => {
    it('TypeError 应抛出 NetworkError', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

      await expect(api.trending.get()).rejects.toThrow(NetworkError)
    })

    it('非 TypeError/DOMException 应直接抛出', async () => {
      const unknownError = new Error('something else')
      mockFetch.mockRejectedValueOnce(unknownError)

      await expect(api.trending.get()).rejects.toThrow('something else')
    })
  })

  // ---------- 请求取消处理 ----------
  describe('请求取消处理', () => {
    it('AbortError DOMException 应抛出 RequestAbortedError', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError')
      mockFetch.mockRejectedValueOnce(abortError)

      await expect(api.trending.get()).rejects.toThrow(RequestAbortedError)
    })
  })

  // ---------- Content-Type 处理 ----------
  describe('Content-Type 处理', () => {
    it('有 body 时应设置 Content-Type: application/json', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
      await api.local.save({ tmdb_id: 1, media_type: 'movie', title: 'X' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      )
    })

    it('无 body 时不应设置 Content-Type', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]))
      await api.trending.get()

      const headers = (mockFetch as Mock).mock.calls[0][1].headers as Record<string, string>
      expect(headers['Content-Type']).toBeUndefined()
    })

    it('body 应被 JSON.stringify', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
      const data = { tmdb_id: 1, media_type: 'movie' as const, title: 'Test' }
      await api.local.save(data)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ body: JSON.stringify(data) }),
      )
    })
  })
})
