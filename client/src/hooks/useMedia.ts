/**
 * Page-level media hooks built on useApi + api client.
 *
 * These hooks provide a self-contained alternative to the Context-based
 * data fetching for simpler page-level usage.
 */

import { useState, useCallback } from 'react'
import { useApi, useDebounce, type UseApiReturn } from './useApi'
import { api } from '../api/client'
import type {
  ApiTrendingResponse,
  ApiMovieListResponse,
  ApiTvListResponse,
  ApiLocalListResponse,
  ApiSearchResponse,
} from '../types/api'

// ─── useTrending ────────────────────────────────────────────────────

/** Fetch the trending/homepage data. */
export function useTrending(): UseApiReturn<ApiTrendingResponse> {
  return useApi<ApiTrendingResponse>(
    (signal) => api.trending.get(signal),
    [],
  )
}

// ─── useMovies ─────────────────────────────────────────────────────

export interface UseMoviesReturn extends UseApiReturn<ApiMovieListResponse> {
  /** Current genre filter (empty string = all). */
  genre: string
  /** Change the genre filter; resets page to 1. */
  setGenre: (genre: string) => void
  /** Current page number. */
  page: number
  /** Go to a specific page. */
  setPage: (page: number) => void
  /** Total pages reported by the server. */
  totalPages: number
}

/** Fetch the movie list with optional genre filter and pagination. */
export function useMovies(initialGenre = ''): UseMoviesReturn {
  const [genre, setGenreState] = useState(initialGenre)
  const [page, setPage] = useState(1)

  const setGenre = useCallback((g: string) => {
    setGenreState(g)
    setPage(1)
  }, [])

  const apiResult = useApi<ApiMovieListResponse>(
    (signal) => api.movies.list(page, genre, signal),
    [page, genre],
  )

  return {
    ...apiResult,
    genre,
    setGenre,
    page,
    setPage,
    totalPages: apiResult.data?.totalPages ?? 1,
  }
}

// ─── useTv ─────────────────────────────────────────────────────────

export interface UseTvReturn extends UseApiReturn<ApiTvListResponse> {
  /** Current genre filter (empty string = all). */
  genre: string
  /** Change the genre filter; resets page to 1. */
  setGenre: (genre: string) => void
  /** Current page number. */
  page: number
  /** Go to a specific page. */
  setPage: (page: number) => void
  /** Total pages reported by the server. */
  totalPages: number
}

/** Fetch the TV show list with optional genre filter and pagination. */
export function useTv(initialGenre = ''): UseTvReturn {
  const [genre, setGenreState] = useState(initialGenre)
  const [page, setPage] = useState(1)

  const setGenre = useCallback((g: string) => {
    setGenreState(g)
    setPage(1)
  }, [])

  const apiResult = useApi<ApiTvListResponse>(
    (signal) => api.tv.list(page, genre, signal),
    [page, genre],
  )

  return {
    ...apiResult,
    genre,
    setGenre,
    page,
    setPage,
    totalPages: apiResult.data?.totalPages ?? 1,
  }
}

// ─── useLocalMedia ─────────────────────────────────────────────────

/** Fetch the local media library. */
export function useLocalMedia(): UseApiReturn<ApiLocalListResponse> {
  return useApi<ApiLocalListResponse>(
    (signal) => api.local.list(signal),
    [],
  )
}

// ─── useSearch ─────────────────────────────────────────────────────

export interface UseSearchReturn extends UseApiReturn<ApiSearchResponse> {
  /** Raw query string (before debounce). */
  query: string
  /** Update the raw query string. */
  setQuery: (q: string) => void
  /** Current page number. */
  page: number
  /** Go to a specific page. */
  setPage: (page: number) => void
  /** Total pages reported by the server. */
  totalPages: number
  /** Total results reported by the server. */
  totalResults: number
}

/**
 * Search hook with built-in debounce.
 *
 * The API call fires after `delay` ms of inactivity on the query string.
 * When the query changes, the page resets to 1 automatically.
 */
export function useSearch(debounceDelay = 300): UseSearchReturn {
  const [query, setQueryRaw] = useState('')
  const [page, setPage] = useState(1)
  const debouncedQuery = useDebounce(query, debounceDelay)

  const setQuery = useCallback((q: string) => {
    setQueryRaw(q)
    setPage(1)
  }, [])

  const apiResult = useApi<ApiSearchResponse>(
    (signal) => {
      if (!debouncedQuery.trim()) {
        // Return empty result for blank queries without making a request
        return Promise.resolve({
          items: [],
          totalPages: 1,
          totalResults: 0,
        } satisfies ApiSearchResponse)
      }
      return api.search(debouncedQuery, page, signal)
    },
    [debouncedQuery, page],
  )

  return {
    ...apiResult,
    query,
    setQuery,
    page,
    setPage,
    totalPages: apiResult.data?.totalPages ?? 1,
    totalResults: apiResult.data?.totalResults ?? 0,
  }
}
