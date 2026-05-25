import { type FC } from 'react'
import PosterWall from '../components/PosterWall'
import { useData, useApp } from '../context/hooks'

const MoviesPage: FC = () => {
  const { state } = useData()
  const { loadMoreMovies, switchMovieGenre } = useApp()

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
      />
    </div>
  )
}

export default MoviesPage
