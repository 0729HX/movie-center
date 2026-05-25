import { useRef, useEffect, type FC } from 'react'
import type { MediaWithRatings } from '../types'
import PosterCard from './PosterCard'

interface Props {
  items: MediaWithRatings[]
  onSelect: (item: MediaWithRatings) => void
  onSaveLocal?: (item: MediaWithRatings) => void
  onRemoveLocal?: (item: MediaWithRatings) => void
  loading?: boolean
  title?: string
  hasMore?: boolean
  onLoadMore?: () => void
  loadingMore?: boolean
  genres?: { id: number; name: string }[]
  activeGenre?: string
  onGenreChange?: (genreId: string) => void
  onClear?: () => void
}

const PosterWall: FC<Props> = ({
  items, onSelect, onSaveLocal, onRemoveLocal, loading, title,
  hasMore, onLoadMore, loadingMore,
  genres, activeGenre, onGenreChange, onClear,
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

  // 切换分类时重置：首次加载且项目不足一屏时，哨兵天然可见，跳过首次触发
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
        <h2 className="section-title" style={{ margin: 0, padding: 0 }}>{title}</h2>
        {onClear && (
          <button
            onClick={onClear}
            style={{
              fontSize: 13,
              color: 'var(--accent)',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            清除搜索
          </button>
        )}
      </div>

      {/* 分类筛选条 */}
      {genres && genres.length > 0 && onGenreChange && (
        <div className="scroll-row" style={{ marginBottom: 20, gap: 8 }}>
          <button
            onClick={() => onGenreChange('')}
            style={{
              flexShrink: 0,
              padding: '7px 18px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeGenre === '' ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
              color: activeGenre === '' ? '#fff' : 'var(--text-secondary)',
              border: activeGenre === '' ? 'none' : '1px solid rgba(255,255,255,0.08)',
              transition: 'all 0.2s ease',
              letterSpacing: '0.01em',
            }}
          >
            全部
          </button>
          {genres.map(g => (
            <button
              key={g.id}
              onClick={() => onGenreChange(String(g.id))}
              style={{
                flexShrink: 0,
                padding: '7px 18px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                background: activeGenre === String(g.id) ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                color: activeGenre === String(g.id) ? '#fff' : 'var(--text-secondary)',
                border: activeGenre === String(g.id) ? 'none' : '1px solid rgba(255,255,255,0.08)',
                transition: 'all 0.2s ease',
                letterSpacing: '0.01em',
              }}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {/* 内容 */}
      {loading ? (
        <div className="skeleton-row">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-poster" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="local-empty">
          <div className="empty-icon">🎬</div>
          <div className="empty-title">暂无内容</div>
          <div className="empty-desc">换个分类看看吧</div>
        </div>
      ) : (
        <>
          <div className="poster-grid">
            {items.map((item, index) => (
              <div
                key={`${item.mediaType}-${item.tmdbId}-${item.id}`}
                style={{
                  animation: `fadeInUp 0.4s var(--ease-out-expo) ${Math.min(index * 0.04, 0.4)}s both`,
                }}
              >
                <PosterCard
                  item={item}
                  onSelect={onSelect}
                  onSaveLocal={onSaveLocal}
                  onRemoveLocal={onRemoveLocal}
                />
              </div>
            ))}
          </div>

          {/* 哨兵 — 滚动到此自动加载 */}
          {hasMore && onLoadMore && (
            <div ref={sentinelRef} style={{ textAlign: 'center', padding: '32px 0' }}>
              {loadingMore ? (
                <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>加载中...</span>
              ) : (
                <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
                  {itemCount} / {itemCount + (hasMore ? 20 : 0)} 部
                </span>
              )}
            </div>
          )}

          {/* 全部加载完 */}
          {!hasMore && items.length > 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>— 已加载全部 {items.length} 部 —</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default PosterWall
