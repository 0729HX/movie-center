import { useState, useEffect, useCallback, useRef, type FC } from 'react'
import type { MediaWithRatings } from '../types'
import RatingBadge from './RatingBadge'
import { useDetail } from '../context/hooks'

interface Props {
  items: MediaWithRatings[]
}

const AUTO_INTERVAL = 6000
const SLIDE_DURATION = 500

const HeroBanner: FC<Props> = ({ items }) => {
  const { handleSelect } = useDetail()
  const [current, setCurrent] = useState(0)
  const [slideDir, setSlideDir] = useState<'next' | 'prev' | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [tick, setTick] = useState(0)

  const goTo = useCallback((index: number, dir: 'next' | 'prev') => {
    if (slideDir) return
    setSlideDir(dir)
    setTimeout(() => {
      setCurrent(index)
      setSlideDir(null)
      setTick(t => t + 1)
    }, SLIDE_DURATION)
  }, [slideDir])

  const next = useCallback(() => {
    goTo((current + 1) % items.length, 'next')
  }, [current, items.length, goTo])

  // 自动轮播
  useEffect(() => {
    if (items.length <= 1) return
    timerRef.current = setInterval(next, AUTO_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [items.length, next])

  const handleDotClick = (i: number) => {
    if (i === current || slideDir) return
    if (timerRef.current) clearInterval(timerRef.current)
    const dir = i > current ? 'next' : 'prev'
    goTo(i, dir)
    setTimeout(() => {
      timerRef.current = setInterval(next, AUTO_INTERVAL)
    }, SLIDE_DURATION)
  }

  if (!items.length) return null

  const item = items[current]
  const prevIndex = slideDir === 'next'
    ? (current - 1 + items.length) % items.length
    : slideDir === 'prev'
      ? (current + 1) % items.length
      : null
  const prevItem = prevIndex !== null ? items[prevIndex] : null

  const renderSlide = (m: MediaWithRatings, className: string, key: string) => (
    <div className={`hero-slide ${className}`} key={key}>
      {m.backdropPath ? (
        <img className="hero-backdrop" src={m.backdropPath} alt={m.title} />
      ) : (
        <div className="hero-backdrop" style={{ background: 'var(--bg-secondary)' }} />
      )}
      <div className="hero-gradient" />
    </div>
  )

  return (
    <div className="hero-section">
      <div className="hero-banner" style={{ cursor: 'pointer' }}>
        {/* 静止态：只显示当前 */}
        {!slideDir && (
          <div className="hero-slide hero-slide-active" onClick={() => handleSelect(item)}>
            {renderSlide(item, '', `static-${current}`)}
            <div className="hero-content">
              <h1 className="hero-title">{item.title}</h1>
              <div className="hero-meta">
                {item.year && <span className="badge-year">{item.year}</span>}
                <span>{item.mediaType === 'movie' ? '电影' : '剧集'}</span>
                {item.runtime && (
                  <span>{Math.floor(item.runtime / 60)}h {item.runtime % 60}m</span>
                )}
                {item.genres.length > 0 && (
                  <span>{item.genres.slice(0, 2).join(' / ')}</span>
                )}
              </div>
              <div className="hero-overview">{item.overview}</div>
              <div className="hero-rating">
                <RatingBadge ratings={item.ratings} />
              </div>
            </div>
          </div>
        )}

        {/* 滑动过渡态：前一张 + 当前张同时存在 */}
        {slideDir && prevItem && (
          <div className="hero-slide-container" onClick={() => handleSelect(slideDir === 'next' ? item : prevItem)}>
            {renderSlide(prevItem, `hero-slide-out-${slideDir}`, `prev-${current}`)}
            {renderSlide(item, `hero-slide-in-${slideDir}`, `next-${current}`)}
            <div className={`hero-content hero-content-slide-${slideDir}`}>
              <h1 className="hero-title">{item.title}</h1>
              <div className="hero-meta">
                {item.year && <span className="badge-year">{item.year}</span>}
                <span>{item.mediaType === 'movie' ? '电影' : '剧集'}</span>
                {item.runtime && (
                  <span>{Math.floor(item.runtime / 60)}h {item.runtime % 60}m</span>
                )}
                {item.genres.length > 0 && (
                  <span>{item.genres.slice(0, 2).join(' / ')}</span>
                )}
              </div>
              <div className="hero-overview">{item.overview}</div>
              <div className="hero-rating">
                <RatingBadge ratings={item.ratings} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 导航圆点 + 进度条 */}
      {items.length > 1 && (
        <div className="hero-nav">
          {items.map((_, i) => (
            <button
              key={i === current ? `active-${tick}` : i}
              className={`hero-dot${i === current ? ' active' : ''}`}
              style={i === current ? { '--dot-duration': `${AUTO_INTERVAL}ms` } as React.CSSProperties : undefined}
              onClick={(e) => { e.stopPropagation(); handleDotClick(i) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default HeroBanner
