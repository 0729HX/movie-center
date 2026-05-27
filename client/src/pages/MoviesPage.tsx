import { type FC, useMemo, useCallback } from 'react'
import PosterWall from '../components/PosterWall'
import { useData, useApp, useDetail } from '../context/hooks'
import type { MediaWithRatings } from '../types'

const MoviesPage: FC = () => {
  const { state } = useData()
  const { loadMoreMovies, switchMovieGenre } = useApp()
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
        title="电影"
        items={state.movies}
        loading={state.loading}
        hasMore={state.moviePage < state.movieTotalPages}
        onLoadMore={loadMoreMovies}
        loadingMore={state.loadingMore}
        genres={state.movieGenres}
        activeGenre={state.movieGenre}
        onGenreChange={switchMovieGenre}
        localIds={localIds}
        onToggleFavorite={onToggleFavorite}
      />
    </div>
  )
}

export default MoviesPage
