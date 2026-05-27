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
    <div className="mb-[var(--section-gap)]">
      <h2 className="font-[family-name:var(--font-display)] text-[28px] font-extrabold tracking-[-0.03em] text-[var(--text-primary)] mb-5 px-[var(--content-padding)] max-md:text-[22px]">{title}</h2>

      {loading ? (
        <SkeletonRow count={8} />
      ) : (
        <div style={{ position: 'relative' }}>
          <div
            className="flex gap-4 overflow-x-auto scroll-snap-x snap-start px-[var(--content-padding)] pb-3 scroll-smooth [&>*]:shrink-0 [&>*]:snap-start scroll-row"
            ref={scrollRef}
          >
            {items.map((item, index) => (
              <div
                key={`${item.mediaType}-${item.tmdbId}`}
                className="animate-[fadeInUp_0.4s_var(--ease-out-expo)_both] [animation-delay:calc(var(--stagger-index,0)*0.06s)]"
                style={{ '--stagger-index': Math.min(index, 10) } as React.CSSProperties}
              >
                <PosterCard item={item} />
              </div>
            ))}
          </div>

          {/* 右侧渐变遮罩（提示可滚动） */}
          {canScrollRight && (
            <div className="absolute top-0 right-0 bottom-2 w-20 bg-gradient-to-l from-transparent to-[var(--bg-primary)] pointer-events-none z-[1]" />
          )}
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
