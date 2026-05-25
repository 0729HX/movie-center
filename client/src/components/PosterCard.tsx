import { useState, useCallback, type FC } from 'react'
import type { MediaWithRatings } from '../types'
import RatingBadge from './RatingBadge'

interface Props {
  item: MediaWithRatings
  onSelect: (item: MediaWithRatings) => void
  onSaveLocal?: (item: MediaWithRatings) => void
  onRemoveLocal?: (item: MediaWithRatings) => void
  style?: React.CSSProperties
}

const PosterCard: FC<Props> = ({ item, onSelect, onSaveLocal, onRemoveLocal, style }) => {
  const [imgError, setImgError] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [optimisticSaved, setOptimisticSaved] = useState(item.isLocal)

  if (item.isLocal !== optimisticSaved && !animating) {
    setOptimisticSaved(item.isLocal)
  }

  const handleToggleSave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setAnimating(true)
    setTimeout(() => setAnimating(false), 400)
    const newSaved = !optimisticSaved
    setOptimisticSaved(newSaved)
    if (newSaved && onSaveLocal) onSaveLocal(item)
    else if (!newSaved && onRemoveLocal) onRemoveLocal(item)
  }, [optimisticSaved, item, onSaveLocal, onRemoveLocal])

  return (
    <div
      className="poster-card"
      onClick={() => onSelect(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={style}
    >
      {/* 海报图区 */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {item.posterPath && !imgError ? (
          <img
            className="poster-img"
            src={item.posterPath}
            alt={item.title}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="poster-placeholder">
            <span style={{ fontSize: 32, opacity: 0.3, marginBottom: 8 }}>
              {item.mediaType === 'movie' ? '🎬' : '📺'}
            </span>
            <span style={{ opacity: 0.5, fontSize: 13, fontWeight: 600 }}>{item.title}</span>
          </div>
        )}

        {/* hover 渐变 + 信息叠加层 */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.85) 100%)',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.35s ease',
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: 14,
        }}>
          <p style={{
            color: '#fff',
            fontSize: 12,
            lineHeight: 1.5,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            opacity: 0.9,
          }}>
            {item.overview || '暂无简介'}
          </p>
        </div>

        {/* 收藏按钮 */}
        {onSaveLocal && (
          <button
            onClick={handleToggleSave}
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 34, height: 34, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15,
              background: optimisticSaved ? 'rgba(255,69,58,0.2)' : 'rgba(0,0,0,0.55)',
              color: optimisticSaved ? '#ff453a' : 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: optimisticSaved ? '1px solid rgba(255,69,58,0.35)' : '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer',
              transition: 'all 0.3s var(--ease-spring)',
              zIndex: 2,
              opacity: hovered || optimisticSaved ? 1 : 0,
              transform: hovered || optimisticSaved ? 'scale(1)' : 'scale(0.8)',
            }}
            title={optimisticSaved ? '取消收藏' : '收藏到本地'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24"
              fill={optimisticSaved ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={optimisticSaved ? 0 : 2.2}
              strokeLinecap="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        )}
      </div>

      {/* 信息区 */}
      <div className="poster-info">
        <div className="poster-title">{item.title}</div>
        <div className="poster-year">
          {item.year}{' · '}{item.mediaType === 'movie' ? '电影' : '剧集'}
        </div>
        <RatingBadge ratings={item.ratings} compact />
      </div>
    </div>
  )
}

export default PosterCard
