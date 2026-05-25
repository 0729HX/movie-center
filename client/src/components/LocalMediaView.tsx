import { type FC, useState, useEffect } from 'react'
import type { LocalMedia, MediaWithRatings } from '../types'

interface Props {
  items: LocalMedia[]
  onSelect: (item: MediaWithRatings) => void
  onRefresh: () => void
  loading: boolean
}

const formatSize = (bytes: number) => {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`
  return ''
}

const LocalMediaView: FC<Props> = ({ items, onSelect, onRefresh, loading }) => {
  const [scanPath, setScanPath] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'tv'>('all')

  const filteredItems = typeFilter === 'all'
    ? items
    : items.filter(i => i.media_type === typeFilter)

  const movieCount = items.filter(i => i.media_type === 'movie').length
  const tvCount = items.filter(i => i.media_type === 'tv').length

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        if (cfg.media_root) setScanPath(cfg.media_root)
      })
      .catch(() => {})
  }, [])

  const handleScan = async () => {
    if (!scanPath.trim()) return
    setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch('/api/local/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: scanPath }),
      })
      const data = await res.json()
      const parts = [`新增 ${data.added || 0}`]
      if (data.updated) parts.push(`更新 ${data.updated}`)
      if (data.skipped) parts.push(`跳过 ${data.skipped}`)
      if (data.errors?.length) parts.push(`错误 ${data.errors.length}`)
      setScanResult(`扫描完成：${parts.join('，')}` + (data.message ? `\n${data.message}` : ''))
      onRefresh()
    } catch {
      setScanResult('扫描失败')
    } finally {
      setScanning(false)
    }
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleting(id)
    await fetch(`/api/local/${id}`, { method: 'DELETE' })
    setDeleting(null)
    onRefresh()
  }

  const handleItemClick = (item: LocalMedia) => {
    const mediaItem: MediaWithRatings = {
      id: item.id,
      tmdbId: item.tmdb_id,
      title: item.title,
      overview: '',
      posterPath: item.poster_path ? `/api/local/file?path=${encodeURIComponent(item.poster_path)}` : null,
      backdropPath: null,
      year: String(item.year || ''),
      mediaType: item.media_type,
      ratings: [],
      genres: [],
      status: '',
      tagline: '',
      isLocal: true,
      localPath: item.local_path,
      localId: item.id,
    }
    onSelect(mediaItem)
  }

  return (
    <div className="local-view">
      <h2 className="section-title">本地影视</h2>

      {/* 扫描区 */}
      <div style={{ padding: '0 var(--content-padding)', marginBottom: 32 }}>
        <div style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '16px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <input
            type="text"
            placeholder="输入媒体目录路径，如 D:/media/movies"
            value={scanPath}
            onChange={e => setScanPath(e.target.value)}
            style={{
              flex: 1,
              minWidth: 280,
              padding: '10px 14px',
              fontSize: 14,
              background: 'var(--bg-card)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,113,227,0.12)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              padding: '10px 24px',
              background: scanning ? 'var(--text-tertiary)' : 'var(--accent)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 10,
              border: 'none',
              cursor: scanning ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {scanning ? (
              '扫描中...'
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                扫描目录
              </>
            )}
          </button>
        </div>
        {scanResult && (
          <p style={{
            marginTop: 10,
            fontSize: 13,
            color: scanResult.includes('失败') ? '#ff453a' : 'var(--text-secondary)',
            padding: '0 16px',
            whiteSpace: 'pre-line',
            lineHeight: 1.6,
          }}>
            {scanResult}
          </p>
        )}
      </div>

      {/* 分类筛选标签 */}
      {items.length > 0 && !loading && (
        <div className="scroll-row" style={{ marginBottom: 24, gap: 8, padding: '0 var(--content-padding)' }}>
          {([
            { key: 'all' as const, label: '全部', count: items.length },
            { key: 'movie' as const, label: '电影', count: movieCount },
            { key: 'tv' as const, label: '剧集', count: tvCount },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key)}
              style={{
                flexShrink: 0,
                padding: '7px 18px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                background: typeFilter === tab.key ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                color: typeFilter === tab.key ? '#fff' : 'var(--text-secondary)',
                border: typeFilter === tab.key ? 'none' : '1px solid rgba(255,255,255,0.08)',
                transition: 'all 0.2s ease',
                letterSpacing: '0.01em',
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="skeleton-row">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-poster" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="local-empty">
          <div className="empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" style={{ color: 'var(--text-tertiary)', opacity: 0.4 }}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="empty-title">还没有本地影视</div>
          <div className="empty-desc">输入媒体目录路径并点击扫描，或从 TMDB 中收藏到本地</div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="local-empty">
          <div className="empty-icon" style={{ fontSize: 48, opacity: 0.4 }}>
            {typeFilter === 'movie' ? '🎬' : '📺'}
          </div>
          <div className="empty-title">暂无{typeFilter === 'movie' ? '电影' : '剧集'}</div>
          <div className="empty-desc">该分类下还没有内容，请先扫描目录</div>
        </div>
      ) : (
        <div className="poster-grid">
          {filteredItems.map((item, index) => {
            const posterUrl = item.poster_path
              ? `/api/local/file?path=${encodeURIComponent(item.poster_path!)}`
              : null
            return (
              <LocalCard
                key={item.id}
                item={item}
                posterUrl={posterUrl}
                index={index}
                deleting={deleting === item.id}
                onSelect={() => handleItemClick(item)}
                onDelete={(e) => handleDelete(item.id, e)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/* 本地影视卡片 — 与 PosterCard 一致的视觉风格 */
const LocalCard: FC<{
  item: LocalMedia
  posterUrl: string | null
  index: number
  deleting: boolean
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
}> = ({ item, posterUrl, index, deleting, onSelect, onDelete }) => {
  const [imgError, setImgError] = useState(false)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="poster-card"
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        animation: `fadeInUp 0.4s var(--ease-out-expo) ${Math.min(index * 0.04, 0.5)}s both`,
      }}
    >
      {/* 海报图区 */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {posterUrl && !imgError ? (
          <img
            className="poster-img"
            src={posterUrl}
            alt={item.title}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="poster-placeholder" style={{ flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 32, opacity: 0.3 }}>
              {item.media_type === 'movie' ? '🎬' : '📺'}
            </span>
            <span style={{ opacity: 0.5, fontSize: 13, fontWeight: 600 }}>{item.title}</span>
          </div>
        )}

        {/* hover 叠加层 — 显示文件信息 */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.88) 100%)',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.35s ease',
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: 14,
        }}>
          <p style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: 11,
            lineHeight: 1.5,
            margin: 0,
            fontFamily: 'ui-monospace, "Cascadia Code", monospace',
            wordBreak: 'break-all',
          }}>
            {item.local_path?.split(/[/\\]/).pop() || item.local_path}
          </p>
          {item.file_size > 0 && (
            <p style={{
              color: 'var(--text-tertiary)',
              fontSize: 11,
              margin: '4px 0 0',
            }}>
              {formatSize(item.file_size)}
            </p>
          )}
        </div>

        {/* 删除按钮 — 毛玻璃风格 */}
        <button
          onClick={onDelete}
          disabled={deleting}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 34, height: 34, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13,
            background: 'rgba(0,0,0,0.55)',
            color: '#ff453a',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,69,58,0.25)',
            cursor: deleting ? 'default' : 'pointer',
            transition: 'all 0.3s var(--ease-spring)',
            zIndex: 2,
            opacity: hovered || deleting ? 1 : 0,
            transform: hovered || deleting ? 'scale(1)' : 'scale(0.8)',
          }}
          title="移除"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
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
      </div>
    </div>
  )
}

export default LocalMediaView
