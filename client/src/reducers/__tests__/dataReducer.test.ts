import { describe, it, expect } from 'vitest'
import { dataReducer, initialDataState, type DataState, type DataAction, type GenreItem } from '../dataReducer'
import type { MediaWithRatings, LocalMedia } from '../../types'

// ======================== 测试数据工厂 ========================

function makeMedia(overrides: Partial<MediaWithRatings> = {}): MediaWithRatings {
  return {
    id: 1,
    tmdbId: 100,
    title: 'Test Movie',
    overview: 'A test movie',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    year: '2024',
    mediaType: 'movie',
    ratings: [],
    genres: ['Action'],
    status: 'Released',
    tagline: 'Test tagline',
    isLocal: false,
    ...overrides,
  }
}

function makeLocalMedia(overrides: Partial<LocalMedia> = {}): LocalMedia {
  return {
    id: 1,
    tmdb_id: 100,
    media_type: 'movie',
    title: 'Local Movie',
    year: 2024,
    local_path: '/media/local-movie.mp4',
    poster_path: '/poster.jpg',
    backdrop_path: null,
    clearlogo_path: null,
    file_size: 1024000,
    nfo_ratings: null,
    stream_info: null,
    added_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeState(overrides: Partial<DataState> = {}): DataState {
  return { ...initialDataState, ...overrides }
}

// ======================== 测试用例 ========================

describe('dataReducer', () => {
  // ---------- 1. SET_TRENDING ----------
  describe('SET_TRENDING', () => {
    it('应设置 trending 列表', () => {
      const items = [makeMedia({ id: 1 }), makeMedia({ id: 2 })]
      const result = dataReducer(makeState(), { type: 'SET_TRENDING', payload: items })
      expect(result.trending).toEqual(items)
    })

    it('应替换已有 trending 数据', () => {
      const state = makeState({ trending: [makeMedia({ id: 99 })] })
      const items = [makeMedia({ id: 1 })]
      const result = dataReducer(state, { type: 'SET_TRENDING', payload: items })
      expect(result.trending).toHaveLength(1)
      expect(result.trending[0].id).toBe(1)
    })
  })

  // ---------- 2. SET_MOVIES ----------
  describe('SET_MOVIES', () => {
    it('page=1 时应替换 movies 列表', () => {
      const state = makeState({ movies: [makeMedia({ id: 99 })] })
      const items = [makeMedia({ id: 1 }), makeMedia({ id: 2 })]
      const result = dataReducer(state, { type: 'SET_MOVIES', payload: { items, page: 1, totalPages: 5 } })
      expect(result.movies).toEqual(items)
      expect(result.movieTotalPages).toBe(5)
    })

    it('page>1 时应追加到 movies 列表末尾', () => {
      const existing = [makeMedia({ id: 1 })]
      const state = makeState({ movies: existing })
      const items = [makeMedia({ id: 2 }), makeMedia({ id: 3 })]
      const result = dataReducer(state, { type: 'SET_MOVIES', payload: { items, page: 2, totalPages: 5 } })
      expect(result.movies).toHaveLength(3)
      expect(result.movies[0].id).toBe(1)
      expect(result.movies[1].id).toBe(2)
      expect(result.movieTotalPages).toBe(5)
    })
  })

  // ---------- 3. SET_TV ----------
  describe('SET_TV', () => {
    it('page=1 时应替换 tvShows 列表', () => {
      const state = makeState({ tvShows: [makeMedia({ id: 99 })] })
      const items = [makeMedia({ id: 1 })]
      const result = dataReducer(state, { type: 'SET_TV', payload: { items, page: 1, totalPages: 3 } })
      expect(result.tvShows).toEqual(items)
      expect(result.tvTotalPages).toBe(3)
    })

    it('page>1 时应追加到 tvShows 列表末尾', () => {
      const state = makeState({ tvShows: [makeMedia({ id: 1 })] })
      const items = [makeMedia({ id: 2 })]
      const result = dataReducer(state, { type: 'SET_TV', payload: { items, page: 2, totalPages: 3 } })
      expect(result.tvShows).toHaveLength(2)
      expect(result.tvShows[1].id).toBe(2)
    })
  })

  // ---------- 4. SET_LOCAL ----------
  describe('SET_LOCAL', () => {
    it('应设置 localMedia 列表', () => {
      const items = [makeLocalMedia(), makeLocalMedia({ id: 2, title: 'Another' })]
      const result = dataReducer(makeState(), { type: 'SET_LOCAL', payload: items })
      expect(result.localMedia).toEqual(items)
    })
  })

  // ---------- 5. SET_MOVIE_GENRES ----------
  describe('SET_MOVIE_GENRES', () => {
    it('应设置电影分类列表', () => {
      const genres: GenreItem[] = [{ id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }]
      const result = dataReducer(makeState(), { type: 'SET_MOVIE_GENRES', payload: genres })
      expect(result.movieGenres).toEqual(genres)
    })
  })

  // ---------- 6. SET_TV_GENRES ----------
  describe('SET_TV_GENRES', () => {
    it('应设置电视剧分类列表', () => {
      const genres: GenreItem[] = [{ id: 18, name: 'Drama' }]
      const result = dataReducer(makeState(), { type: 'SET_TV_GENRES', payload: genres })
      expect(result.tvGenres).toEqual(genres)
    })
  })

  // ---------- 7. SET_MOVIE_GENRE ----------
  describe('SET_MOVIE_GENRE', () => {
    it('应设置当前电影分类筛选并重置页码为 1', () => {
      const state = makeState({ movieGenre: '', moviePage: 5 })
      const result = dataReducer(state, { type: 'SET_MOVIE_GENRE', payload: '28' })
      expect(result.movieGenre).toBe('28')
      expect(result.moviePage).toBe(1)
    })
  })

  // ---------- 8. SET_TV_GENRE ----------
  describe('SET_TV_GENRE', () => {
    it('应设置当前电视剧分类筛选并重置页码为 1', () => {
      const state = makeState({ tvGenre: '', tvPage: 3 })
      const result = dataReducer(state, { type: 'SET_TV_GENRE', payload: '18' })
      expect(result.tvGenre).toBe('18')
      expect(result.tvPage).toBe(1)
    })
  })

  // ---------- 9. SET_LOADING ----------
  describe('SET_LOADING', () => {
    it('应设置 loading 状态为 true', () => {
      const result = dataReducer(makeState({ loading: false }), { type: 'SET_LOADING', payload: true })
      expect(result.loading).toBe(true)
    })

    it('应设置 loading 状态为 false', () => {
      const result = dataReducer(makeState({ loading: true }), { type: 'SET_LOADING', payload: false })
      expect(result.loading).toBe(false)
    })
  })

  // ---------- 10. SET_ERROR ----------
  describe('SET_ERROR', () => {
    it('应设置错误消息', () => {
      const result = dataReducer(makeState(), { type: 'SET_ERROR', payload: 'Network error' })
      expect(result.error).toBe('Network error')
    })

    it('应清除错误（null）', () => {
      const state = makeState({ error: 'Old error' })
      const result = dataReducer(state, { type: 'SET_ERROR', payload: null })
      expect(result.error).toBeNull()
    })
  })

  // ---------- 11. SET_SEARCH_QUERY ----------
  describe('SET_SEARCH_QUERY', () => {
    it('应设置搜索关键词', () => {
      const result = dataReducer(makeState(), { type: 'SET_SEARCH_QUERY', payload: 'inception' })
      expect(result.searchQuery).toBe('inception')
    })
  })

  // ---------- 12. SET_SELECTED_MEDIA ----------
  describe('SET_SELECTED_MEDIA', () => {
    it('应设置选中的媒体项', () => {
      const media = makeMedia({ id: 42, title: 'Inception' })
      const result = dataReducer(makeState(), { type: 'SET_SELECTED_MEDIA', payload: media })
      expect(result.selectedMedia).toEqual(media)
    })

    it('应清除选中（null）', () => {
      const state = makeState({ selectedMedia: makeMedia() })
      const result = dataReducer(state, { type: 'SET_SELECTED_MEDIA', payload: null })
      expect(result.selectedMedia).toBeNull()
    })
  })

  // ---------- 13. UPDATE_SELECTED_MEDIA ----------
  describe('UPDATE_SELECTED_MEDIA', () => {
    it('应合并部分字段到 selectedMedia', () => {
      const media = makeMedia({ id: 1, title: 'Original', ratings: [] })
      const state = makeState({ selectedMedia: media })
      const result = dataReducer(state, {
        type: 'UPDATE_SELECTED_MEDIA',
        payload: { title: 'Updated', ratings: [{ source: 'IMDb', icon: 'imdb', score: 8.5, maxScore: 10 }] },
      })
      expect(result.selectedMedia!.title).toBe('Updated')
      expect(result.selectedMedia!.ratings).toHaveLength(1)
      expect(result.selectedMedia!.id).toBe(1) // 未修改字段保持
    })

    it('selectedMedia 为 null 时应返回原 state 不变', () => {
      const state = makeState({ selectedMedia: null })
      const result = dataReducer(state, { type: 'UPDATE_SELECTED_MEDIA', payload: { title: 'X' } })
      expect(result).toBe(state) // 引用相等，未产生新对象
    })
  })

  // ---------- 14. SET_DETAIL_LOADING ----------
  describe('SET_DETAIL_LOADING', () => {
    it('应设置 detailLoading 状态', () => {
      const result = dataReducer(makeState({ detailLoading: false }), { type: 'SET_DETAIL_LOADING', payload: true })
      expect(result.detailLoading).toBe(true)
    })
  })

  // ---------- 15. SET_LOADING_MORE ----------
  describe('SET_LOADING_MORE', () => {
    it('应设置 loadingMore 状态', () => {
      const result = dataReducer(makeState(), { type: 'SET_LOADING_MORE', payload: true })
      expect(result.loadingMore).toBe(true)
    })
  })

  // ---------- 16. SET_LAST_FETCH_TIME ----------
  describe('SET_LAST_FETCH_TIME', () => {
    it('应设置 lastFetchTime', () => {
      const ts = Date.now()
      const result = dataReducer(makeState(), { type: 'SET_LAST_FETCH_TIME', payload: ts })
      expect(result.lastFetchTime).toBe(ts)
    })
  })

  // ---------- 17. SET_MOVIE_PAGE ----------
  describe('SET_MOVIE_PAGE', () => {
    it('应设置 moviePage', () => {
      const result = dataReducer(makeState(), { type: 'SET_MOVIE_PAGE', payload: 3 })
      expect(result.moviePage).toBe(3)
    })
  })

  // ---------- 18. SET_TV_PAGE ----------
  describe('SET_TV_PAGE', () => {
    it('应设置 tvPage', () => {
      const result = dataReducer(makeState(), { type: 'SET_TV_PAGE', payload: 2 })
      expect(result.tvPage).toBe(2)
    })
  })

  // ---------- 19. SET_SEARCH_RESULTS ----------
  describe('SET_SEARCH_RESULTS', () => {
    it('page=1 时应替换搜索结果', () => {
      const state = makeState({
        searchResults: [makeMedia({ id: 99 })],
        searchPage: 3,
        searchTotalPages: 10,
        searchResultCount: 100,
      })
      const items = [makeMedia({ id: 1 })]
      const result = dataReducer(state, {
        type: 'SET_SEARCH_RESULTS',
        payload: { items, page: 1, totalPages: 5, totalResults: 50 },
      })
      expect(result.searchResults).toEqual(items)
      expect(result.searchPage).toBe(1)
      expect(result.searchTotalPages).toBe(5)
      expect(result.searchResultCount).toBe(50)
    })

    it('page>1 时应追加搜索结果', () => {
      const state = makeState({ searchResults: [makeMedia({ id: 1 })] })
      const items = [makeMedia({ id: 2 })]
      const result = dataReducer(state, {
        type: 'SET_SEARCH_RESULTS',
        payload: { items, page: 2, totalPages: 5, totalResults: 50 },
      })
      expect(result.searchResults).toHaveLength(2)
      expect(result.searchResults[1].id).toBe(2)
    })
  })

  // ---------- 20. CLEAR_SEARCH_RESULTS ----------
  describe('CLEAR_SEARCH_RESULTS', () => {
    it('应清空所有搜索相关状态', () => {
      const state = makeState({
        searchResults: [makeMedia()],
        searchPage: 3,
        searchTotalPages: 10,
        searchResultCount: 100,
        searchQuery: 'test',
      })
      const result = dataReducer(state, { type: 'CLEAR_SEARCH_RESULTS' })
      expect(result.searchResults).toEqual([])
      expect(result.searchPage).toBe(1)
      expect(result.searchTotalPages).toBe(1)
      expect(result.searchResultCount).toBe(0)
      expect(result.searchQuery).toBe('')
    })
  })

  // ---------- default ----------
  describe('default', () => {
    it('未知 action 应返回原 state 不变', () => {
      const state = makeState()
      const result = dataReducer(state, { type: 'UNKNOWN_ACTION' } as unknown as DataAction)
      expect(result).toBe(state)
    })
  })

  // ---------- 初始状态验证 ----------
  describe('initialDataState', () => {
    it('应有正确的默认值', () => {
      expect(initialDataState.trending).toEqual([])
      expect(initialDataState.movies).toEqual([])
      expect(initialDataState.tvShows).toEqual([])
      expect(initialDataState.localMedia).toEqual([])
      expect(initialDataState.moviePage).toBe(1)
      expect(initialDataState.tvPage).toBe(1)
      expect(initialDataState.loading).toBe(true)
      expect(initialDataState.error).toBeNull()
      expect(initialDataState.searchQuery).toBe('')
      expect(initialDataState.selectedMedia).toBeNull()
      expect(initialDataState.detailLoading).toBe(false)
      expect(initialDataState.lastFetchTime).toBe(0)
    })
  })
})
