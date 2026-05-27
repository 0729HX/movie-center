import { type FC, useState, useEffect, useMemo, useCallback } from 'react'
import HeroBanner from '../components/HeroBanner'
import PosterCard from '../components/PosterCard'
import { SkeletonHero, SkeletonRow, SkeletonSectionTitle } from '../components/Skeleton'
import { useData, useDetail } from '../context/hooks'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { ApiLocalMedia } from '../types/api'
import type { MediaWithRatings } from '../types'

const TrendingPage: FC = () => {
  const { state } = useData()
  const { handleToggleFavorite } = useDetail()
  const navigate = useNavigate()
  const [recentItems, setRecentItems] = useState<ApiLocalMedia[]>([])

  const localIds = useMemo(() =>
    new Set(state.localMedia.map(i => i.tmdb_id).filter(Boolean)),
    [state.localMedia]
  )

  const onToggleFavorite = useCallback((item: MediaWithRatings) => {
    handleToggleFavorite(item)
  }, [handleToggleFavorite])

  useEffect(() => {
    const ctrl = new AbortController()
    api.local.recentlyWatched(ctrl.signal).then(({ items }) => {
      setRecentItems(items)
    }).catch(() => {})
    return () => ctrl.abort()
  }, [])

  return (
    <div className="page-transition">
      {/* Hero 轮播 */}
      {state.loading ? (
        <SkeletonHero />
      ) : (
        <HeroBanner items={state.trending.slice(0, 8)} />
      )}

      {/* 继续观看 */}
      {recentItems.length > 0 && (
        <section className="recently-watched-section">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 var(--content-padding)', marginBottom: 16,
          }}>
            <h2 className="section-title" style={{ margin: 0, padding: 0 }}>▶ 继续观看</h2>
          </div>
          <div className="recently-watched-row">
            {recentItems.map((item) => {
              const posterUrl = item.poster_path
                ? (item.poster_path.startsWith('http') ? item.poster_path : `/api/local/file?path=${encodeURIComponent(item.poster_path)}`)
                : null
              return (
                <div key={`recent-${item.id}`} className="recently-watched-card" onClick={() => navigate(`/local/detail/${item.id}`)}>
                  <div className="recently-watched-card-poster-wrap">
                    {posterUrl ? (
                      <img
                        className="recently-watched-card-poster"
                        src={posterUrl}
                        alt={item.title}
                        loading="lazy"
                      />
                    ) : (
                      <div className="recently-watched-card-poster-placeholder">🎬</div>
                    )}
                    {item.play_progress > 0 && (
                      <div className="recently-watched-card-progress">
                        <div className="recently-watched-card-progress-bar" style={{ width: `${Math.min(100, item.play_progress / 7200 * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="recently-watched-card-title">{item.title}</div>
                  {item.year && <div className="recently-watched-card-year">{item.year}</div>}
                </div>
              )
            })}
          </div>
        </section>
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
                  <PosterCard
                    item={item}
                    isLocal={localIds.has(item.tmdbId)}
                    onToggleFavorite={() => onToggleFavorite(item)}
                  />
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
                  <PosterCard
                    item={item}
                    isLocal={localIds.has(item.tmdbId)}
                    onToggleFavorite={() => onToggleFavorite(item)}
                  />
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
