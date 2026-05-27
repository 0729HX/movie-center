import { type FC } from 'react'
import HeroBanner from '../components/HeroBanner'
import PosterCard from '../components/PosterCard'
import { SkeletonHero, SkeletonRow, SkeletonSectionTitle } from '../components/Skeleton'
import { useData } from '../context/hooks'
import { useNavigate } from 'react-router-dom'

const TrendingPage: FC = () => {
  const { state } = useData()
  const navigate = useNavigate()

  return (
    <div className="page-transition">
      {/* Hero 轮播 */}
      {state.loading ? (
        <SkeletonHero />
      ) : (
        <HeroBanner items={state.trending.slice(0, 8)} />
      )}

      {/* 热门电影 */}
      <section className="category-section" style={{ paddingTop: 8 }}>
        {state.loading ? (
          <>
            <SkeletonSectionTitle />
            <SkeletonRow count={8} />
          </>
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 var(--content-padding)', marginBottom: 16,
            }}>
              <h2 className="section-title" style={{ margin: 0, padding: 0 }}>🎬 热门电影</h2>
              <button onClick={() => navigate('/movies')} className="btn-outline" style={{ fontSize: 13 }}>
                更多电影 →
              </button>
            </div>
            <div className="poster-grid">
              {state.movies.slice(0, 8).map((item, i) => (
                <div key={`movie-${item.tmdbId}`} className="stagger-item" style={{ '--stagger-index': i } as React.CSSProperties}>
                  <PosterCard item={item} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 热门剧集 */}
      <section className="category-section">
        {state.loading ? (
          <>
            <SkeletonSectionTitle />
            <SkeletonRow count={8} />
          </>
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 var(--content-padding)', marginBottom: 16,
            }}>
              <h2 className="section-title" style={{ margin: 0, padding: 0 }}>📺 热门剧集</h2>
              <button onClick={() => navigate('/tv')} className="btn-outline" style={{ fontSize: 13 }}>
                更多剧集 →
              </button>
            </div>
            <div className="poster-grid">
              {state.tvShows.slice(0, 8).map((item, i) => (
                <div key={`tv-${item.tmdbId}`} className="stagger-item" style={{ '--stagger-index': i } as React.CSSProperties}>
                  <PosterCard item={item} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

export default TrendingPage
