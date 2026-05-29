import { type FC, useState } from 'react'
import type { LocalMedia } from '../../types'
import { formatSize } from './utils'

interface Props {
  item: LocalMedia
  posterUrl: string | null
  index: number
  deleting: boolean
  batchMode: boolean
  selected: boolean
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
  onPlay: (e: React.MouseEvent) => void
}

const LocalCard: FC<Props> = ({ item, posterUrl, index, deleting, batchMode, selected, onSelect, onDelete, onPlay }) => {
  const [imgError, setImgError] = useState(false)

  return (
    <div
      className={`poster-card stagger-item${selected ? ' local-card-selected' : ''}`}
      onClick={onSelect}
      style={{ '--stagger-index': Math.min(index, 10) } as React.CSSProperties}
    >
      {/* 海报图区 */}
      <div className="poster-card-img-wrap">
        {posterUrl && !imgError ? (
          <img
            className="poster-img loaded"
            src={posterUrl}
            alt={item.title}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="poster-placeholder" style={{ flexDirection: 'column', gap: 6 }}>
            <span className="poster-placeholder-icon">
              {item.media_type === 'movie' ? '🎬' : '📺'}
            </span>
            <span className="poster-placeholder-title">{item.title}</span>
          </div>
        )}

        {/* hover 叠加层 — 显示文件信息 */}
        <div className="local-card-overlay">
          <p className="local-card-filename">
            {item.local_path?.split(/[/\\]/).pop() || item.local_path}
          </p>
          {item.file_size > 0 && (
            <p className="local-card-filesize">
              {formatSize(item.file_size)}
            </p>
          )}
        </div>

        {/* 播放按钮 */}
        <button
          className="local-card-play-btn"
          onClick={onPlay}
          title="播放"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>

        {/* 删除按钮 */}
        <button
          className={`local-card-delete-btn${deleting ? ' deleting' : ''}`}
          onClick={onDelete}
          disabled={deleting}
          title="移除"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>

        {/* 批量选择复选框 */}
        {batchMode && (
          <div className={`local-card-checkbox${selected ? ' checked' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              {selected ? <polyline points="20 6 9 17 4 12" /> : null}
            </svg>
          </div>
        )}
      </div>

      {/* 信息区 */}
      <div className="poster-info">
        <div className="poster-title">{item.title}</div>
        <div className="poster-year">
          {item.year || '—'}
          {' · '}
          {item.media_type === 'movie' ? '电影' : '剧集'}
          {item.file_size > 0 && ` · ${formatSize(item.file_size)}`}
        </div>
        {/* 流媒体信息摘要 */}
        {item.stream_info?.video?.resolution && (
          <div className="card-stream-badges">
            {(() => {
              const h = parseInt(item.stream_info.video.resolution.split('x')[1] || '0')
              if (h >= 2160) return <span className="card-stream-badge card-stream-4k">4K</span>
              if (h >= 1080) return <span className="card-stream-badge card-stream-1080">1080p</span>
              if (h >= 720) return <span className="card-stream-badge card-stream-720">720p</span>
              return null
            })()}
            {item.stream_info.video?.codec && (
              <span className="card-stream-badge card-stream-codec">{item.stream_info.video.codec.toUpperCase()}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default LocalCard
