import { type FC, useState } from 'react'
import type { LocalMedia } from '../../types'
import { formatSize } from './utils'

export interface SeriesGroup {
  type: 'series'
  title: string
  year: string
  posterPath: string | null
  episodes: LocalMedia[]
  totalSize: number
}

interface Props {
  group: SeriesGroup
  index: number
  batchMode: boolean
  onDelete: (id: number, e: React.MouseEvent) => void
  onPlay: (id: number, e: React.MouseEvent) => void
}

const SeriesCard: FC<Props> = ({ group, index, onDelete, onPlay }) => {
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)

  const posterUrl = group.posterPath
    ? (group.posterPath.startsWith('http')
      ? group.posterPath
      : `/api/local/file?path=${encodeURIComponent(group.posterPath)}`)
    : null

  return (
    <div
      className="poster-card series-card stagger-item"
      style={{ '--stagger-index': Math.min(index, 10) } as React.CSSProperties}
    >
      {/* 海报图区 */}
      <div className="poster-card-img-wrap" onClick={() => setExpanded(v => !v)}>
        {posterUrl && !imgError ? (
          <img
            className="poster-img loaded"
            src={posterUrl}
            alt={group.title}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="poster-placeholder" style={{ flexDirection: 'column', gap: 6 }}>
            <span className="poster-placeholder-icon">📺</span>
            <span className="poster-placeholder-title">{group.title}</span>
          </div>
        )}

        {/* 展开/折叠指示 */}
        <div className="series-expand-indicator">
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.25s ease' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {/* 删除按钮 */}
        <button
          className="local-card-delete-btn deleting"
          onClick={(e) => onDelete(group.episodes[0].id, e)}
          title="移除剧集"
          style={{ opacity: 1, transform: 'scale(1)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>

        {/* 播放按钮（首集） */}
        <button
          className="local-card-play-btn"
          onClick={(e) => onPlay(group.episodes[0].id, e)}
          title="播放首集"
          style={{ opacity: 1, transform: 'scale(1)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>
      </div>

      {/* 信息区 */}
      <div className="poster-info">
        <div className="poster-title">{group.title}</div>
        <div className="poster-year">
          {group.year || '—'}
          {' · '}
          共 {group.episodes.length} 集
          {group.totalSize > 0 && ` · ${formatSize(group.totalSize)}`}
        </div>
      </div>

      {/* 展开的剧集列表 */}
      {expanded && (
        <div className="series-episode-list">
          {group.episodes.map(ep => {
            const epFilename = ep.local_path?.split(/[/\\]/).pop() || ep.local_path
            return (
              <div key={ep.id} className="series-episode-item">
                <span className="series-episode-name" title={epFilename}>
                  {epFilename}
                </span>
                {ep.file_size > 0 && (
                  <span className="series-episode-size">{formatSize(ep.file_size)}</span>
                )}
                <button
                  className="series-episode-play-btn"
                  onClick={(e) => onPlay(ep.id, e)}
                  title="播放"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
                <button
                  className="series-episode-delete-btn"
                  onClick={(e) => onDelete(ep.id, e)}
                  title="移除"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SeriesCard
