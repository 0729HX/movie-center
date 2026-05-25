import { useState, useCallback, memo, type FC, type ReactNode } from 'react'
import type { MediaWithRatings } from '../types'
import RatingBadge from './RatingBadge'
import { useDetail } from '../context/hooks'

interface Props {
  item: MediaWithRatings
  style?: React.CSSProperties
  highlightQuery?: string
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

const PosterCard: FC<Props> = ({ item, style, highlightQuery }) => {
  const { handleSelect, handleSaveLocal, handleRemoveLocal } = useDetail()
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [animating, setAnimating] = useState(false)
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
    if (newSaved) handleSaveLocal(item)
    else handleRemoveLocal(item)
  }, [optimisticSaved, item, handleSaveLocal, handleRemoveLocal])

  return (
    <div
      className="poster-card"
      onClick={() => handleSelect(item)}
      style={style}
    >
      {/* 海报图区 */}
      <div className="poster-card-img-wrap">
        {item.posterPath && !imgError ? (
          <>
            {!imgLoaded && <div className="poster-img-skeleton" />}
            <img
              className={`poster-img${imgLoaded ? ' loaded' : ''}`}
              src={item.posterPath}
              alt={item.title}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
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
          <p className="poster-card-overlay-text">
            {item.overview || '暂无简介'}
          </p>
        </div>

        {/* 收藏按钮 */}
        <button
          className={`poster-card-save-btn${optimisticSaved ? ' saved' : ''}${animating ? ' animating' : ''}`}
          onClick={handleToggleSave}
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
)
