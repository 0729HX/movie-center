import { describe, it, expect, vi, beforeEach } from 'vitest'

// ======================== Mock 外部依赖 ========================

// Mock db query — resolve from test file: __tests__/ → services/ → src/db
vi.mock('../../db', () => ({
  query: vi.fn(),
}))

// Mock cache 层
vi.mock('../cache', () => ({
  cacheIncr: vi.fn(),
  cacheExpire: vi.fn(),
  cacheCount: vi.fn(),
  cacheSet: vi.fn(),
}))

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

import { query } from '../../db'
import { cacheIncr, cacheExpire, cacheCount, cacheSet } from '../cache'
import axios from 'axios'
import {
  getBestKey,
  recordUsage,
  markKeyExhausted,
  getCachedOmdb,
  fetchAndCacheOmdb,
  getOmdbUsageStats,
} from '../omdb'

const mockQuery = vi.mocked(query)
const mockCacheIncr = vi.mocked(cacheIncr)
const mockCacheExpire = vi.mocked(cacheExpire)
const mockCacheCount = vi.mocked(cacheCount)
const mockCacheSet = vi.mocked(cacheSet)
const mockAxiosGet = vi.mocked(axios.get)

// ======================== 测试用例 ========================

describe('omdb service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------- getBestKey ----------
  describe('getBestKey', () => {
    it('配置为空时应返回 null', async () => {
      mockQuery.mockResolvedValueOnce([])
      const result = await getBestKey()
      expect(result).toBeNull()
    })

    it('配置值为空字符串时应返回 null', async () => {
      mockQuery.mockResolvedValueOnce([{ value: '' }])
      const result = await getBestKey()
      expect(result).toBeNull()
    })

    it('单个 key 且未达限额时应返回该 key', async () => {
      mockQuery.mockResolvedValueOnce([{ value: 'abc123' }])
      mockCacheCount.mockResolvedValueOnce(100)
      const result = await getBestKey()
      expect(result).toBe('abc123')
    })

    it('多个 key 应选择用量最少的', async () => {
      mockQuery.mockResolvedValueOnce([{ value: 'key_aaa,key_bbb,key_ccc' }])
      mockCacheCount
        .mockResolvedValueOnce(500)  // key_aaa
        .mockResolvedValueOnce(100)  // key_bbb
        .mockResolvedValueOnce(300)  // key_ccc

      const result = await getBestKey()
      expect(result).toBe('key_bbb')
    })

    it('所有 key 达到限额时应返回 null', async () => {
      mockQuery.mockResolvedValueOnce([{ value: 'key1,key2' }])
      mockCacheCount
        .mockResolvedValueOnce(950)  // key1 >= OMDB_DAILY_LIMIT(950)
        .mockResolvedValueOnce(950)  // key2 >= OMDB_DAILY_LIMIT(950)

      const result = await getBestKey()
      expect(result).toBeNull()
    })

    it('应支持换行分隔的 key', async () => {
      mockQuery.mockResolvedValueOnce([{ value: 'key1\nkey2' }])
      mockCacheCount
        .mockResolvedValueOnce(800)
        .mockResolvedValueOnce(200)

      const result = await getBestKey()
      expect(result).toBe('key2')
    })

    it('应过滤空 key', async () => {
      mockQuery.mockResolvedValueOnce([{ value: 'key1,,key2,' }])
      mockCacheCount
        .mockResolvedValueOnce(500)
        .mockResolvedValueOnce(100)

      const result = await getBestKey()
      expect(result).toBe('key2')
      expect(mockCacheCount).toHaveBeenCalledTimes(2) // 只调用两次，空 key 被过滤
    })

    it('用量相等时应选第一个满足条件的 key', async () => {
      mockQuery.mockResolvedValueOnce([{ value: 'aaa111,bbb222' }])
      mockCacheCount
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(100)

      const result = await getBestKey()
      expect(result).toBe('aaa111')
    })
  })

  // ---------- recordUsage ----------
  describe('recordUsage', () => {
    it('应递增 Redis 计数器并设置过期时间', async () => {
      await recordUsage('testkey123')

      expect(mockCacheIncr).toHaveBeenCalledTimes(1)
      const redisKey = mockCacheIncr.mock.calls[0][0]
      // keySuffix = key.slice(-6), so 'testkey123' → 'key123'
      expect(redisKey).toMatch(/^omdb:usage:\d{4}-\d{2}-\d{2}:key123$/)

      expect(mockCacheExpire).toHaveBeenCalledTimes(1)
      expect(mockCacheExpire.mock.calls[0][0]).toBe(redisKey)
      expect(mockCacheExpire.mock.calls[0][1]).toBeGreaterThan(0)
    })
  })

  // ---------- markKeyExhausted ----------
  describe('markKeyExhausted', () => {
    it('应将 key 用量设为 9999（用尽标记）', async () => {
      await markKeyExhausted('exhausted_key')

      expect(mockCacheSet).toHaveBeenCalledTimes(1)
      const [redisKey, value] = mockCacheSet.mock.calls[0]
      expect(redisKey).toMatch(/^omdb:usage:\d{4}-\d{2}-\d{2}:ed_key$/)
      expect(value).toBe(9999)
    })
  })

  // ---------- getOmdbUsageStats ----------
  describe('getOmdbUsageStats', () => {
    it('应返回每个 key 的用量统计', async () => {
      // keySuffix = key.slice(-6)
      // 'my_key_aaa' (10 chars) → slice(-6) = 'y_aaa' (6 chars)
      // 'my_key_bbb' (10 chars) → slice(-6) = 'y_bbb' (6 chars)
      mockQuery.mockResolvedValueOnce([{ value: 'my_key_aaa,my_key_bbb' }])
      mockCacheCount
        .mockResolvedValueOnce(500)
        .mockResolvedValueOnce(200)

      const stats = await getOmdbUsageStats()
      expect(stats).toHaveLength(2)
      expect(stats[0]).toEqual({ key: 'ey_aaa', usage: 500, limit: 1000, remaining: 500 })
      expect(stats[1]).toEqual({ key: 'ey_bbb', usage: 200, limit: 1000, remaining: 800 })
    })

    it('用量超过 1000 时 remaining 应为 0（max 保护）', async () => {
      mockQuery.mockResolvedValueOnce([{ value: 'overused' }])
      mockCacheCount.mockResolvedValueOnce(1500)

      const stats = await getOmdbUsageStats()
      expect(stats[0].remaining).toBe(0)
    })

    it('无 key 配置时应返回空数组', async () => {
      mockQuery.mockResolvedValueOnce([])
      const stats = await getOmdbUsageStats()
      expect(stats).toEqual([])
    })
  })

  // ---------- getCachedOmdb ----------
  describe('getCachedOmdb', () => {
    it('缓存命中时应返回评分数据', async () => {
      mockQuery.mockResolvedValueOnce([{
        imdb_score: 8.5,
        tomatoes_score: '92%',
        metacritic_score: 85,
      }])

      const result = await getCachedOmdb('tt1234567')
      expect(result).toEqual({
        imdb: 8.5,
        tomatoes: '92%',
        metacritic: 85,
      })
    })

    it('缓存未命中时应返回 null', async () => {
      mockQuery.mockResolvedValueOnce([])
      const result = await getCachedOmdb('tt0000000')
      expect(result).toBeNull()
    })

    it('imdb_score 为 null 时应返回 null', async () => {
      mockQuery.mockResolvedValueOnce([{
        imdb_score: null,
        tomatoes_score: null,
        metacritic_score: null,
      }])

      const result = await getCachedOmdb('tt1111111')
      expect(result).toEqual({
        imdb: null,
        tomatoes: null,
        metacritic: null,
      })
    })

    it('数据库异常时应返回 null', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'))
      const result = await getCachedOmdb('tt9999999')
      expect(result).toBeNull()
    })

    it('imdb_score 为字符串时应转换为 number', async () => {
      mockQuery.mockResolvedValueOnce([{
        imdb_score: '7.8',
        tomatoes_score: '85%',
        metacritic_score: '72',
      }])

      const result = await getCachedOmdb('tt2222222')
      expect(result).toEqual({
        imdb: 7.8,
        tomatoes: '85%',
        metacritic: 72,
      })
    })
  })

  // ---------- fetchAndCacheOmdb ----------
  describe('fetchAndCacheOmdb', () => {
    it('无可用 key 时应返回默认空评分', async () => {
      mockQuery.mockResolvedValueOnce([]) // getBestKey 返回 null

      const result = await fetchAndCacheOmdb('tt123', 100, 'movie')
      expect(result).toEqual({ imdb: null, tomatoes: null, metacritic: null })
      expect(mockAxiosGet).not.toHaveBeenCalled()
    })

    it('OMDb 返回成功数据时应解析评分并写入 DB', async () => {
      // getBestKey
      mockQuery.mockResolvedValueOnce([{ value: 'myapikey' }])
      mockCacheCount.mockResolvedValueOnce(100)

      // axios.get
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          Response: 'True',
          imdbRating: '8.5',
          Ratings: [
            { Source: 'Rotten Tomatoes', Value: '92%' },
            { Source: 'Metacritic', Value: '85' },
          ],
        },
      })

      // recordUsage (cacheIncr + cacheExpire)
      mockCacheIncr.mockResolvedValueOnce(101)
      mockCacheExpire.mockResolvedValueOnce(1)

      // INSERT INTO rating_cache
      mockQuery.mockResolvedValueOnce({})

      const result = await fetchAndCacheOmdb('tt1234567', 100, 'movie')
      expect(result.imdb).toBe(8.5)
      expect(result.tomatoes).toBe('92%')
      expect(result.metacritic).toBe(85)

      // 验证写入 DB
      expect(mockQuery).toHaveBeenCalledTimes(2) // getBestKey + INSERT
    })

    it('OMDb 返回 Response=False 时应返回默认空评分', async () => {
      // getBestKey
      mockQuery.mockResolvedValueOnce([{ value: 'mykey' }])
      mockCacheCount.mockResolvedValueOnce(100)

      mockAxiosGet.mockResolvedValueOnce({
        data: { Response: 'False', Error: 'Movie not found!' },
      })

      const result = await fetchAndCacheOmdb('tt_invalid', 999, 'movie')
      expect(result).toEqual({ imdb: null, tomatoes: null, metacritic: null })
    })

    it('Request limit reached 错误应标记 key 用尽', async () => {
      // getBestKey
      mockQuery.mockResolvedValueOnce([{ value: 'limitedkey' }])
      mockCacheCount.mockResolvedValueOnce(100)

      mockAxiosGet.mockResolvedValueOnce({
        data: { Response: 'False', Error: 'Request limit reached!' },
      })

      // markKeyExhausted → cacheSet
      mockCacheSet.mockResolvedValueOnce('OK')

      await fetchAndCacheOmdb('tt_limit', 200, 'movie')

      // 验证调用了 markKeyExhausted → cacheSet
      expect(mockCacheSet).toHaveBeenCalledTimes(1)
    })

    it('imdbRating 为 N/A 时应返回 null', async () => {
      mockQuery.mockResolvedValueOnce([{ value: 'mykey' }])
      mockCacheCount.mockResolvedValueOnce(50)

      mockAxiosGet.mockResolvedValueOnce({
        data: {
          Response: 'True',
          imdbRating: 'N/A',
          Ratings: [],
        },
      })
      mockCacheIncr.mockResolvedValueOnce(51)
      mockCacheExpire.mockResolvedValueOnce(1)
      mockQuery.mockResolvedValueOnce({})

      const result = await fetchAndCacheOmdb('tt_na', 300, 'tv')
      expect(result.imdb).toBeNull()
    })

    it('axios 异常时应返回默认空评分', async () => {
      mockQuery.mockResolvedValueOnce([{ value: 'mykey' }])
      mockCacheCount.mockResolvedValueOnce(50)

      mockAxiosGet.mockRejectedValueOnce(new Error('Network timeout'))

      const result = await fetchAndCacheOmdb('tt_err', 400, 'movie')
      expect(result).toEqual({ imdb: null, tomatoes: null, metacritic: null })
    })

    it('无 Ratings 数组时 tomatoes 和 metacritic 应为 null', async () => {
      mockQuery.mockResolvedValueOnce([{ value: 'mykey' }])
      mockCacheCount.mockResolvedValueOnce(50)

      mockAxiosGet.mockResolvedValueOnce({
        data: { Response: 'True', imdbRating: '7.0' },
      })
      mockCacheIncr.mockResolvedValueOnce(51)
      mockCacheExpire.mockResolvedValueOnce(1)
      mockQuery.mockResolvedValueOnce({})

      const result = await fetchAndCacheOmdb('tt_noratings', 500, 'movie')
      expect(result.imdb).toBe(7.0)
      expect(result.tomatoes).toBeNull()
      expect(result.metacritic).toBeNull()
    })
  })
})
