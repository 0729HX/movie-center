import { useState, useEffect, useCallback, useRef, type FC } from 'react'
import type { MediaWithRatings } from '../types'
import RatingBadge from './RatingBadge'
import { useDetail } from '../context/hooks'

interface Props {
  items: MediaWithRatings[]
}

const AUTO_INTERVAL = 6000

const HeroBanner: FC<Props> = ({ items }) => {
  const { handleSelect } = useDetail()
  const [current, setCurrent] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const goTo = useCallback((index: number) => {
    if (transitioning) return
    setTransitioning(true)
    setTimeout(() => {
      setCurrent(index)
      setTransitioning(false)
      setProgress(0)
    }, 350)
  }, [transitioning])

  const next = useCallback(() => {
    goTo((current + 1) % items.length)
  }, [current, items.length, goTo])

  // 自动轮播 + 进度 tick
  useEffect(() => {
    if (items.length <= 1) return
    timerRef.current = setInterval(next, AUTO_INTERVAL)
    tickRef.current = setInterval(() => {
      setProgress(prev => Math.min(prev + 60 / AUTO_INTERVAL * 100, 100))
    }, 60)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [items.length, next])

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (tickRef.current) clearInterval(tickRef.current)
    setProgress(0)
    if (items.length > 1) {
      timerRef.current = setInterval(next, AUTO_INTERVAL)
      tickRef.current = setInterval(() => {
        setProgress(prev => Math.min(prev + 60 / AUTO_INTERVAL * 100, 100))
      }, 60)
    }
  }

  const handleDotClick = (i: number) => {
    if (i === current) return
    goTo(i)
    resetTimer()
  }

  if (!items.length) return null

  const item = items[current]

  return (
    <div className="hero-section">
      <div
        className="hero-banner"
        onClick={() => handleSelect(item)}
        style={{ cursor: 'pointer' }}
      >
        {item.backdropPath ? (
          <img
            className="hero-backdrop"
            src={item.backdropPath}
            alt={item.title}
            style={{ opacity: transitioning ? 0.4 : 1, transition: 'opacity 0.4s ease' }}
          />
        ) : (
          <div className="hero-backdrop" style={{ background: 'var(--bg-secondary)' }} />
        )}
        <div className="hero-gradient" />

        <div
          className="hero-content"
          style={{
            opacity: transitioning ? 0 : 1,
            transform: transitioning ? 'translateY(10px)' : 'translateY(0)',
            transition: 'opacity 0.35s ease, transform 0.35s ease',
          }}
        >
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

      {/* 导航点（活跃点内嵌进度填充） */}
      {items.length > 1 && (
        <div className="hero-nav">
          {items.map((_, i) => {
            const isActive = i === current
            return (
              <button
                key={i}
                className="hero-dot"
                onClick={(e) => { e.stopPropagation(); handleDotClick(i) }}
                style={{
                  width: isActive ? 28 : 8,
                  background: isActive
                    ? `linear-gradient(to right, var(--accent) ${progress}%, rgba(255,255,255,0.15) ${progress}%)`
                    : 'rgba(255,255,255,0.15)',
                  transition: isActive
                    ? 'width 0.4s var(--ease-out-expo)'
                    : 'all 0.4s var(--ease-out-expo)',
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default HeroBanner
