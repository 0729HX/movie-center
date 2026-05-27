import { useState, type FC, useEffect } from 'react'
import type { MediaWithRatings, Recommendation, NfoRating, StreamInfo } from '../types'
import RatingBadge from './RatingBadge'
import SubtitlePanel from './SubtitlePanel'
import TrackManager from './TrackManager'
import { useDetail } from '../context/hooks'

interface Props {
  media: MediaWithRatings
  loading?: boolean
}

/* 演员卡片 */
const CastCard: FC<{ name: string; character: string; profilePath: string | null }> = ({ name, character, profilePath }) => {
  const [imgErr, setImgErr] = useState(false)
  return (
    <div className="cast-card">
      {profilePath && !imgErr ? (
        <img className="cast-avatar" src={profilePath} alt={name} loading="lazy"
          onError={() => setImgErr(true)} />
      ) : (
        <div className="cast-avatar-placeholder">
          {name.charAt(0)}
        </div>
      )}
      <div className="cast-name">{name}</div>
      <div className="cast-character">{character}</div>
    </div>
  )
}

/* 推荐卡片 */
const RecCard: FC<{ title: string; year: string; posterPath: string | null; onClick: () => void }> = ({ title, year, posterPath, onClick }) => {
  const [err, setErr] = useState(false)
  return (
    <div className="rec-card" onClick={(e) => { e.stopPropagation(); onClick() }}>
      {posterPath && !err ? (
        <img className="rec-card-poster" src={posterPath} alt={title} loading="lazy"
          onError={() => setErr(true)} />
      ) : (
        <div className="rec-card-placeholder">{title}</div>
      )}
      <div className="rec-card-info">
        <div className="rec-card-title">{title}</div>
        <div className="rec-card-year">{year}</div>
      </div>
    </div>
  )
}

/* 流媒体信息徽标 */
const StreamBadges: FC<{ info: StreamInfo }> = ({ info }) => {
  const badges: { label: string; cls: string }[] = []

  if (info.video?.resolution) {
    const [w, h] = info.video.resolution.split('x').map(Number)
    let resLabel = info.video.resolution
    if (h >= 2160) resLabel = '4K'
    else if (h >= 1080) resLabel = '1080p'
    else if (h >= 720) resLabel = '720p'
    badges.push({ label: resLabel, cls: 'stream-badge-resolution' })
  }
  if (info.video?.codec) {
    badges.push({ label: info.video.codec.toUpperCase(), cls: 'stream-badge-codec' })
  }
  if (info.audio?.codec) {
    const audioLabel = info.audio.codec.toUpperCase() + (info.audio.channels ? ` ${info.audio.channels}ch` : '')
    badges.push({ label: audioLabel, cls: 'stream-badge-audio' })
  }

  if (badges.length === 0) return null

  return (
    <div className="stream-badges">
      {badges.map((b, i) => (
        <span key={i} className={`stream-badge ${b.cls}`}>{b.label}</span>
      ))}
    </div>
  )
}

