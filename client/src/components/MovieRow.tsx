import { useRef, useState, useEffect, memo, type FC } from 'react'
import type { MediaWithRatings } from '../types'
import PosterCard from './PosterCard'
import { SkeletonRow } from './Skeleton'

interface Props {
  title: string
  items: MediaWithRatings[]
  loading?: boolean
}

const MovieRow: FC<Props> = ({ title, items, loading }) => {
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
        <SkeletonRow count={8} />
      ) : (
        <div style={{ position: 'relative' }}>
          <div className="scroll-row" ref={scrollRef}>
            {items.map((item, index) => (
              <div
                key={`${item.mediaType}-${item.tmdbId}`}
                className="stagger-item"
                style={{ '--stagger-index': Math.min(index, 10) } as React.CSSProperties}
              >
                <PosterCard item={item} />
              </div>
            ))}
          </div>

          {/* 右侧渐变遮罩（提示可滚动） */}
          {canScrollRight && <div className="scroll-row-fade" />}
        </div>
      )}
    </div>
  )
}

export default memo(MovieRow, (prev, next) =>
  prev.title === next.title
  && prev.loading === next.loading
  && prev.items.length === next.items.length
  && (prev.items.length === 0 || prev.items[0].tmdbId === next.items[0].tmdbId)
)
