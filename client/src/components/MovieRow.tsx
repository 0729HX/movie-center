import { useRef, useState, useEffect, type FC } from 'react'
import type { MediaWithRatings } from '../types'
import PosterCard from './PosterCard'

interface Props {
  title: string
  items: MediaWithRatings[]
  onSelect: (item: MediaWithRatings) => void
  onSaveLocal?: (item: MediaWithRatings) => void
  onRemoveLocal?: (item: MediaWithRatings) => void
  loading?: boolean
}

const MovieRow: FC<Props> = ({ title, items, onSelect, onSaveLocal, onRemoveLocal, loading }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10)
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [items])

  return (
    <div className="category-section">
      <h2 className="section-title">{title}</h2>

      {loading ? (
        <div className="skeleton-row">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-poster" />
          ))}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div className="scroll-row" ref={scrollRef}>
            {items.map((item, index) => (
              <div
                key={`${item.mediaType}-${item.tmdbId}`}
                style={{
                  animation: `fadeInUp 0.4s var(--ease-out-expo) ${Math.min(index * 0.05, 0.5)}s both`,
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

          {/* 右侧渐变遮罩（提示可滚动） */}
          {canScrollRight && (
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 8,
              width: 80,
              background: 'linear-gradient(90deg, transparent, var(--bg-primary))',
              pointerEvents: 'none',
              zIndex: 1,
            }} />
          )}
        </div>
      )}
    </div>
  )
}

export default MovieRow
