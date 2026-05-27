import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cacheExternalId, getCachedExternalId } from '../external-id-cache'

// ======================== 测试用例 ========================

describe('external-id-cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---------- 基本读写 ----------
  describe('基本读写', () => {
    it('写入后应能读取到 imdbId', () => {
      cacheExternalId(12345, 'movie', 'tt1234567')
      const result = getCachedExternalId(12345, 'movie')
      expect(result).toBe('tt1234567')
    })

    it('不同 mediaType 应独立缓存', () => {
      cacheExternalId(100, 'movie', 'tt_movie')
      cacheExternalId(100, 'tv', 'tt_tv')

      expect(getCachedExternalId(100, 'movie')).toBe('tt_movie')
      expect(getCachedExternalId(100, 'tv')).toBe('tt_tv')
    })

    it('不同 tmdbId 应独立缓存', () => {
      cacheExternalId(1, 'movie', 'tt001')
      cacheExternalId(2, 'movie', 'tt002')

      expect(getCachedExternalId(1, 'movie')).toBe('tt001')
      expect(getCachedExternalId(2, 'movie')).toBe('tt002')
    })

    it('imdbId 为 null 时应缓存 null 值', () => {
      cacheExternalId(999, 'movie', null)
      const result = getCachedExternalId(999, 'movie')
      expect(result).toBeNull()
    })

    it('后写入的值应覆盖前一个值', () => {
      cacheExternalId(500, 'movie', 'tt_old')
      cacheExternalId(500, 'movie', 'tt_new')

      expect(getCachedExternalId(500, 'movie')).toBe('tt_new')
    })
  })

  // ---------- TTL 过期自动清理 ----------
  describe('TTL 过期自动清理', () => {
    it('24 小时内应返回缓存值', () => {
      cacheExternalId(100, 'movie', 'tt_cached')

      // 前进 23 小时
      vi.advanceTimersByTime(23 * 60 * 60 * 1000)
      expect(getCachedExternalId(100, 'movie')).toBe('tt_cached')
    })

    it('超过 24 小时应返回 undefined 并删除过期条目', () => {
      cacheExternalId(200, 'movie', 'tt_will_expire')

      // 前进 24 小时 + 1ms
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1)
      expect(getCachedExternalId(200, 'movie')).toBeUndefined()
    })

    it('过期后再次查询应返回 undefined', () => {
      cacheExternalId(300, 'tv', 'tt_gone')

      vi.advanceTimersByTime(25 * 60 * 60 * 1000)

      // 第一次查询清理过期条目
      expect(getCachedExternalId(300, 'tv')).toBeUndefined()

      // 再次查询也应返回 undefined
      expect(getCachedExternalId(300, 'tv')).toBeUndefined()
    })
  })

  // ---------- 未缓存返回 undefined ----------
  describe('未缓存返回 undefined', () => {
    it('从未缓存的 key 应返回 undefined', () => {
      expect(getCachedExternalId(999999, 'movie')).toBeUndefined()
    })

    it('从未缓存的 mediaType 应返回 undefined', () => {
      cacheExternalId(1, 'movie', 'tt001')
      expect(getCachedExternalId(1, 'anime')).toBeUndefined()
    })
  })
})
