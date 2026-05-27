import { type FC, useState, useEffect, useMemo, useCallback } from 'react'
import type { LocalMedia, MediaWithRatings } from '../types'
import { useApp, useDetail } from '../context/hooks'
import { api } from '../api/client'
import { SkeletonWall } from './Skeleton'

/** 剧集按标题分组的数据结构 */
interface SeriesGroup {
  type: 'series'
  title: string
  year: string
  posterPath: string | null
  episodes: LocalMedia[]
  totalSize: number
}

interface Props {
  items: LocalMedia[]
  loading: boolean
}

type SortField = 'added_at' | 'title' | 'year' | 'file_size'
type SortDir = 'asc' | 'desc'

const sortOptions: { key: SortField; label: string }[] = [
  { key: 'added_at', label: '添加时间' },
  { key: 'title', label: '标题' },
  { key: 'year', label: '年份' },
  { key: 'file_size', label: '文件大小' },
]

const formatSize = (bytes: number) => {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`
  return ''
}

const LocalMediaView: FC<Props> = ({ items, loading }) => {
  const { fetchLocal } = useApp()
  const { handleSelect } = useDetail()
  const [scanPath, setScanPath] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'tv'>('all')
  const [textFilter, setTextFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('added_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // 批量操作
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // 单个删除确认
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null)

  // 筛选 + 排序 + 剧集分组（单次 useMemo）
  const displayItems = useMemo(() => {
    let result = items
    // 类型筛选
    if (typeFilter !== 'all') result = result.filter(i => i.media_type === typeFilter)
    // 文本筛选
    if (textFilter.trim()) {
      const q = textFilter.toLowerCase()
      result = result.filter(i => i.title.toLowerCase().includes(q))
    }
    // 排序
    result = [...result].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === 'string' && typeof bVal === 'string') return aVal.localeCompare(bVal)
      return (aVal as number) - (bVal as number)
    })
    if (sortDir === 'desc') result.reverse()

    // 剧集按标题分组，电影保持不变
    const movies = result.filter(i => i.media_type === 'movie')
    const tvItems = result.filter(i => i.media_type === 'tv')

    // 按标题聚合剧集
    const seriesMap = new Map<string, LocalMedia[]>()
    for (const ep of tvItems) {
      const key = ep.title
      if (!seriesMap.has(key)) seriesMap.set(key, [])
      seriesMap.get(key)!.push(ep)
    }

    const seriesGroups: SeriesGroup[] = []
    for (const [title, episodes] of seriesMap) {
      // 各集按文件名排序
      episodes.sort((a, b) => {
        const aName = a.local_path?.split(/[/\\]/).pop() || ''
        const bName = b.local_path?.split(/[/\\]/).pop() || ''
        return aName.localeCompare(bName)
      })
      seriesGroups.push({
        type: 'series',
        title,
        year: String(episodes[0].year || ''),
        posterPath: episodes[0].poster_path,
        episodes,
        totalSize: episodes.reduce((sum, e) => sum + e.file_size, 0),
      })
    }

    // 合并电影和剧集组，按各自排序位置保持顺序
    // 使用添加时间排序时保持原始顺序
    const itemsWithIndex = result.map((item, i) => ({ item, originalIndex: i }))
    const movieItems = itemsWithIndex.filter(x => x.item.media_type === 'movie')
    const tvGroupItems = itemsWithIndex.filter(x => x.item.media_type === 'tv')

    // 按原始顺序构建分组列表
    const merged: (LocalMedia | SeriesGroup)[] = []
    const seriesAdded = new Set<string>()
    const tvItemToSeries = new Map<number, string>()
    for (const { item } of tvGroupItems) {
      tvItemToSeries.set(item.id, item.title)
    }

    for (const { item, originalIndex } of itemsWithIndex) {
      if (item.media_type === 'movie') {
        merged.push(item)
      } else {
        const seriesTitle = item.title
        if (!seriesAdded.has(seriesTitle)) {
          seriesAdded.add(seriesTitle)
          const group = seriesGroups.find(g => g.title === seriesTitle)
          if (group) merged.push(group)
        }
      }
    }

    return merged
  }, [items, typeFilter, textFilter, sortField, sortDir])

  const movieCount = items.filter(i => i.media_type === 'movie').length
  const tvCount = items.filter(i => i.media_type === 'tv').length

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => { if (cfg.media_root) setScanPath(cfg.media_root) })
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
      fetchLocal()
    } catch {
      setScanResult('扫描失败')
    } finally {
      setScanning(false)
    }
  }

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const item = items.find(i => i.id === id)
    setDeleteTarget({ id, title: item?.title || `#${id}` })
  }

  const confirmDelete = async (deleteFiles: boolean) => {
    if (!deleteTarget) return
    const { id } = deleteTarget
    setDeleteTarget(null)
    setDeleting(id)
    try {
      await api.local.delete(id, deleteFiles)
      fetchLocal()
    } catch {
      fetchLocal()
    } finally {
      setDeleting(null)
    }
  }

  const handlePlay = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/local/play/${id}`, { method: 'POST' }).catch(() => {})
  }

  const handleItemClick = (item: LocalMedia) => {
    if (batchMode) {
      toggleSelect(item.id)
      return
    }
    const mediaItem: MediaWithRatings = {
      id: item.id,
      tmdbId: item.tmdb_id,
      title: item.title,
      overview: '',
      posterPath: item.poster_path
        ? (item.poster_path.startsWith('http') ? item.poster_path : `/api/local/file?path=${encodeURIComponent(item.poster_path)}`)
        : null,
      backdropPath: item.backdrop_path
        ? (item.backdrop_path.startsWith('http') ? item.backdrop_path : `/api/local/file?path=${encodeURIComponent(item.backdrop_path)}`)
        : null,
      year: String(item.year || ''),
      mediaType: item.media_type,
      ratings: [],
      genres: [],
      status: '',
      tagline: '',
      isLocal: true,
      localPath: item.local_path,
      localId: item.id,
      nfoRatings: item.nfo_ratings || undefined,
      streamInfo: item.stream_info || undefined,
      clearlogoPath: item.clearlogo_path
        ? (item.clearlogo_path.startsWith('http') ? item.clearlogo_path : `/api/local/file?path=${encodeURIComponent(item.clearlogo_path)}`)
        : undefined,
    }
    handleSelect(mediaItem)
  }

  // 批量操作
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = () => {
    if (selectedIds.size === displayItems.length) {
      setSelectedIds(new Set())
    } else {
      // 从 LocalMedia 和 SeriesGroup 中提取所有 id
      const allIds: number[] = []
      for (const item of displayItems) {
        if ('type' in item && item.type === 'series') {
          for (const ep of item.episodes) allIds.push(ep.id)
        } else {
          allIds.push((item as LocalMedia).id)
        }
      }
      setSelectedIds(new Set(allIds))
    }
  }

  const handleBatchDelete = async (deleteFiles: boolean) => {
    setBatchDeleting(true)
    setShowConfirm(false)
    // 乐观 UI：先从本地 state 移除
    const idsToDelete = [...selectedIds]
    setSelectedIds(new Set())
    setBatchMode(false)
    try {
      await Promise.all(idsToDelete.map(id =>
        api.local.delete(id, deleteFiles)
      ))
      fetchLocal()
    } catch {
      fetchLocal() // 失败时 refetch
    } finally {
      setBatchDeleting(false)
    }
  }

  const enterBatchMode = () => {
    setBatchMode(true)
    setSelectedIds(new Set())
  }

  const cancelBatchMode = () => {
    setBatchMode(false)
    setSelectedIds(new Set())
  }

  return (
    <div className="local-view">
      <h2 className="section-title">本地影视</h2>

      {/* 扫描区 */}
      <div style={{ padding: '0 var(--content-padding)', marginBottom: 32 }}>
        <div className="scan-container">
          <input
            className="scan-input"
            type="text"
            placeholder="输入媒体目录路径，如 D:/media/movies"
            value={scanPath}
            onChange={e => setScanPath(e.target.value)}
          />
          <button
            className="scan-btn"
            onClick={handleScan}
            disabled={scanning}
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
          <p className={`scan-result${scanResult.includes('失败') ? ' error' : ''}`}>
            {scanResult}
          </p>
        )}
      </div>

      {/* 筛选 + 排序工具栏 */}
      {items.length > 0 && !loading && (
        <div style={{ padding: '0 var(--content-padding)', marginBottom: 24 }}>
          {/* 类型筛选 */}
          <div className="genre-filter" style={{ marginBottom: 12 }}>
            {([
              { key: 'all' as const, label: '全部', count: items.length },
              { key: 'movie' as const, label: '电影', count: movieCount },
              { key: 'tv' as const, label: '剧集', count: tvCount },
            ]).map(tab => (
              <button
                key={tab.key}
                className={`genre-pill${typeFilter === tab.key ? ' active' : ''}`}
                onClick={() => setTypeFilter(tab.key)}
              >
                {tab.label} ({tab.count})
              </button>
            ))}

            {/* 批量模式切换 */}
            {!batchMode ? (
              <button className="genre-pill batch-select-all-btn" onClick={enterBatchMode}>
                批量管理
              </button>
            ) : (
              <>
                <button className="genre-pill batch-select-all-btn" onClick={toggleSelectAll}>
                  {selectedIds.size === displayItems.length ? '取消全选' : '全选'}
                </button>
                <button className="genre-pill" onClick={cancelBatchMode}>
                  取消
                </button>
              </>
            )}
          </div>

          {/* 文本筛选 + 排序 */}
          <div className="sort-toolbar">
            <input
              className="local-search-input"
              type="text"
              placeholder="按标题筛选..."
              value={textFilter}
              onChange={e => setTextFilter(e.target.value)}
            />
            <div className="sort-controls">
              {sortOptions.map(opt => (
                <button
                  key={opt.key}
                  className={`genre-pill${sortField === opt.key ? ' active' : ''}`}
                  onClick={() => {
                    if (sortField === opt.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
                    else { setSortField(opt.key); setSortDir('desc') }
                  }}
                >
                  {opt.label}
                  {sortField === opt.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <SkeletonWall count={12} />
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
      ) : displayItems.length === 0 ? (
        <div className="local-empty">
          <div className="empty-icon" style={{ fontSize: 48, opacity: 0.4 }}>
            {typeFilter === 'movie' ? '🎬' : '📺'}
          </div>
          <div className="empty-title">暂无匹配内容</div>
          <div className="empty-desc">试试调整筛选条件</div>
        </div>
      ) : (
        <div className="poster-grid">
          {displayItems.map((item, index) => {
            if ('type' in item && item.type === 'series') {
              return (
                <SeriesCard
                  key={`series-${item.title}`}
                  group={item}
                  index={index}
                  batchMode={batchMode}
                  onDelete={handleDelete}
                  onPlay={handlePlay}
                />
              )
            }
            // LocalMedia (movie 或单独的剧集)
            const media = item as LocalMedia
            const posterUrl = media.poster_path
              ? (media.poster_path!.startsWith('http')
                ? media.poster_path!
                : `/api/local/file?path=${encodeURIComponent(media.poster_path!)}`)
              : null
            return (
              <LocalCard
                key={media.id}
                item={media}
                posterUrl={posterUrl}
                index={index}
                deleting={deleting === media.id}
                batchMode={batchMode}
                selected={selectedIds.has(media.id)}
                onSelect={() => handleItemClick(media)}
                onDelete={(e) => handleDelete(media.id, e)}
                onPlay={(e) => handlePlay(media.id, e)}
              />
            )
          })}
        </div>
      )}

      {/* 批量操作浮动栏 */}
      {batchMode && selectedIds.size > 0 && (
        <div className="batch-toolbar">
          <span className="batch-toolbar-count">已选 {selectedIds.size} 项</span>
          <button
            className="batch-toolbar-delete"
            onClick={() => setShowConfirm(true)}
            disabled={batchDeleting}
          >
            {batchDeleting ? '删除中...' : '删除选中'}
          </button>
        </div>
      )}

      {/* 批量删除确认弹窗 */}
      {showConfirm && (
        <div className="batch-confirm-backdrop" onClick={() => setShowConfirm(false)}>
          <div className="batch-confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="batch-confirm-title">确认删除</div>
            <div className="batch-confirm-msg">
              已选 {selectedIds.size} 项本地影视。请选择操作：
            </div>
            <div className="batch-confirm-actions">
              <button className="genre-pill" onClick={() => setShowConfirm(false)}>取消</button>
              <button className="batch-toolbar-delete" onClick={() => handleBatchDelete(false)}>仅移除记录</button>
              <button className="batch-toolbar-delete" onClick={() => handleBatchDelete(true)}>删除文件和记录</button>
            </div>
          </div>
        </div>
      )}

      {/* 单个删除确认弹窗 */}
      {deleteTarget && (
        <div className="batch-confirm-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="batch-confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="batch-confirm-title">确认删除</div>
            <div className="batch-confirm-msg">
              确定要删除「{deleteTarget.title}」吗？请选择操作：
            </div>
            <div className="batch-confirm-actions">
              <button className="genre-pill" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="batch-toolbar-delete" onClick={() => confirmDelete(false)}>仅移除记录</button>
              <button className="batch-toolbar-delete" onClick={() => confirmDelete(true)}>删除文件和记录</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── 剧集分组卡片 ─────────────────────────────────────────────────── */
const SeriesCard: FC<{
  group: SeriesGroup
  index: number
  batchMode: boolean
  onDelete: (id: number, e: React.MouseEvent) => void
  onPlay: (id: number, e: React.MouseEvent) => void
}> = ({ group, index, batchMode, onDelete, onPlay }) => {
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

/* 本地影视卡片 — 与 PosterCard 一致的视觉风格 */
const LocalCard: FC<{
  item: LocalMedia
  posterUrl: string | null
  index: number
  deleting: boolean
  batchMode: boolean
  selected: boolean
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
  onPlay: (e: React.MouseEvent) => void
}> = ({ item, posterUrl, index, deleting, batchMode, selected, onSelect, onDelete, onPlay }) => {
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

export default LocalMediaView
