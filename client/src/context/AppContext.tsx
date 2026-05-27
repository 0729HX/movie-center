import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'
import { DataContext } from './DataContext'
import { api } from '../api/client'
import type { MediaWithRatings } from '../types'
import type { GenreItem } from '../reducers/dataReducer'

const CACHE_TTL = 5 * 60 * 1000

// ─── Request Deduplication & Stale-While-Revalidate Cache ─────────────

interface CacheEntry<T> {
  data: T
  timestamp: number
}

// In-flight request deduplication map: key → Promise
const inflightRequests = new Map<string, Promise<unknown>>()

// Stale-while-revalidate cache
const swrCache = new Map<string, CacheEntry<unknown>>()

/**
 * Deduplicates concurrent requests to the same URL.
 * If a request for `key` is already in-flight, returns the same Promise.
 * Otherwise, executes `fetcher`, stores the in-flight Promise, and cleans up on completion.
 */
async function dedupedRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (inflightRequests.has(key)) {
    return inflightRequests.get(key) as Promise<T>
  }
  const promise = fetcher().finally(() => {
    inflightRequests.delete(key)
  })
  inflightRequests.set(key, promise)
  return promise
}

/**
 * Stale-while-revalidate: returns cached data immediately if available,
 * then fetches fresh data in the background and calls `onFresh` when ready.
 */
function getCached<T>(key: string, ttl: number): T | null {
  const entry = swrCache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() - entry.timestamp > ttl) return null
  return entry.data
}

function setCache(key: string, data: unknown): void {
  swrCache.set(key, { data, timestamp: Date.now() })
}

interface AppContextValue {
  fetchTrending: () => Promise<void>
  fetchMovies: (page?: number, genre?: string) => Promise<void>
  fetchTv: (page?: number, genre?: string) => Promise<void>
  fetchLocal: () => Promise<void>
  fetchGenres: () => Promise<void>
  loadAll: (force?: boolean) => Promise<void>
  handleSearch: (q: string, page?: number) => Promise<void>
  handleClearSearch: () => void
  loadMoreMovies: () => Promise<void>
  loadMoreTv: () => Promise<void>
  loadMoreSearch: () => Promise<void>
  switchMovieGenre: (genreId: string) => void
  switchTvGenre: (genreId: string) => void
}

export const AppContext = createContext<AppContextValue>({} as AppContextValue)

