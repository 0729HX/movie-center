import { type FC, useMemo, useCallback } from 'react'
import PosterWall from '../components/PosterWall'
import { useData, useApp, useDetail } from '../context/hooks'
import type { MediaWithRatings } from '../types'

const TvPage: FC = () => {
  const { state } = useData()
  const { loadMoreTv, switchTvGenre } = useApp()
  const { handleToggleFavorite } = useDetail()

  const localIds = useMemo(() =>
    new Set(state.localMedia.map(i => i.tmdb_id).filter(Boolean)),
    [state.localMedia]
  )

  const onToggleFavorite = useCallback((item: MediaWithRatings) => {
    handleToggleFavorite(item)
  }, [handleToggleFavorite])

  return (
    <div className="page-transition">
      <PosterWall
        title="剧集"
        items={state.tvShows}
        loading={state.loading}
        hasMore={state.tvPage < state.tvTotalPages}
        onLoadMore={loadMoreTv}
        loadingMore={state.loadingMore}
        genres={state.tvGenres}
        activeGenre={state.tvGenre}
        onGenreChange={switchTvGenre}
        localIds={localIds}
        onToggleFavorite={onToggleFavorite}
      />
    </div>
  )
}

export default TvPage
