import { useState, memo, type FC, type ReactNode } from 'react'
import type { MediaWithRatings } from '../types'
import RatingBadge from './RatingBadge'
import { useDetail } from '../context/hooks'

interface Props {
  item: MediaWithRatings
  style?: React.CSSProperties
  highlightQuery?: string
  isLocal?: boolean
  onToggleFavorite?: () => void
}

function highlightText(text: string, query: string): ReactNode {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="search-highlight">{part}</mark>
      : part
  )
}

const PosterCard: FC<Props> = ({ item, style, highlightQuery, isLocal, onToggleFavorite }) => {
  const { handleSelect } = useDetail()
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [retries, setRetries] = useState(0)
  const MAX_RETRIES = 2

  return (
    <div
      className="poster-card"
      onClick={() => handleSelect(item)}
      style={style}
    >
      {/* 海报图区 */}
      <div className="poster-card-img-wrap">
        {/* 收藏角标 */}
        {isLocal && (
          <div className="poster-card-fav-badge">
            <svg width="14" height="14" viewBox="0 0 24 24"
              fill="#ff2d55" stroke="#ff2d55" strokeWidth={0}
              strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
        )}
        {item.posterPath && !imgError ? (
          <>
            {!imgLoaded && <div className="poster-img-skeleton" />}
            <img
              className={`poster-img${imgLoaded ? ' loaded' : ''}`}
              src={`${item.posterPath}${retries > 0 ? '?retry=' + retries : ''}`}
              alt={item.title}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => {
                if (retries < MAX_RETRIES) setRetries(r => r + 1)
                else setImgError(true)
              }}
            />
          </>
        ) : (
          <div className="poster-placeholder">
            <span className="poster-placeholder-icon">
              {item.mediaType === 'movie' ? '🎬' : '📺'}
            </span>
            <span className="poster-placeholder-title">{item.title}</span>
          </div>
        )}

        {/* hover 渐变 + 信息叠加层 */}
        <div className="poster-card-overlay">
          {onToggleFavorite && (
            <button
              className={`poster-card-fav-btn${isLocal ? ' favorited' : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
              title={isLocal ? '取消收藏' : '收藏'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24"
                fill={isLocal ? '#ff2d55' : 'none'}
                stroke={isLocal ? '#ff2d55' : '#fff'}
                strokeWidth={isLocal ? 0 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          )}
          <p className="poster-card-overlay-text">
            {item.overview || '暂无简介'}
          </p>
        </div>

      </div>

      {/* 信息区 */}
      <div className="poster-info">
        <div className="poster-title">
          {highlightQuery ? highlightText(item.title, highlightQuery) : item.title}
        </div>
        <div className="poster-year">
          {item.year}{' · '}{item.mediaType === 'movie' ? '电影' : '剧集'}
        </div>
        <RatingBadge ratings={item.ratings} compact />
      </div>
    </div>
  )
}

export default memo(PosterCard, (prev, next) =>
  prev.item.tmdbId === next.item.tmdbId
  && prev.item.isLocal === next.item.isLocal
  && prev.item.title === next.item.title
  && prev.style === next.style
  && prev.highlightQuery === next.highlightQuery
  && prev.isLocal === next.isLocal
  && prev.onToggleFavorite === next.onToggleFavorite
)
