import { useState, type FC, useEffect } from 'react'
import type { MediaWithRatings, Recommendation } from '../types'
import RatingBadge from './RatingBadge'

interface Props {
  media: MediaWithRatings
  onClose: () => void
  onSaveLocal: () => void
  onRemoveLocal: () => void
  loading?: boolean
  onSelectRecommendation?: (rec: Recommendation) => void
}

/* 演员卡片 */
const CastCard: FC<{ name: string; character: string; profilePath: string | null }> = ({ name, character, profilePath }) => {
  const [imgErr, setImgErr] = useState(false)
  return (
    <div style={{ flexShrink: 0, width: 80, textAlign: 'center' }}>
      {profilePath && !imgErr ? (
        <img src={profilePath} alt={name} loading="lazy"
          onError={() => setImgErr(true)}
          style={{
            width: 64, height: 64, borderRadius: '50%', objectFit: 'cover',
            margin: '0 auto 6px', border: '2px solid rgba(255,255,255,0.08)',
            background: 'var(--bg-card)',
          }} />
      ) : (
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 6px',
          background: 'var(--accent-gradient)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 22, fontWeight: 700,
          opacity: 0.75,
        }}>
          {name.charAt(0)}
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2, color: 'var(--text-primary)' }}>{name}</div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.2 }}>{character}</div>
    </div>
  )
}

/* 推荐卡片 */
const RecCard: FC<{ title: string; year: string; posterPath: string | null; onClick: () => void }> = ({ title, year, posterPath, onClick }) => {
  const [err, setErr] = useState(false)
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        flexShrink: 0, width: 130, cursor: 'pointer', borderRadius: 10,
        overflow: 'hidden', background: 'var(--bg-card)',
        transition: 'transform 0.25s var(--ease-spring), box-shadow 0.25s var(--ease-spring)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-6px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {posterPath && !err ? (
        <img src={posterPath} alt={title} loading="lazy"
          style={{ width: 130, height: 195, objectFit: 'cover', display: 'block' }}
          onError={() => setErr(true)} />
      ) : (
        <div style={{
          width: 130, height: 195, background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-hover) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-tertiary)', fontSize: 12, padding: 12, textAlign: 'center',
        }}>
          {title}
        </div>
      )}
      <div style={{ padding: '8px 10px 10px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{year}</div>
      </div>
    </div>
  )
}

