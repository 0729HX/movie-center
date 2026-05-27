import { createContext, useCallback, useContext, type ReactNode } from 'react'
import type { MediaWithRatings, Recommendation } from '../types'
import { DataContext } from './DataContext'
import { AppContext } from './AppContext'
import { api } from '../api/client'

interface DetailContextValue {
  handleSelect: (item: MediaWithRatings) => Promise<void>
  handleSaveLocal: (item: MediaWithRatings) => Promise<void>
  handleRemoveLocal: (item: MediaWithRatings) => Promise<void>
  handleSelectRecommendation: (rec: Recommendation) => void
  handleCloseDetail: () => void
}

export const DetailContext = createContext<DetailContextValue>({} as DetailContextValue)

export function DetailContextProvider({ children }: { children: ReactNode }) {
  const { dispatch } = useContext(DataContext)
  const { fetchLocal } = useContext(AppContext)

  const handleSelect = useCallback(async (item: MediaWithRatings) => {
    // 立即用列表数据打开弹窗
    dispatch({ type: 'SET_SELECTED_MEDIA', payload: item })

    if (item.isLocal) {
      if (item.localId) {
        dispatch({ type: 'SET_DETAIL_LOADING', payload: true })
        try {
          const detail = await api.local.detail(item.localId)
          dispatch({ type: 'SET_SELECTED_MEDIA', payload: detail })
          if (detail.tmdbId > 0 && !item.tmdbId) fetchLocal()
        } catch { /* 列表数据兜底 */ }
        dispatch({ type: 'SET_DETAIL_LOADING', payload: false })
      }
      return
    }

    dispatch({ type: 'SET_DETAIL_LOADING', payload: true })
    try {
      const detail = await api.detail.get(item.mediaType, item.tmdbId)
      dispatch({ type: 'SET_SELECTED_MEDIA', payload: detail })
    } catch { /* 列表数据已经显示 */ }
    dispatch({ type: 'SET_DETAIL_LOADING', payload: false })
  }, [dispatch, fetchLocal])

  const handleSaveLocal = useCallback(async (item: MediaWithRatings) => {
    // 乐观更新
    dispatch({ type: 'UPDATE_SELECTED_MEDIA', payload: { isLocal: true } })
    await api.local.save({
      tmdb_id: item.tmdbId,
      media_type: item.mediaType,
      title: item.title,
    })
    fetchLocal()
  }, [dispatch, fetchLocal])

  const handleRemoveLocal = useCallback(async (item: MediaWithRatings) => {
    const id = item.localId || item.id
    if (!id) return
    // 乐观更新
    dispatch({
      type: 'UPDATE_SELECTED_MEDIA',
      payload: { isLocal: false, localId: undefined, localPath: undefined },
    })
    await api.local.delete(id)
    fetchLocal()
  }, [dispatch, fetchLocal])

  const handleSelectRecommendation = useCallback((rec: Recommendation) => {
    const item: MediaWithRatings = {
      id: rec.id,
      tmdbId: rec.id,
      title: rec.title,
      overview: '',
      posterPath: rec.posterPath,
      backdropPath: null,
      year: rec.year,
      mediaType: rec.mediaType,
      ratings: [],
      genres: [],
      status: '',
      tagline: '',
      isLocal: false,
    }
    handleSelect(item)
  }, [handleSelect])

  const handleCloseDetail = useCallback(() => {
    dispatch({ type: 'SET_SELECTED_MEDIA', payload: null })
    dispatch({ type: 'SET_DETAIL_LOADING', payload: false })
  }, [dispatch])

  return (
    <DetailContext.Provider value={{
      handleSelect, handleSaveLocal, handleRemoveLocal,
      handleSelectRecommendation, handleCloseDetail,
    }}>
      {children}
    </DetailContext.Provider>
  )
}
