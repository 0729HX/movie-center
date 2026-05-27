import { useRef, useEffect, memo, type FC } from 'react'
import type { MediaWithRatings } from '../types'
import PosterCard from './PosterCard'
import { SkeletonWall } from './Skeleton'

interface Props {
  items: MediaWithRatings[]
  loading?: boolean
  title?: string
  hasMore?: boolean
  onLoadMore?: () => void
  loadingMore?: boolean
  genres?: { id: number; name: string }[]
  activeGenre?: string
  onGenreChange?: (genreId: string) => void
  onClear?: () => void
  highlightQuery?: string
  emptyTitle?: string
  emptyDesc?: string
  resultCount?: number
}

const PosterWall: FC<Props> = ({
  items, loading, title,
  hasMore, onLoadMore, loadingMore,
  genres, activeGenre, onGenreChange, onClear,
  highlightQuery, emptyTitle, emptyDesc, resultCount,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null)

  // 滚动到底部自动加载
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || !onLoadMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          onLoadMore()
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore, loadingMore])

  const itemCount = items.length

  return (
    <div className="category-section" style={{ paddingTop: 24 }}>
      {/* 标题 + 清除搜索 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--content-padding)',
        marginBottom: 20,
      }}>
        <h2 className="section-title" style={{ margin: 0, padding: 0 }}>
          {title}
          {resultCount !== undefined && resultCount > 0 && (
            <span className="search-result-count"> · {resultCount} 个结果</span>
          )}
        </h2>
        {onClear && (
          <button className="btn-clear-search" onClick={onClear}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            清除搜索
          </button>
        )}
      </div>

      {/* 分类筛选条 */}
      {genres && genres.length > 0 && onGenreChange && (
        <div className="genre-filter" style={{ marginBottom: 20 }}>
          <button
            className={`genre-pill${activeGenre === '' ? ' active' : ''}`}
            onClick={() => onGenreChange('')}
          >
            全部
          </button>
          {genres.map(g => (
            <button
              key={g.id}
              className={`genre-pill${activeGenre === String(g.id) ? ' active' : ''}`}
              onClick={() => onGenreChange(String(g.id))}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {/* 内容 */}
      {loading ? (
        <SkeletonWall count={12} />
      ) : items.length === 0 ? (
        <div className="local-empty">
          <div className="empty-icon">🎬</div>
          <div className="empty-title">{emptyTitle || '暂无内容'}</div>
          <div className="empty-desc">{emptyDesc || '换个分类看看吧'}</div>
        </div>
      ) : (
        <>
          <div className="poster-grid">
            {items.map((item, index) => (
              <div
                key={`${item.mediaType}-${item.tmdbId}-${item.id}`}
                className="stagger-item"
                style={{ '--stagger-index': Math.min(index, 10) } as React.CSSProperties}
              >
                <PosterCard item={item} highlightQuery={highlightQuery} />
              </div>
            ))}
          </div>

          {/* 哨兵 — 滚动到此自动加载 */}
          {hasMore && onLoadMore && (
            <div ref={sentinelRef} className="load-more-sentinel">
              {loadingMore ? (
                <span className="load-more-text">加载中...</span>
              ) : (
                <span className="load-more-text">
                  {itemCount} / {itemCount + (hasMore ? 20 : 0)} 部
                </span>
              )}
            </div>
          )}

          {/* 全部加载完 */}
          {!hasMore && items.length > 0 && (
            <div className="all-loaded-text">— 已加载全部 {items.length} 部 —</div>
          )}
        </>
      )}
    </div>
  )
}

export default memo(PosterWall, (prev, next) =>
  prev.title === next.title
  && prev.loading === next.loading
  && prev.loadingMore === next.loadingMore
  && prev.hasMore === next.hasMore
  && prev.activeGenre === next.activeGenre
  && prev.items.length === next.items.length
  && (prev.items.length === 0 || prev.items[0].tmdbId === next.items[0].tmdbId)
  && prev.onLoadMore === next.onLoadMore
  && prev.onGenreChange === next.onGenreChange
  && prev.onClear === next.onClear
)