const DetailModal: FC<Props> = ({ media, onClose, onSaveLocal, onRemoveLocal, loading, onSelectRecommendation }) => {
  const [backdropError, setBackdropError] = useState(false)
  const [posterError, setPosterError] = useState(false)
  const [playResult, setPlayResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleOverlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() }

  const handlePlay = async () => {
    if (!media.localId) { setPlayResult('该影片尚未保存在本地，请先收藏'); return }
    try {
      const res = await fetch(`/api/local/play/${media.localId}`, { method: 'POST' })
      const data = await res.json()
      setPlayResult(data.success ? '正在启动 PotPlayer...' : data.message)
    } catch { setPlayResult('播放失败') }
  }

  const handleSave = () => { setBusy(true); onSaveLocal(); setTimeout(() => setBusy(false), 800) }
  const handleRemove = () => { setBusy(true); onRemoveLocal(); setTimeout(() => setBusy(false), 800) }
  const handleRecClick = (rec: Recommendation) => {
    onSelectRecommendation?.(rec)
  }

  const hasBackdrop = media.backdropPath && !backdropError
  const hasPoster = media.posterPath && !posterError
  const cast = media.credits || []
  const recs = media.recommendations || []

  const statusMap: Record<string, string> = {
    'Released': '已上映', 'Returning Series': '连载中', 'Ended': '已完结', 'In Production': '制作中',
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content" style={{ animation: 'modalEnter 0.35s var(--ease-out-expo)' }}>
        <button className="modal-close-btn" onClick={onClose} style={{ zIndex: 3 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* 横幅 */}
        <div style={{ position: 'relative' }}>
          {hasBackdrop ? (
            <>
              <img
                src={media.backdropPath!} alt=""
                style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block' }}
                onError={() => setBackdropError(true)}
              />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 100,
                background: 'linear-gradient(transparent, var(--bg-secondary))',
              }} />
            </>
          ) : hasPoster ? (
            <div style={{
              height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
            }}>
              <img src={media.posterPath!} alt={media.title}
                style={{ height: '80%', objectFit: 'contain', opacity: 0.6, filter: 'blur(20px)' }} />
            </div>
          ) : (
            <div style={{ height: 120, background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)' }} />
          )}
        </div>

        {/* 主体：海报 + 信息 */}
        <div style={{ padding: '20px 28px 8px', display: 'flex', gap: 22 }}>
          {/* 海报 */}
          <div style={{
            flexShrink: 0, width: 140, alignSelf: 'stretch',
            marginTop: hasBackdrop ? -48 : 0,
            position: 'relative', zIndex: 1,
          }}>
            {hasPoster ? (
              <img src={media.posterPath!} alt={media.title}
                style={{
                  width: 140, height: '100%', objectFit: 'cover',
                  borderRadius: 12,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                }} />
            ) : (
              <div style={{
                width: 140, height: '100%', minHeight: 200,
                background: 'var(--accent-gradient)',
                borderRadius: 12, opacity: 0.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 36, fontWeight: 800,
              }}>
                {media.title.charAt(0)}
              </div>
            )}
          </div>

          {/* 右侧信息 */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
            <div>
              <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4, lineHeight: 1.15 }}>{media.title}</h2>
              {media.tagline && (
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontStyle: 'italic', opacity: 0.8, margin: 0 }}>
                  {media.tagline}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
              {media.year && <span style={{ fontWeight: 700, color: 'var(--text-primary)', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 6 }}>{media.year}</span>}
              <span>{media.mediaType === 'movie' ? '电影' : '剧集'}</span>
              {media.runtime ? <span>{Math.floor(media.runtime / 60)}h {media.runtime % 60}m</span> : null}
              {media.status ? <span style={{ color: 'var(--accent)' }}>{statusMap[media.status] || media.status}</span> : null}
            </div>

            {media.genres.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {media.genres.map(g => (
                  <span key={g} style={{
                    fontSize: 12, fontWeight: 600,
                    color: 'var(--accent)',
                    background: 'rgba(0,113,227,0.1)',
                    padding: '5px 14px', borderRadius: 20,
                    border: '1px solid rgba(0,113,227,0.15)',
                  }}>{g}</span>
                ))}
              </div>
            )}

            <RatingBadge ratings={media.ratings} />
          </div>
        </div>

        {/* 简介 */}
        {media.overview && (
          <div style={{ padding: '14px 28px 0' }}>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{media.overview}</p>
          </div>
        )}

        {/* 本地路径 */}
        {media.isLocal && media.localPath && (
          <div style={{ padding: '12px 28px 0' }}>
            <div style={{
              padding: '10px 14px', background: 'rgba(255,255,255,0.04)',
              borderRadius: 8, fontSize: 12, color: 'var(--text-tertiary)',
              fontFamily: 'ui-monospace, "Cascadia Code", monospace',
              wordBreak: 'break-all', lineHeight: 1.5,
            }}>
              {media.localPath}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ padding: '18px 28px 0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="modal-play-btn" onClick={handlePlay} disabled={busy}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            {media.isLocal ? '播放' : '未保存到本地'}
          </button>
          {!media.isLocal ? (
            <button onClick={handleSave} disabled={busy} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 22px', background: 'transparent',
              color: busy ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 14, fontWeight: 500, borderRadius: 22,
              border: `1.5px solid ${busy ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}`,
              cursor: busy ? 'default' : 'pointer',
              transition: 'all 0.25s ease',
              opacity: busy ? 0.7 : 1,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              收藏
            </button>
          ) : (
            <button onClick={handleRemove} disabled={busy} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 22px', background: 'transparent',
              color: '#ff453a', fontSize: 14, fontWeight: 500, borderRadius: 22,
              border: '1.5px solid rgba(255,69,58,0.3)',
              cursor: busy ? 'default' : 'pointer',
              transition: 'all 0.25s ease', opacity: busy ? 0.7 : 1,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              已收藏
            </button>
          )}
          {playResult && (
            <span style={{
              fontSize: 13, fontWeight: 500,
              color: playResult.includes('失败') || playResult.includes('未') ? '#ff453a' : '#30d158',
            }}>
              {playResult}
            </span>
          )}
        </div>

        {/* 演员 */}
        {(cast.length > 0 || loading) && (
          <div style={{ padding: '22px 28px 8px' }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              演员阵容
            </h4>
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 6 }}>
              {loading && cast.length === 0
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ flexShrink: 0, width: 80, textAlign: 'center' }}>
                      <div className="skeleton" style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 6px' }} />
                      <div className="skeleton" style={{ width: 60, height: 10, borderRadius: 4, margin: '0 auto 4px' }} />
                      <div className="skeleton" style={{ width: 40, height: 8, borderRadius: 4, margin: '0 auto' }} />
                    </div>
                  ))
                : cast.map(c => <CastCard key={c.id} name={c.name} character={c.character} profilePath={c.profilePath} />)
              }
            </div>
          </div>
        )}

        {/* 推荐 */}
        {(recs.length > 0 || loading) && (
          <div style={{ padding: '8px 28px 28px' }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              类似推荐
            </h4>
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4 }}>
              {loading && recs.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{ flexShrink: 0, width: 130 }}>
                      <div className="skeleton" style={{ width: 130, height: 195, borderRadius: 10 }} />
                      <div className="skeleton" style={{ width: 100, height: 10, borderRadius: 4, marginTop: 8 }} />
                      <div className="skeleton" style={{ width: 50, height: 8, borderRadius: 4, marginTop: 4 }} />
                    </div>
                  ))
                : recs.map(r => <RecCard key={r.id} title={r.title} year={r.year} posterPath={r.posterPath} onClick={() => handleRecClick(r)} />)
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DetailModal
