import type { MediaWithRatings, LocalMedia } from '../types'

export interface GenreItem {
  id: number
  name: string
}

export interface DataState {
  trending: MediaWithRatings[]
  movies: MediaWithRatings[]
  tvShows: MediaWithRatings[]
  localMedia: LocalMedia[]
  moviePage: number
  tvPage: number
  movieTotalPages: number
  tvTotalPages: number
  loadingMore: boolean
  movieGenre: string
  tvGenre: string
  movieGenres: GenreItem[]
  tvGenres: GenreItem[]
  loading: boolean
  error: string | null
  searchQuery: string
  searchResults: MediaWithRatings[]
  searchPage: number
  searchTotalPages: number
  searchResultCount: number
  selectedMedia: MediaWithRatings | null
  detailLoading: boolean
  lastFetchTime: number
}

export const initialDataState: DataState = {
  trending: [],
  movies: [],
  tvShows: [],
  localMedia: [],
  moviePage: 1,
  tvPage: 1,
  movieTotalPages: 1,
  tvTotalPages: 1,
  loadingMore: false,
  movieGenre: '',
  tvGenre: '',
  movieGenres: [],
  tvGenres: [],
  loading: true,
  error: null,
  searchQuery: '',
  searchResults: [],
  searchPage: 1,
  searchTotalPages: 1,
  searchResultCount: 0,
  selectedMedia: null,
  detailLoading: false,
  lastFetchTime: 0,
}

export type DataAction =
  | { type: 'SET_TRENDING'; payload: MediaWithRatings[] }
  | { type: 'SET_MOVIES'; payload: { items: MediaWithRatings[]; page: number; totalPages: number } }
  | { type: 'SET_TV'; payload: { items: MediaWithRatings[]; page: number; totalPages: number } }
  | { type: 'SET_LOCAL'; payload: LocalMedia[] }
  | { type: 'SET_MOVIE_GENRES'; payload: GenreItem[] }
  | { type: 'SET_TV_GENRES'; payload: GenreItem[] }
  | { type: 'SET_MOVIE_GENRE'; payload: string }
  | { type: 'SET_TV_GENRE'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SELECTED_MEDIA'; payload: MediaWithRatings | null }
  | { type: 'UPDATE_SELECTED_MEDIA'; payload: Partial<MediaWithRatings> }
  | { type: 'SET_DETAIL_LOADING'; payload: boolean }
  | { type: 'SET_LOADING_MORE'; payload: boolean }
  | { type: 'SET_LAST_FETCH_TIME'; payload: number }
  | { type: 'SET_MOVIE_PAGE'; payload: number }
  | { type: 'SET_TV_PAGE'; payload: number }
  | { type: 'SET_SEARCH_RESULTS'; payload: { items: MediaWithRatings[]; page: number; totalPages: number; totalResults: number } }
  | { type: 'CLEAR_SEARCH_RESULTS' }

export function dataReducer(state: DataState, action: DataAction): DataState {
  switch (action.type) {
    case 'SET_TRENDING':
      return { ...state, trending: action.payload }

    case 'SET_MOVIES':
      return {
        ...state,
        movies: action.payload.page === 1
          ? action.payload.items
          : [...state.movies, ...action.payload.items],
        movieTotalPages: action.payload.totalPages,
      }

    case 'SET_TV':
      return {
        ...state,
        tvShows: action.payload.page === 1
          ? action.payload.items
          : [...state.tvShows, ...action.payload.items],
        tvTotalPages: action.payload.totalPages,
      }

    case 'SET_LOCAL':
      return { ...state, localMedia: action.payload }

    case 'SET_MOVIE_GENRES':
      return { ...state, movieGenres: action.payload }

    case 'SET_TV_GENRES':
      return { ...state, tvGenres: action.payload }

    case 'SET_MOVIE_GENRE':
      return { ...state, movieGenre: action.payload, moviePage: 1 }

    case 'SET_TV_GENRE':
      return { ...state, tvGenre: action.payload, tvPage: 1 }

    case 'SET_LOADING':
      return { ...state, loading: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload }

    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload }

    case 'SET_SELECTED_MEDIA':
      return { ...state, selectedMedia: action.payload }

    case 'UPDATE_SELECTED_MEDIA':
      return state.selectedMedia
        ? { ...state, selectedMedia: { ...state.selectedMedia, ...action.payload } }
        : state

    case 'SET_DETAIL_LOADING':
      return { ...state, detailLoading: action.payload }

    case 'SET_LOADING_MORE':
      return { ...state, loadingMore: action.payload }

    case 'SET_LAST_FETCH_TIME':
      return { ...state, lastFetchTime: action.payload }

    case 'SET_MOVIE_PAGE':
      return { ...state, moviePage: action.payload }

    case 'SET_TV_PAGE':
      return { ...state, tvPage: action.payload }

    case 'SET_SEARCH_RESULTS':
      return {
        ...state,
        searchResults: action.payload.page === 1
          ? action.payload.items
          : [...state.searchResults, ...action.payload.items],
        searchPage: action.payload.page,
        searchTotalPages: action.payload.totalPages,
        searchResultCount: action.payload.totalResults,
      }

    case 'CLEAR_SEARCH_RESULTS':
      return { ...state, searchResults: [], searchPage: 1, searchTotalPages: 1, searchResultCount: 0, searchQuery: '' }

    default:
      return state
  }
}
