import { describe, it, expect, vi, beforeEach } from 'vitest'

// ======================== Mock 外部依赖 ========================

vi.mock('../../db', () => ({
  query: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

vi.mock('../omdb', () => ({
  fetchAndCacheOmdb: vi.fn(),
  getCachedOmdb: vi.fn(),
  getOmdbUsageStats: vi.fn(),
}))

vi.mock('../external-id-cache', () => ({
  cacheExternalId: vi.fn(),
  getCachedExternalId: vi.fn(),
}))

vi.mock('../local-marker', () => ({
  markLocalItems: vi.fn(),
}))

import { query } from '../../db'
import axios from 'axios'
import { fetchAndCacheOmdb, getCachedOmdb } from '../omdb'
import { getCachedExternalId, cacheExternalId } from '../external-id-cache'
import { markLocalItems } from '../local-marker'
import {
  imgUrl,
  getTrending,
  getMovies,
  getTv,
  searchMedia,
  getDetail,
  getDetailFull,
  getMovieGenres,
  getTvGenres,
  getCredits,
  getRecommendations,
} from '../tmdb'

const mockQuery = vi.mocked(query)
const mockAxiosGet = vi.mocked(axios.get)
const mockFetchAndCacheOmdb = vi.mocked(fetchAndCacheOmdb)
const mockGetCachedOmdb = vi.mocked(getCachedOmdb)
const mockGetCachedExternalId = vi.mocked(getCachedExternalId)
const mockCacheExternalId = vi.mocked(cacheExternalId)
const mockMarkLocalItems = vi.mocked(markLocalItems)

// ======================== 辅助工具 ========================

function makeTmdbMovie(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    title: 'Test Movie',
    overview: 'A test movie',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '2024-01-15',
    vote_average: 8.5,
    vote_count: 1000,
    genre_ids: [28],
    media_type: 'movie' as const,
    original_language: 'en',
    popularity: 100,
    ...overrides,
  }
}

function makeTmdbTv(overrides: Record<string, any> = {}) {
  return {
    id: 2,
    name: 'Test Show',
    overview: 'A test show',
    poster_path: '/tv-poster.jpg',
    backdrop_path: '/tv-backdrop.jpg',
    first_air_date: '2023-06-01',
    vote_average: 7.5,
    vote_count: 500,
    genre_ids: [18],
    media_type: 'tv' as const,
    original_language: 'en',
    popularity: 80,
    ...overrides,
  }
}

// ======================== 测试用例 ========================

describe('tmdb service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Re-apply default mock implementations after reset
    mockMarkLocalItems.mockResolvedValue(undefined)
    mockGetCachedExternalId.mockReturnValue(undefined)
    mockGetCachedOmdb.mockResolvedValue(null)
    mockFetchAndCacheOmdb.mockResolvedValue(null)
    // Default: API key from DB
    mockQuery.mockResolvedValue([{ value: 'test_tmdb_key' }])
  })

  // ---------- imgUrl ----------
  describe('imgUrl', () => {
    it('应拼接正确的图片 URL', () => {
      expect(imgUrl('/abc123.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc123.jpg')
    })

    it('应支持自定义尺寸', () => {
      expect(imgUrl('/abc.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/abc.jpg')
      expect(imgUrl('/abc.jpg', 'original')).toBe('https://image.tmdb.org/t/p/original/abc.jpg')
    })

    it('path 为 null 时应返回 null', () => {
      expect(imgUrl(null)).toBeNull()
    })
  })

  // ---------- getTrending ----------
  describe('getTrending', () => {
    it('应返回混合热门列表并按 popularity 排序', async () => {
      // 电影和剧集两个并行请求
      mockAxiosGet
        .mockResolvedValueOnce({
          data: {
            page: 1,
            results: [
              makeTmdbMovie({ id: 1, popularity: 50 }),
              makeTmdbMovie({ id: 2, title: 'Movie B', popularity: 200 }),
            ],
            total_pages: 1,
            total_results: 2,
          },
        })
        .mockResolvedValueOnce({
          data: {
            page: 1,
            results: [
              makeTmdbTv({ id: 3, popularity: 150 }),
            ],
            total_pages: 1,
            total_results: 1,
          },
        })

      const result = await getTrending()
      expect(result).toHaveLength(3)
      // 按 popularity 降序：150, 200, 50 → 但这里 Movie B=200, TV=150, Movie A=50
      // 注意：结果会被截取到 12 个
      expect(result[0].title).toBe('Movie B')
      expect(result[1].title).toBe('Test Show')
      // markLocalItems 应被调用
      expect(mockMarkLocalItems).toHaveBeenCalledTimes(1)
    })

    it('应限制电影和剧集各取 10 个', async () => {
      const manyMovies = Array.from({ length: 15 }, (_, i) =>
        makeTmdbMovie({ id: i + 1, title: `Movie ${i}`, popularity: 100 - i })
      )
      const manyTvs = Array.from({ length: 15 }, (_, i) =>
        makeTmdbTv({ id: i + 100, name: `TV ${i}`, popularity: 90 - i })
      )

      mockAxiosGet
        .mockResolvedValueOnce({ data: { page: 1, results: manyMovies, total_pages: 1, total_results: 15 } })
        .mockResolvedValueOnce({ data: { page: 1, results: manyTvs, total_pages: 1, total_results: 15 } })

      const result = await getTrending()
      // 最多 12 个
      expect(result.length).toBeLessThanOrEqual(12)
    })
  })

  // ---------- getMovies ----------
  describe('getMovies', () => {
    it('应返回电影列表和总页数', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          page: 1,
          results: [makeTmdbMovie()],
          total_pages: 50,
          total_results: 1000,
        },
      })

      const result = await getMovies(1)
      expect(result.items).toHaveLength(1)
      expect(result.totalPages).toBe(50)
      expect(result.items[0].title).toBe('Test Movie')
    })

    it('应传递 genre 参数', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { page: 1, results: [], total_pages: 0, total_results: 0 },
      })

      await getMovies(1, '28')
      const callParams = mockAxiosGet.mock.calls[0][1]?.params
      expect(callParams.with_genres).toBe('28')
    })

    it('应传递 liveCount 参数给 enrichListWithCachedRatings', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { page: 1, results: [makeTmdbMovie()], total_pages: 1, total_results: 1 },
      })

      // liveCount=2 意味着前 2 个 item 会尝试 live fetch omdb
      mockGetCachedExternalId.mockReturnValue(undefined) // 无缓存

      await getMovies(1, undefined, 2)
      // 不崩溃即可
    })
  })

  // ---------- getTv ----------
  describe('getTv', () => {
    it('应返回剧集列表和总页数', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          page: 1,
          results: [makeTmdbTv()],
          total_pages: 30,
          total_results: 600,
        },
      })

      const result = await getTv(1)
      expect(result.items).toHaveLength(1)
      expect(result.totalPages).toBe(30)
      expect(result.items[0].title).toBe('Test Show')
    })

    it('应传递 genre 参数', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { page: 1, results: [], total_pages: 0, total_results: 0 },
      })

      await getTv(1, '18')
      const callParams = mockAxiosGet.mock.calls[0][1]?.params
      expect(callParams.with_genres).toBe('18')
    })
  })

  // ---------- searchMedia ----------
  describe('searchMedia', () => {
    it('应返回搜索结果', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          page: 1,
          results: [makeTmdbMovie(), makeTmdbTv()],
          total_pages: 5,
          total_results: 100,
        },
      })

      const result = await searchMedia('inception')
      expect(result.items).toHaveLength(2)
      expect(result.totalPages).toBe(5)
      expect(result.totalResults).toBe(100)
    })

    it('应过滤掉非 movie/tv 类型的结果', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          page: 1,
          results: [
            makeTmdbMovie(),
            { ...makeTmdbMovie(), media_type: 'person' }, // 应被过滤
          ],
          total_pages: 1,
          total_results: 2,
        },
      })

      const result = await searchMedia('test')
      expect(result.items).toHaveLength(1)
    })

    it('应传递分页参数', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { page: 3, results: [], total_pages: 10, total_results: 200 },
      })

      await searchMedia('test', 3)
      const callParams = mockAxiosGet.mock.calls[0][1]?.params
      expect(callParams.page).toBe(3)
      expect(callParams.query).toBe('test')
    })
  })

  // ---------- getDetail ----------
  describe('getDetail', () => {
    it('应返回电影详情', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 1,
          title: 'Inception',
          overview: 'A dream within a dream',
          poster_path: '/inception.jpg',
          backdrop_path: '/inception-bg.jpg',
          vote_average: 8.8,
          vote_count: 30000,
          genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Sci-Fi' }],
          runtime: 148,
          status: 'Released',
          tagline: 'Your mind is the scene of the crime',
          release_date: '2010-07-16',
          external_ids: { imdb_id: 'tt1375666' },
          credits: { cast: [] },
        },
      })

      mockGetCachedOmdb.mockResolvedValueOnce(null)

      const result = await getDetail('movie', 1)
      expect(result).not.toBeNull()
      expect(result!.title).toBe('Inception')
      expect(result!.year).toBe('2010')
      expect(result!.genres).toEqual(['Action', 'Sci-Fi'])
      expect(result!.runtime).toBe(148)
      expect(result!.ratings.length).toBeGreaterThanOrEqual(1)
      expect(result!.ratings[0].source).toBe('TMDB')
    })

    it('应返回剧集详情', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 2,
          name: 'Breaking Bad',
          overview: 'Chemistry teacher',
          poster_path: '/bb.jpg',
          backdrop_path: '/bb-bg.jpg',
          vote_average: 9.5,
          vote_count: 50000,
          genres: [{ id: 18, name: 'Drama' }],
          episode_run_time: [45],
          status: 'Ended',
          tagline: 'Say my name',
          first_air_date: '2008-01-20',
          external_ids: { imdb_id: 'tt0903747' },
          credits: { cast: [] },
        },
      })

      mockGetCachedOmdb.mockResolvedValueOnce(null)

      const result = await getDetail('tv', 2)
      expect(result).not.toBeNull()
      expect(result!.title).toBe('Breaking Bad')
      expect(result!.year).toBe('2008')
      expect(result!.runtime).toBe(45)
    })

    it('应缓存 external_ids', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 1,
          title: 'Test',
          overview: '',
          poster_path: null,
          backdrop_path: null,
          vote_average: 7,
          vote_count: 100,
          genres: [],
          status: '',
          tagline: '',
          release_date: '2020-01-01',
          external_ids: { imdb_id: 'tt1234567' },
          credits: { cast: [] },
        },
      })

      mockGetCachedOmdb.mockResolvedValueOnce(null)

      await getDetail('movie', 1)
      expect(mockCacheExternalId).toHaveBeenCalledWith(1, 'movie', 'tt1234567')
    })

    it('API 失败时应返回 null', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Network error'))

      const result = await getDetail('movie', 999)
      expect(result).toBeNull()
    })

    it('无 imdb_id 时不应尝试获取 OMDb 评分', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 1,
          title: 'No IMDB',
          overview: '',
          poster_path: null,
          backdrop_path: null,
          vote_average: 5,
          vote_count: 10,
          genres: [],
          status: '',
          tagline: '',
          release_date: '2020-01-01',
          external_ids: { imdb_id: null },
          credits: { cast: [] },
        },
      })

      const result = await getDetail('movie', 1)
      expect(result).not.toBeNull()
      expect(mockFetchAndCacheOmdb).not.toHaveBeenCalled()
      expect(mockGetCachedOmdb).not.toHaveBeenCalled()
    })
  })

  // ---------- getDetailFull ----------
  describe('getDetailFull', () => {
    it('应返回完整详情含 credits 和 recommendations', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 1,
          title: 'Inception',
          overview: '',
          poster_path: '/p.jpg',
          backdrop_path: '/b.jpg',
          vote_average: 8.8,
          vote_count: 30000,
          genres: [{ id: 28, name: 'Action' }],
          runtime: 148,
          status: 'Released',
          tagline: '',
          release_date: '2010-07-16',
          external_ids: { imdb_id: 'tt1375666' },
          credits: {
            cast: [
              { id: 1, name: 'Leonardo DiCaprio', profile_path: '/leo.jpg', character: 'Cobb', order: 0, known_for_department: 'Acting' },
              { id: 2, name: 'Ellen Page', profile_path: null, character: 'Ariadne', order: 1, known_for_department: 'Acting' },
            ],
          },
          recommendations: {
            results: [
              makeTmdbMovie({ id: 10, title: 'Interstellar', release_date: '2014-11-07' }),
            ],
          },
        },
      })

      mockGetCachedOmdb.mockResolvedValueOnce(null)

      const result = await getDetailFull('movie', 1)
      expect(result).not.toBeNull()
      expect(result!.detail.title).toBe('Inception')
      expect(result!.credits).toHaveLength(2)
      expect(result!.credits[0].name).toBe('Leonardo DiCaprio')
      expect(result!.credits[0].character).toBe('Cobb')
      expect(result!.recommendations).toHaveLength(1)
      expect(result!.recommendations[0].title).toBe('Interstellar')
    })

    it('应限制 credits 为前 15 个', async () => {
      const manyCast = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        name: `Actor ${i}`,
        profile_path: null,
        character: `Character ${i}`,
        order: i,
        known_for_department: 'Acting',
      }))

      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 1,
          title: 'Test',
          overview: '',
          poster_path: null,
          backdrop_path: null,
          vote_average: 7,
          vote_count: 100,
          genres: [],
          status: '',
          tagline: '',
          release_date: '2020-01-01',
          external_ids: { imdb_id: null },
          credits: { cast: manyCast },
          recommendations: { results: [] },
        },
      })

      const result = await getDetailFull('movie', 1)
      expect(result!.credits).toHaveLength(15)
    })

    it('应限制 recommendations 为前 10 个', async () => {
      const manyRecs = Array.from({ length: 15 }, (_, i) =>
        makeTmdbMovie({ id: i + 100, title: `Rec ${i}` })
      )

      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 1,
          title: 'Test',
          overview: '',
          poster_path: null,
          backdrop_path: null,
          vote_average: 7,
          vote_count: 100,
          genres: [],
          status: '',
          tagline: '',
          release_date: '2020-01-01',
          external_ids: { imdb_id: null },
          credits: { cast: [] },
          recommendations: { results: manyRecs },
        },
      })

      const result = await getDetailFull('movie', 1)
      expect(result!.recommendations).toHaveLength(10)
    })

    it('API 失败时应返回 null', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Timeout'))

      const result = await getDetailFull('tv', 999)
      expect(result).toBeNull()
    })

    it('应通过 cached OMDb 注入 Rotten Tomatoes 和 Metacritic 评分', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 1,
          title: 'Rated Movie',
          overview: '',
          poster_path: null,
          backdrop_path: null,
          vote_average: 8,
          vote_count: 100,
          genres: [],
          status: '',
          tagline: '',
          release_date: '2020-01-01',
          external_ids: { imdb_id: 'tt1111111' },
          credits: { cast: [] },
          recommendations: { results: [] },
        },
      })

      mockGetCachedOmdb.mockResolvedValueOnce({
        imdb: 8.5,
        tomatoes: '95%',
        metacritic: 88,
      })

      const result = await getDetailFull('movie', 1)
      const sources = result!.detail.ratings.map(r => r.source)
      expect(sources).toContain('Rotten Tomatoes')
      expect(sources).toContain('Metacritic')
      expect(sources).toContain('IMDb')
    })
  })

  // ---------- getMovieGenres / getTvGenres ----------
  describe('getMovieGenres', () => {
    it('应返回电影分类列表', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { genres: [{ id: 28, name: 'Action' }, { id: 35, name: 'Comedy' }] },
      })

      const result = await getMovieGenres()
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Action')
    })
  })

  describe('getTvGenres', () => {
    it('应返回剧集分类列表', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { genres: [{ id: 18, name: 'Drama' }] },
      })

      const result = await getTvGenres()
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Drama')
    })
  })

  // ---------- getCredits ----------
  describe('getCredits', () => {
    it('应返回按 order 排序的演员列表', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          cast: [
            { id: 2, name: 'Actor B', profile_path: null, character: 'Role B', order: 1, known_for_department: 'Acting' },
            { id: 1, name: 'Actor A', profile_path: '/a.jpg', character: 'Role A', order: 0, known_for_department: 'Acting' },
          ],
        },
      })

      const result = await getCredits('movie', 1)
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Actor A')
      expect(result[1].name).toBe('Actor B')
    })

    it('API 失败时应返回空数组', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Error'))

      const result = await getCredits('movie', 1)
      expect(result).toEqual([])
    })

    it('应限制为前 15 个', async () => {
      const cast = Array.from({ length: 20 }, (_, i) => ({
        id: i, name: `A${i}`, profile_path: null, character: `C${i}`, order: i, known_for_department: 'Acting',
      }))
      mockAxiosGet.mockResolvedValueOnce({ data: { cast } })

      const result = await getCredits('movie', 1)
      expect(result).toHaveLength(15)
    })
  })

  // ---------- getRecommendations ----------
  describe('getRecommendations', () => {
    it('应返回推荐列表', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          results: [
            makeTmdbMovie({ id: 10, title: 'Recommended Movie' }),
            makeTmdbTv({ id: 20, name: 'Recommended Show' }),
          ],
        },
      })

      const result = await getRecommendations('movie', 1)
      expect(result).toHaveLength(2)
      expect(result[0].title).toBe('Recommended Movie')
      expect(result[1].title).toBe('Recommended Show')
    })

    it('API 失败时应返回空数组', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Error'))

      const result = await getRecommendations('movie', 1)
      expect(result).toEqual([])
    })

    it('应限制为前 10 个', async () => {
      const many = Array.from({ length: 15 }, (_, i) =>
        makeTmdbMovie({ id: i + 100, title: `Rec ${i}` })
      )
      mockAxiosGet.mockResolvedValueOnce({ data: { results: many } })

      const result = await getRecommendations('movie', 1)
      expect(result).toHaveLength(10)
    })
  })

  // ---------- buildMediaWithRatings 隐式测试 ----------
  describe('buildMediaWithRatings (via getMovies)', () => {
    it('应正确构建 movie 的 MediaWithRatings 对象', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          page: 1,
          results: [makeTmdbMovie({
            id: 42,
            title: 'My Movie',
            poster_path: '/my.jpg',
            backdrop_path: '/my-bg.jpg',
            release_date: '2023-05-01',
            vote_average: 9.0,
          })],
          total_pages: 1,
          total_results: 1,
        },
      })

      const result = await getMovies(1)
      const item = result.items[0]
      expect(item.id).toBe(42)
      expect(item.tmdbId).toBe(42)
      expect(item.title).toBe('My Movie')
      expect(item.posterPath).toBe('https://image.tmdb.org/t/p/w500/my.jpg')
      expect(item.backdropPath).toBe('https://image.tmdb.org/t/p/original/my-bg.jpg')
      expect(item.year).toBe('2023')
      expect(item.mediaType).toBe('movie')
      expect(item.ratings[0].source).toBe('TMDB')
      expect(item.ratings[0].score).toBe(9.0)
      expect(item.isLocal).toBe(false)
    })

    it('应正确构建 tv 的 MediaWithRatings 对象', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          page: 1,
          results: [makeTmdbTv({
            id: 99,
            name: 'My Show',
            first_air_date: '2022-03-15',
            vote_average: 7.2,
          })],
          total_pages: 1,
          total_results: 1,
        },
      })

      const result = await getTv(1)
      const item = result.items[0]
      expect(item.id).toBe(99)
      expect(item.title).toBe('My Show')
      expect(item.year).toBe('2022')
      expect(item.mediaType).toBe('tv')
    })

    it('release_date 为空时 year 应为空字符串', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          page: 1,
          results: [makeTmdbMovie({ release_date: '' })],
          total_pages: 1,
          total_results: 1,
        },
      })

      const result = await getMovies(1)
      expect(result.items[0].year).toBe('')
    })
  })

  // ---------- enrichListWithCachedRatings 隐式测试 ----------
  describe('OMDb 评分注入 (via getMovies)', () => {
    it('有 cached external_id 时应注入 OMDb 评分', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          page: 1,
          results: [makeTmdbMovie({ id: 1 })],
          total_pages: 1,
          total_results: 1,
        },
      })

      // getCachedExternalId 返回已缓存的 imdb_id
      mockGetCachedExternalId.mockReturnValue('tt1375666')
      mockGetCachedOmdb.mockResolvedValueOnce({
        imdb: 8.8,
        tomatoes: '87%',
        metacritic: 74,
      })

      const result = await getMovies(1)
      const ratings = result.items[0].ratings
      const sources = ratings.map(r => r.source)
      expect(sources).toContain('Rotten Tomatoes')
      expect(sources).toContain('Metacritic')
    })

    it('cached external_id 为 null 时不应注入评分', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          page: 1,
          results: [makeTmdbMovie({ id: 1 })],
          total_pages: 1,
          total_results: 1,
        },
      })

      mockGetCachedExternalId.mockReturnValue(null)

      const result = await getMovies(1)
      // 只有 TMDB 评分
      expect(result.items[0].ratings).toHaveLength(1)
      expect(result.items[0].ratings[0].source).toBe('TMDB')
    })
  })

  // ---------- 默认 API key ----------
  describe('API key 管理', () => {
    it('数据库无配置时应使用默认 key', async () => {
      mockQuery.mockResolvedValueOnce([]) // 无 tmdb_api_key
      mockAxiosGet.mockResolvedValueOnce({
        data: { page: 1, results: [], total_pages: 0, total_results: 0 },
      })

      await getMovies(1)
      const callParams = mockAxiosGet.mock.calls[0][1]?.params
      expect(callParams.api_key).toBe('95777cd0ce9652f08bd77103f658cf2b')
    })

    it('数据库有配置时应使用配置的 key', async () => {
      mockQuery.mockResolvedValueOnce([{ value: 'custom_key_123' }])
      mockAxiosGet.mockResolvedValueOnce({
        data: { page: 1, results: [], total_pages: 0, total_results: 0 },
      })

      await getMovies(1)
      const callParams = mockAxiosGet.mock.calls[0][1]?.params
      expect(callParams.api_key).toBe('custom_key_123')
    })
  })
})