const DetailModal: FC<Props> = ({ media, loading }) => {
  const { handleCloseDetail, handleSaveLocal, handleRemoveLocal, handleSelectRecommendation } = useDetail()
  const [backdropError, setBackdropError] = useState(false)
  const [posterError, setPosterError] = useState(false)
  const [playResult, setPlayResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCloseDetail() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleCloseDetail])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleOverlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) handleCloseDetail() }

  const handlePlay = async () => {
    if (!media.localId) { setPlayResult('该影片尚未保存在本地，请先收藏'); return }
    try {
      const res = await fetch(`/api/local/play/${media.localId}`, { method: 'POST' })
      const data = await res.json()
      setPlayResult(data.success ? '正在启动 PotPlayer...' : data.message)
    } catch { setPlayResult('播放失败') }
  }

  const handleSave = () => { setBusy(true); handleSaveLocal(media); setTimeout(() => setBusy(false), 800) }
  const handleRemove = () => { setShowRemoveConfirm(true) }

  const confirmRemove = (deleteFiles: boolean) => {
    setShowRemoveConfirm(false)
    setBusy(true)
    handleRemoveLocal(media, deleteFiles)
    setTimeout(() => setBusy(false), 800)
  }

  const hasBackdrop = media.backdropPath && !backdropError
  const hasPoster = media.posterPath && !posterError
  const cast = media.credits || []
  const recs = media.recommendations || []

  // NFO 本地数据
  const nfoRatings = media.nfoRatings || []
  const streamInfo = media.streamInfo
  const clearlogoPath = media.clearlogoPath

  const statusMap: Record<string, string> = {
    'Released': '已上映', 'Returning Series': '连载中', 'Ended': '已完结', 'In Production': '制作中',
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content" style={{ animation: 'modalEnter 0.35s var(--ease-dramatic)' }}>
        <button className="modal-close-btn" onClick={handleCloseDetail} style={{ zIndex: 3 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* 横幅 */}
        <div className="modal-backdrop-wrap">
          {hasBackdrop ? (
            <>
              <img className="modal-backdrop-img" src={media.backdropPath!} alt=""
                onError={() => setBackdropError(true)} />
              <div className="modal-backdrop-fade" />
            </>
          ) : hasPoster ? (
            <div className="modal-backdrop-fallback">
              <img className="modal-backdrop-fallback-img" src={media.posterPath!} alt={media.title} />
            </div>
          ) : (
            <div className="modal-backdrop-empty" />
          )}

          {/* Clearlogo */}
          {clearlogoPath && (
            <img className="modal-clearlogo" src={clearlogoPath} alt="" />
          )}
        </div>

        {/* 主体：海报 + 信息 */}
        <div className="modal-detail-body">
          {/* 海报 */}
          <div className={`modal-poster-wrap${hasBackdrop ? ' has-backdrop' : ''}`}>
            {hasPoster ? (
              <img className="modal-poster-img" src={media.posterPath!} alt={media.title} />
            ) : (
              <div className="modal-poster-placeholder">
                {media.title.charAt(0)}
              </div>
            )}
          </div>

          {/* 右侧信息 */}
          <div className="modal-info">
            <div>
              <h2 className="modal-detail-title">{media.title}</h2>
              {media.tagline && (
                <p className="modal-detail-tagline">{media.tagline}</p>
              )}
            </div>

            <div className="modal-detail-meta">
              {media.year && <span className="modal-year-badge">{media.year}</span>}
              <span>{media.mediaType === 'movie' ? '电影' : '剧集'}</span>
              {media.runtime ? <span>{Math.floor(media.runtime / 60)}h {media.runtime % 60}m</span> : null}
              {media.status ? <span className="modal-status-text">{statusMap[media.status] || media.status}</span> : null}
            </div>

            {media.genres.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {media.genres.map(g => (
                  <span key={g} className="modal-genre-tag">{g}</span>
                ))}
              </div>
            )}

            {/* TMDB/OMDb 评分 */}
            <RatingBadge ratings={media.ratings} />

            {/* NFO 本地评分 */}
            {nfoRatings.length > 0 && (
              <div className="rating-badges" style={{ marginTop: 6 }}>
                {nfoRatings.map((r: NfoRating, i: number) => (
                  <span key={i} className="rating-badge">
                    <span className="badge-icon" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', fontSize: 8, fontWeight: 800 }}>
                      {r.displayName.charAt(0)}
                    </span>
                    <span className="badge-score">{r.score}{r.maxScore === 100 ? '' : `/${r.maxScore}`}</span>
                  </span>
                ))}
              </div>
            )}

            {/* 流媒体信息 */}
            {streamInfo && <StreamBadges info={streamInfo} />}
          </div>
        </div>

        {/* 简介 */}
        {media.overview && (
          <div className="px-7 pt-3.5 pb-0">
            <p className="text-sm leading-[1.8] text-white/60 m-0 tracking-[0.005em]">{media.overview}</p>
          </div>
        )}

        {/* 本地路径 */}
        {media.isLocal && media.localPath && (
          <div className="px-7 pt-3.5 pb-0">
            <div className="py-2.5 px-3.5 bg-white/[0.03] rounded-lg text-xs text-[var(--text-tertiary)] font-[family-name:var(--font-mono)] break-all leading-relaxed border border-white/[0.04]">{media.localPath}</div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="modal-section modal-section-actions">
          <div className="modal-actions">
            <button className="modal-play-btn" onClick={handlePlay} disabled={busy}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              {media.isLocal ? '播放' : '未保存到本地'}
            </button>
            {!media.isLocal ? (
              <button className={`modal-action-btn save${busy ? ' busy' : ''}`} onClick={handleSave} disabled={busy}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                收藏
              </button>
            ) : (
              <button className={`modal-action-btn remove${busy ? ' busy' : ''}`} onClick={handleRemove} disabled={busy}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                已收藏
              </button>
            )}
            {playResult && (
              <span className={`modal-play-result${playResult.includes('失败') || playResult.includes('未') ? ' error' : ' success'}`}>
                {playResult}
              </span>
            )}
          </div>
        </div>

        {/* 演员 */}
        {(cast.length > 0 || loading) && (
          <div className="px-7 pt-[22px] pb-2">
            <h4 className="text-xs font-bold mb-3 text-[var(--text-secondary)] uppercase tracking-[0.8px]">演员阵容</h4>
            <div className="modal-cast-row">
              {loading && cast.length === 0
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="cast-card">
                      <div className="skeleton skeleton-cast" />
                      <div className="skeleton skeleton-cast-name" />
                      <div className="skeleton skeleton-cast-char" />
                    </div>
                  ))
                : cast.map(c => <CastCard key={c.id} name={c.name} character={c.character} profilePath={c.profilePath} />)
              }
            </div>
          </div>
        )}

        {/* 推荐 */}
        {(recs.length > 0 || loading) && (
          <div className="px-7 pt-2 pb-7">
            <h4 className="text-xs font-bold mb-3 text-[var(--text-secondary)] uppercase tracking-[0.8px]">类似推荐</h4>
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4 }}>
              {loading && recs.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{ flexShrink: 0, width: 140 }}>
                      <div className="skeleton skeleton-rec-poster" />
                      <div className="skeleton skeleton-rec-title" />
                      <div className="skeleton skeleton-rec-year" />
                    </div>
                  ))
                : recs.map(r => <RecCard key={r.id} title={r.title} year={r.year} posterPath={r.posterPath} onClick={() => handleSelectRecommendation(r)} />)
              }
            </div>
          </div>
        )}

        {/* 字幕管理 - 仅本地媒体显示 */}
        {media.isLocal && media.localId && (
          <div className="px-7 pb-3">
            <SubtitlePanel mediaId={media.localId} visible={true} />
          </div>
        )}

        {/* 轨道管理 - 仅本地媒体显示 */}
        {media.isLocal && media.localId && (
          <div className="px-7 pb-7">
            <TrackManager mediaId={media.localId} visible={true} />
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {showRemoveConfirm && (
        <div className="batch-confirm-backdrop" onClick={() => setShowRemoveConfirm(false)}>
          <div className="batch-confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="batch-confirm-title">确认删除</div>
            <div className="batch-confirm-msg">
              确定要从列表中移除「{media.title}」吗？请选择操作：
            </div>
            <div className="batch-confirm-actions">
              <button className="genre-pill" onClick={() => setShowRemoveConfirm(false)}>取消</button>
              <button className="batch-toolbar-delete" onClick={() => confirmRemove(false)}>仅从列表移除</button>
              <button className="batch-toolbar-delete" onClick={() => confirmRemove(true)}>删除文件和记录</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DetailModal
