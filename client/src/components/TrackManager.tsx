import { useState, useEffect, useCallback, type FC } from 'react'
import type { ApiMediaTrack, ApiTrackHealthStatus } from '../types/api'
import { api } from '../api/client'

interface Props {
  mediaId: number
  visible: boolean
}

const TRACK_TYPE_ICONS: Record<string, string> = {
  video: 'V',
  audio: 'A',
  subtitle: 'S',
}

const TRACK_TYPE_COLORS: Record<string, string> = {
  video: 'bg-accent/10 text-accent border-accent/20',
  audio: 'bg-[#30d158]/10 text-[#30d158] border-[#30d158]/20',
  subtitle: 'bg-[#ff9f0a]/10 text-[#ff9f0a] border-[#ff9f0a]/20',
}

const TrackManager: FC<Props> = ({ mediaId, visible }) => {
  const [health, setHealth] = useState<ApiTrackHealthStatus | null>(null)
  const [tracks, setTracks] = useState<ApiMediaTrack[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; savedBytes?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Check ffmpeg health on mount
  useEffect(() => {
    if (!visible) return
    api.tracks.health().then(setHealth).catch(() => setHealth({ available: false }))
  }, [visible])

  const loadTracks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.tracks.list(mediaId)
      setTracks(res.tracks)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载轨道失败')
    } finally {
      setLoading(false)
    }
  }, [mediaId])

  useEffect(() => {
    if (expanded && health?.available && tracks.length === 0) {
      loadTracks()
    }
  }, [expanded, health, tracks.length, loadTracks])

  const toggleSelect = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
    setResult(null)
  }

  const handleRemove = async () => {
    setShowConfirm(false)
    setRemoving(true)
    setError(null)
    try {
      const res = await api.tracks.remove({ mediaId, trackIndices: Array.from(selected) })
      setResult({
        success: res.success,
        message: res.message,
        savedBytes: res.originalSize > 0 ? res.originalSize - res.newSize : undefined,
      })
      setSelected(new Set())
      // Reload tracks
      loadTracks()
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除轨道失败')
    } finally {
      setRemoving(false)
    }
  }

  if (!visible) return null

  const formatSize = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${bytes} B`
  }

  return (
    <div className="bg-bg-card rounded-card border border-white/[0.06]">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
          <span className="text-sm font-bold text-text-primary">轨道管理</span>
          {/* ffmpeg status indicator */}
          {health && (
            <span className={`inline-block w-2 h-2 rounded-full ${health.available ? 'bg-[#30d158] shadow-[0_0_6px_rgba(48,209,88,0.4)]' : 'bg-[#ff453a]'}`} />
          )}
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-text-tertiary transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/[0.04]">
          {/* ffmpeg not available */}
          {health && !health.available && (
            <div className="mt-3 py-2.5 px-3.5 bg-[#ff453a]/10 border border-[#ff453a]/20 rounded-lg text-[#ff453a] text-xs">
              ffmpeg 未安装。请安装 ffmpeg 并重启服务器。
              {health.error && <div className="mt-1 text-[10px] opacity-70 font-mono">{health.error}</div>}
            </div>
          )}

          {/* ffmpeg available + version */}
          {health?.available && health.version && (
            <div className="mt-2 text-[10px] text-text-tertiary font-mono">
              ffmpeg {health.version}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 py-2.5 px-3.5 bg-[#ff453a]/10 border border-[#ff453a]/20 rounded-lg text-[#ff453a] text-xs font-medium">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`mt-3 py-2.5 px-3.5 rounded-lg text-xs font-medium ${
              result.success
                ? 'bg-[#30d158]/10 border border-[#30d158]/20 text-[#30d158]'
                : 'bg-[#ff453a]/10 border border-[#ff453a]/20 text-[#ff453a]'
            }`}>
              {result.message}
              {result.savedBytes !== undefined && result.savedBytes > 0 && (
                <span className="ml-1">节省 {formatSize(result.savedBytes)}</span>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="mt-3 py-4 text-center text-text-tertiary text-xs">
              <svg className="animate-spin inline-block mr-1.5" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              加载轨道信息...
            </div>
          )}

          {/* Track list */}
          {!loading && tracks.length > 0 && health?.available && (
            <div className="mt-3 space-y-1">
              {tracks.map(track => (
                <div
                  key={track.index}
                  onClick={() => toggleSelect(track.index)}
                  className={`flex items-center gap-3 py-2 px-3 rounded-lg border cursor-pointer transition-all ${
                    selected.has(track.index)
                      ? 'bg-accent/10 border-accent/25'
                      : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04]'
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`w-4 h-4 rounded-[4px] border-2 flex items-center justify-center shrink-0 transition-colors ${
                    selected.has(track.index)
                      ? 'bg-accent border-accent'
                      : 'border-white/30 bg-transparent'
                  }`}>
                    {selected.has(track.index) && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>

                  {/* Type badge */}
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold border ${TRACK_TYPE_COLORS[track.type]}`}>
                    {TRACK_TYPE_ICONS[track.type]}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-text-primary font-medium">
                      {track.title || `Track #${track.index}`}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-text-tertiary font-mono">{track.codec}</span>
                      {track.language && <span className="text-[10px] text-text-tertiary">{track.language}</span>}
                      {track.channels && <span className="text-[10px] text-text-tertiary">{track.channels}ch</span>}
                      {track.width && track.height && (
                        <span className="text-[10px] text-text-tertiary">{track.width}x{track.height}</span>
                      )}
                      {track.default && (
                        <span className="text-[10px] text-accent font-semibold">默认</span>
                      )}
                      {track.forced && (
                        <span className="text-[10px] text-[#ff9f0a] font-semibold">强制</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && tracks.length === 0 && health?.available && (
            <div className="mt-3 py-6 text-center text-text-tertiary text-xs">
              未找到轨道信息
            </div>
          )}

          {/* Remove button */}
          {selected.size > 0 && health?.available && (
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => setShowConfirm(true)}
                disabled={removing}
                className="py-2 px-5 bg-gradient-to-br from-[#ff453a] to-[#ff6b5a] text-white text-xs font-semibold rounded-[10px] border-none cursor-pointer transition-all duration-200 shadow-[0_2px_8px_rgba(255,59,48,0.3)] disabled:opacity-50 disabled:cursor-default"
              >
                {removing ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    处理中...
                  </span>
                ) : `移除 ${selected.size} 个轨道`}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="py-2 px-3 text-text-tertiary text-xs cursor-pointer hover:text-text-primary transition-colors"
              >
                取消选择
              </button>
            </div>
          )}

          {/* Confirmation dialog */}
          {showConfirm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] animate-[fadeIn_0.15s_ease-out]" onClick={() => setShowConfirm(false)}>
              <div className="bg-bg-card border border-white/[0.1] rounded-2xl p-6 max-w-[360px] w-[90%] shadow-[0_16px_48px_rgba(0,0,0,0.5)] animate-[modalEnter_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
                <div className="text-base font-semibold text-text-primary mb-2">确认移除轨道</div>
                <div className="text-sm text-text-secondary leading-relaxed mb-2">
                  确定要移除以下 {selected.size} 个轨道吗？
                </div>
                <div className="mb-4 space-y-1">
                  {tracks.filter(t => selected.has(t.index)).map(t => (
                    <div key={t.index} className="text-xs text-text-tertiary font-mono py-0.5">
                      #{t.index} {TRACK_TYPE_ICONS[t.type]} {t.title || t.codec} ({t.language || '未知语言'})
                    </div>
                  ))}
                </div>
                <div className="text-xs text-[#ff9f0a] mb-4">
                  原文件将被备份。操作完成后可查看文件大小变化。
                </div>
                <div className="flex gap-2.5 justify-end">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="py-2 px-4 bg-white/[0.06] text-text-secondary text-xs font-medium rounded-lg border border-white/[0.08] cursor-pointer transition-all hover:bg-white/[0.1]"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleRemove}
                    className="py-2 px-5 bg-gradient-to-br from-[#ff453a] to-[#ff6b5a] text-white text-xs font-semibold rounded-lg border-none cursor-pointer transition-all shadow-[0_2px_8px_rgba(255,59,48,0.3)]"
                  >
                    确认移除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TrackManager
