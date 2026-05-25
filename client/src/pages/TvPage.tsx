import { type FC } from 'react'
import PosterWall from '../components/PosterWall'
import { useData, useApp } from '../context/hooks'

const TvPage: FC = () => {
  const { state } = useData()
  const { loadMoreTv, switchTvGenre } = useApp()

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
      />
    </div>
  )
}

export default TvPage
