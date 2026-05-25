import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { DataContext } from './DataContext'

const API_BASE = '/api'
const CACHE_TTL = 5 * 60 * 1000

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

  const fetchTrending = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trending`)
      const data = await res.json()
      dispatch({ type: 'SET_TRENDING', payload: data.items || [] })
    } catch (err: any) {
      console.error('fetchTrending 失败:', err.message)
      dispatch({ type: 'SET_TRENDING', payload: [] })
    }
  }, [dispatch])

  const fetchMovies = useCallback(async (pageNum = 1, genre = '') => {
    try {
      const params = new URLSearchParams({ page: String(pageNum) })
      if (genre) params.set('genre', genre)
      const res = await fetch(`${API_BASE}/movies?${params}`)
      const data = await res.json()
      dispatch({
        type: 'SET_MOVIES',
        payload: { items: data.items || [], page: pageNum, totalPages: data.totalPages || 1 },
      })
    } catch (err: any) {
      console.error('fetchMovies 失败:', err.message)
      if (pageNum === 1) dispatch({ type: 'SET_MOVIES', payload: { items: [], page: 1, totalPages: 1 } })
    }
  }, [dispatch])

  const fetchTv = useCallback(async (pageNum = 1, genre = '') => {
    try {
      const params = new URLSearchParams({ page: String(pageNum) })
      if (genre) params.set('genre', genre)
      const res = await fetch(`${API_BASE}/tv?${params}`)
      const data = await res.json()
      dispatch({
        type: 'SET_TV',
        payload: { items: data.items || [], page: pageNum, totalPages: data.totalPages || 1 },
      })
    } catch (err: any) {
      console.error('fetchTv 失败:', err.message)
      if (pageNum === 1) dispatch({ type: 'SET_TV', payload: { items: [], page: 1, totalPages: 1 } })
    }
  }, [dispatch])

  const fetchLocal = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/local`)
      const data = await res.json()
      dispatch({ type: 'SET_LOCAL', payload: data.items || [] })
    } catch (err: any) {
      console.error('fetchLocal 失败:', err.message)
      dispatch({ type: 'SET_LOCAL', payload: [] })
    }
  }, [dispatch])

  const fetchGenres = useCallback(async () => {
    try {
      const [mRes, tRes] = await Promise.all([
        fetch(`${API_BASE}/movies/genres`),
        fetch(`${API_BASE}/tv/genres`),
      ])
      const mData = await mRes.json()
      const tData = await tRes.json()
      dispatch({ type: 'SET_MOVIE_GENRES', payload: mData.genres || [] })
      dispatch({ type: 'SET_TV_GENRES', payload: tData.genres || [] })
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
      const results = await Promise.allSettled([
        fetchTrending(),
        fetchMovies(1),
        fetchTv(1),
        fetchLocal(),
        fetchGenres(),
      ])
      const allFailed = results.every(r => r.status === 'rejected')
      if (allFailed) {
        dispatch({ type: 'SET_ERROR', payload: '无法连接到服务器，请确认后端已启动（localhost:3001）' })
      } else {
        dispatch({ type: 'SET_LAST_FETCH_TIME', payload: now })
      }
    } catch (err: any) {
      console.error('loadAll 异常:', err.message)
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
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&page=${page}`)
      const data = await res.json()
      dispatch({
        type: 'SET_SEARCH_RESULTS',
        payload: {
          items: data.items || [],
          page,
          totalPages: data.totalPages || 1,
          totalResults: data.totalResults || 0,
        },
      })
    } catch (err: any) {
      console.error('搜索失败:', err.message)
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