export function AppContextProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useContext(DataContext)
  // Track whether genres have been loaded to avoid re-fetching
  const genresLoadedRef = useRef(false)

  const fetchTrending = useCallback(async () => {
    const cacheKey = 'trending'
    // SWR: serve cached data immediately
    const cached = getCached<MediaWithRatings[]>(cacheKey, CACHE_TTL)
    if (cached) {
      dispatch({ type: 'SET_TRENDING', payload: cached })
    }
    try {
      const data = await dedupedRequest(cacheKey, () => api.trending.get())
      const items = (data.items || []) as MediaWithRatings[]
      setCache(cacheKey, items)
      dispatch({ type: 'SET_TRENDING', payload: items })
    } catch (err: unknown) {
      console.error('fetchTrending 失败:', err instanceof Error ? err.message : err)
      if (!cached) dispatch({ type: 'SET_TRENDING', payload: [] })
    }
  }, [dispatch])

  const fetchMovies = useCallback(async (pageNum = 1, genre = '') => {
    const cacheKey = `movies:${pageNum}:${genre}`
    try {
      const data = await dedupedRequest(cacheKey, () => api.movies.list(pageNum, genre))
      dispatch({
        type: 'SET_MOVIES',
        payload: { items: data.items || [], page: pageNum, totalPages: data.totalPages || 1 },
      })
    } catch (err: unknown) {
      console.error('fetchMovies 失败:', err instanceof Error ? err.message : err)
      if (pageNum === 1) dispatch({ type: 'SET_MOVIES', payload: { items: [], page: 1, totalPages: 1 } })
    }
  }, [dispatch])

  const fetchTv = useCallback(async (pageNum = 1, genre = '') => {
    const cacheKey = `tv:${pageNum}:${genre}`
    try {
      const data = await dedupedRequest(cacheKey, () => api.tv.list(pageNum, genre))
      dispatch({
        type: 'SET_TV',
        payload: { items: data.items || [], page: pageNum, totalPages: data.totalPages || 1 },
      })
    } catch (err: unknown) {
      console.error('fetchTv 失败:', err instanceof Error ? err.message : err)
      if (pageNum === 1) dispatch({ type: 'SET_TV', payload: { items: [], page: 1, totalPages: 1 } })
    }
  }, [dispatch])

  const fetchLocal = useCallback(async () => {
    const cacheKey = 'local'
    try {
      const data = await dedupedRequest(cacheKey, () => api.local.list())
      dispatch({ type: 'SET_LOCAL', payload: data.items || [] })
    } catch (err: unknown) {
      console.error('fetchLocal 失败:', err instanceof Error ? err.message : err)
      dispatch({ type: 'SET_LOCAL', payload: [] })
    }
  }, [dispatch])

  const fetchGenres = useCallback(async () => {
    // Lazy load: skip if already loaded (non-critical data)
    if (genresLoadedRef.current) return
    const cacheKey = 'genres'
    const cached = getCached<{ movieGenres: GenreItem[]; tvGenres: GenreItem[] }>(cacheKey, 24 * 60 * 60 * 1000)
    if (cached) {
      dispatch({ type: 'SET_MOVIE_GENRES', payload: cached.movieGenres })
      dispatch({ type: 'SET_TV_GENRES', payload: cached.tvGenres })
      genresLoadedRef.current = true
      return
    }
    try {
      const [mData, tData] = await Promise.all([
        dedupedRequest('genres:movies', () => api.movies.genres()),
        dedupedRequest('genres:tv', () => api.tv.genres()),
      ])
      const movieGenres = (mData.genres || []) as GenreItem[]
      const tvGenres = (tData.genres || []) as GenreItem[]
      setCache(cacheKey, { movieGenres, tvGenres })
      dispatch({ type: 'SET_MOVIE_GENRES', payload: movieGenres })
      dispatch({ type: 'SET_TV_GENRES', payload: tvGenres })
      genresLoadedRef.current = true
    } catch {}
  }, [dispatch])

  const loadAll = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && state.lastFetchTime > 0 && (now - state.lastFetchTime) < CACHE_TTL) {
      return
    }

    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })
    try {
      // Critical data: load in parallel (trending, movies, tv, local)
      const criticalResults = await Promise.allSettled([
        fetchTrending(),
        fetchMovies(1),
        fetchTv(1),
        fetchLocal(),
      ])
      const allCriticalFailed = criticalResults.every(r => r.status === 'rejected')
      if (allCriticalFailed) {
        dispatch({ type: 'SET_ERROR', payload: '无法连接到服务器，请确认后端已启动（localhost:3001）' })
      } else {
        dispatch({ type: 'SET_LAST_FETCH_TIME', payload: now })
      }

      // Non-critical data: lazy load after first paint (genres)
      // Use requestIdleCallback or setTimeout to defer
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => { fetchGenres() })
      } else {
        setTimeout(() => { fetchGenres() }, 0)
      }
    } catch (err: unknown) {
      console.error('loadAll 异常:', err instanceof Error ? err.message : err)
      dispatch({ type: 'SET_ERROR', payload: '加载失败，请刷新页面重试' })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [state.lastFetchTime, fetchTrending, fetchMovies, fetchTv, fetchLocal, fetchGenres, dispatch])

  const handleSearch = useCallback(async (q: string, page = 1) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: q })
    if (!q.trim()) {
      dispatch({ type: 'CLEAR_SEARCH_RESULTS' })
      return
    }
    if (page === 1) dispatch({ type: 'SET_LOADING', payload: true })
    else dispatch({ type: 'SET_LOADING_MORE', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })
    try {
      const data = await api.search(q, page)
      dispatch({
        type: 'SET_SEARCH_RESULTS',
        payload: {
          items: data.items || [],
          page,
          totalPages: data.totalPages || 1,
          totalResults: data.totalResults || 0,
        },
      })
    } catch (err: unknown) {
      console.error('搜索失败:', err instanceof Error ? err.message : err)
      dispatch({ type: 'SET_ERROR', payload: '搜索请求失败，请检查网络连接' })
      if (page === 1) dispatch({ type: 'CLEAR_SEARCH_RESULTS' })
    } finally {
      if (page === 1) dispatch({ type: 'SET_LOADING', payload: false })
      else dispatch({ type: 'SET_LOADING_MORE', payload: false })
    }
  }, [dispatch])

  const handleClearSearch = useCallback(() => {
    dispatch({ type: 'CLEAR_SEARCH_RESULTS' })
  }, [dispatch])

  const loadMoreSearch = useCallback(async () => {
    const nextPage = state.searchPage + 1
    if (nextPage > state.searchTotalPages) return
    await handleSearch(state.searchQuery, nextPage)
  }, [state.searchPage, state.searchTotalPages, state.searchQuery, handleSearch])

  const loadMoreMovies = useCallback(async () => {
    const nextPage = state.moviePage + 1
    dispatch({ type: 'SET_LOADING_MORE', payload: true })
    await fetchMovies(nextPage, state.movieGenre)
    dispatch({ type: 'SET_MOVIE_PAGE', payload: nextPage })
    dispatch({ type: 'SET_LOADING_MORE', payload: false })
  }, [state.moviePage, state.movieGenre, fetchMovies, dispatch])

  const loadMoreTv = useCallback(async () => {
    const nextPage = state.tvPage + 1
    dispatch({ type: 'SET_LOADING_MORE', payload: true })
    await fetchTv(nextPage, state.tvGenre)
    dispatch({ type: 'SET_TV_PAGE', payload: nextPage })
    dispatch({ type: 'SET_LOADING_MORE', payload: false })
  }, [state.tvPage, state.tvGenre, fetchTv, dispatch])

  const switchMovieGenre = useCallback((genreId: string) => {
    dispatch({ type: 'SET_MOVIE_GENRE', payload: genreId })
    dispatch({ type: 'SET_LOADING', payload: true })
    fetchMovies(1, genreId).then(() => dispatch({ type: 'SET_LOADING', payload: false }))
  }, [fetchMovies, dispatch])

  const switchTvGenre = useCallback((genreId: string) => {
    dispatch({ type: 'SET_TV_GENRE', payload: genreId })
    dispatch({ type: 'SET_LOADING', payload: true })
    fetchTv(1, genreId).then(() => dispatch({ type: 'SET_LOADING', payload: false }))
  }, [fetchTv, dispatch])

  return (
    <AppContext.Provider value={{
      fetchTrending, fetchMovies, fetchTv, fetchLocal, fetchGenres,
      loadAll, handleSearch, handleClearSearch,
      loadMoreMovies, loadMoreTv, loadMoreSearch, switchMovieGenre, switchTvGenre,
    }}>
      {children}
    </AppContext.Provider>
  )
}
