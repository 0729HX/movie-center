import { useState, useEffect, useRef, useCallback, type FC } from 'react'
import type { ApiScrapePreview, ApiOperationProgress } from '../types/api'
import { api } from '../api/client'

interface Props {
  visible: boolean
  onClose: () => void
  onComplete?: () => void
}

const MATCH_SCORE_COLORS: Record<string, string> = {
  high: 'bg-[#30d158]/10 text-[#30d158] border-[#30d158]/20',
  medium: 'bg-[#ff9f0a]/10 text-[#ff9f0a] border-[#ff9f0a]/20',
  low: 'bg-white/[0.05] text-text-secondary border-white/[0.08]',
  none: 'bg-[#ff453a]/10 text-[#ff453a] border-[#ff453a]/20',
}

const MATCH_SCORE_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
  none: '无',
}

const MetadataScrapePanel: FC<Props> = ({ visible, onClose, onComplete }) => {
  const [scraping, setScraping] = useState(false)
  const [progress, setProgress] = useState<ApiOperationProgress | null>(null)
  const [operationId, setOperationId] = useState<string | null>(null)
  const [previewItems, setPreviewItems] = useState<ApiScrapePreview[]>([])
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  const startScrape = async () => {
    setScraping(true)
    setError(null)
    setPreviewItems([])
    try {
      const result = await api.metadata.scrape({})
      setOperationId(result.operationId)

      pollRef.current = setInterval(async () => {
        try {
          const p = await api.metadata.status(result.operationId)
          setProgress(p)
          if (p.status === 'completed' || p.status === 'failed') {
            stopPolling()
            setScraping(false)
            if (p.status === 'completed') {
              // Load preview of all items
              loadPreviews()
            } else {
              setError(p.error || '抓取失败')
            }
          }
        } catch {
          // Poll error - might be expired
          stopPolling()
          setScraping(false)
        }
      }, 2000)
    } catch (err) {
      setScraping(false)
      setError(err instanceof Error ? err.message : '启动抓取失败')
    }
  }

  const loadPreviews = async () => {
    // We don't know individual IDs, but the operation result may contain them
    // For now, just show a completion message
  }

  const handlePreviewSingle = async (id: number) => {
    try {
      const preview = await api.metadata.preview(id)
      setPreviewItems(prev => {
        const idx = prev.findIndex(p => p.id === id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = preview
          return next
        }
        return [...prev, preview]
      })
    } catch {
      // ignore individual preview errors
    }
  }

  if (!visible) return null

  const pct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <div className="bg-bg-card rounded-card border border-white/[0.06] p-5 mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </span>
          <h3 className="text-sm font-bold text-text-primary tracking-[-0.01em]">元数据抓取</h3>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-white/[0.1] transition-all text-xs"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress */}
      {scraping && progress && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
            <span>{progress.description || '正在抓取...'}</span>
            <span>{progress.current}/{progress.total} ({pct}%)</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#2997ff] to-[#64d2ff] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          {progress.message && (
            <p className="text-[11px] text-text-tertiary mt-1.5 font-mono">{progress.message}</p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 py-2.5 px-3.5 bg-[#ff453a]/10 border border-[#ff453a]/20 rounded-lg text-[#ff453a] text-xs font-medium">
          {error}
        </div>
      )}

      {/* Completion message */}
      {progress?.status === 'completed' && !scraping && (
        <div className="mb-4 py-2.5 px-3.5 bg-[#30d158]/10 border border-[#30d158]/20 rounded-lg text-[#30d158] text-xs font-medium">
          抓取完成: {progress.description}
        </div>
      )}

      {/* Preview table */}
      {previewItems.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-2 px-2 text-text-tertiary font-semibold">标题</th>
                <th className="text-left py-2 px-2 text-text-tertiary font-semibold">年份</th>
                <th className="text-left py-2 px-2 text-text-tertiary font-semibold">匹配</th>
                <th className="text-left py-2 px-2 text-text-tertiary font-semibold">TMDB ID</th>
                <th className="text-left py-2 px-2 text-text-tertiary font-semibold">发现标题</th>
              </tr>
            </thead>
            <tbody>
              {previewItems.map(item => (
                <tr key={item.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-2 px-2 text-text-primary font-medium max-w-[200px] truncate">{item.title}</td>
                  <td className="py-2 px-2 text-text-secondary">{item.year || '-'}</td>
                  <td className="py-2 px-2">
                    <span className={`inline-block py-0.5 px-2 rounded-full text-[10px] font-semibold border ${MATCH_SCORE_COLORS[item.matchScore]}`}>
                      {MATCH_SCORE_LABELS[item.matchScore]}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-text-secondary font-mono">{item.foundTmdbId || '-'}</td>
                  <td className="py-2 px-2 text-text-secondary max-w-[200px] truncate">{item.foundTitle || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={startScrape}
          disabled={scraping}
          className="py-2 px-5 bg-gradient-to-br from-[#2997ff] via-[#40a8ff] to-[#64d2ff] text-white text-xs font-semibold rounded-[10px] border-none cursor-pointer transition-all duration-200 shadow-[0_2px_10px_rgba(41,151,255,0.3)] disabled:opacity-50 disabled:cursor-default disabled:shadow-none disabled:transform-none"
        >
          {scraping ? (
            <span className="flex items-center gap-1.5">
              <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              抓取中...
            </span>
          ) : '开始抓取'}
        </button>
        {progress?.status === 'completed' && onComplete && (
          <button
            onClick={onComplete}
            className="py-2 px-4 bg-white/[0.06] text-text-secondary text-xs font-medium rounded-[10px] border border-white/[0.08] cursor-pointer transition-all hover:bg-white/[0.1] hover:text-text-primary"
          >
            刷新列表
          </button>
        )}
      </div>
    </div>
  )
}

export default MetadataScrapePanel
