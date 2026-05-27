import { useState, useCallback, type FC } from 'react'
import type { ApiRenameItem, ApiRenamePreview, ApiOrganizeResult } from '../types/api'
import { api } from '../api/client'

interface Props {
  visible: boolean
  onClose: () => void
  onComplete?: () => void
}

const PATTERNS = [
  { key: 'title-year', label: '标题 (年份)' },
  { key: 'year-title', label: '年份 - 标题' },
  { key: 'tmdb-title', label: '仅标题' },
]

const OrganizePanel: FC<Props> = ({ visible, onClose, onComplete }) => {
  const [pattern, setPattern] = useState('title-year')
  const [preview, setPreview] = useState<ApiRenamePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<ApiOrganizeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [lastOperationId, setLastOperationId] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState(false)

  const handlePreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPreview(null)
    setResult(null)
    try {
      const res = await api.organize.preview(undefined, pattern)
      setPreview(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : '预览失败')
    } finally {
      setLoading(false)
    }
  }, [pattern])

  const handleExecute = async () => {
    setShowConfirm(false)
    setExecuting(true)
    setError(null)
    try {
      const res = await api.organize.rename({ pattern })
      setResult(res)
      setLastOperationId(res.operationId)
      if (res.success && onComplete) onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : '执行失败')
    } finally {
      setExecuting(false)
    }
  }

  const handleRollback = async () => {
    if (!lastOperationId) return
    setRollingBack(true)
    try {
      const res = await api.organize.rollback(lastOperationId)
      if (res.success) {
        setResult(null)
        setLastOperationId(null)
        setPreview(null)
        if (onComplete) onComplete()
      } else {
        setError(res.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '回滚失败')
    } finally {
      setRollingBack(false)
    }
  }

  if (!visible) return null

  return (
    <div className="bg-bg-card rounded-card border border-white/[0.06] p-5 mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <h3 className="text-sm font-bold text-text-primary tracking-[-0.01em]">文件整理</h3>
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

      {/* Pattern selector */}
      <div className="mb-4">
        <label className="block text-[10px] font-semibold text-text-secondary mb-1.5 uppercase tracking-[0.6px]">命名模式</label>
        <div className="flex gap-1.5">
          {PATTERNS.map(p => (
            <button
              key={p.key}
              onClick={() => setPattern(p.key)}
              className={`py-1.5 px-3 text-xs font-medium rounded-lg border cursor-pointer transition-all ${
                pattern === p.key
                  ? 'bg-accent/10 border-accent/30 text-accent'
                  : 'bg-white/[0.04] border-white/[0.08] text-text-secondary hover:bg-white/[0.08]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 py-2.5 px-3.5 bg-[#ff453a]/10 border border-[#ff453a]/20 rounded-lg text-[#ff453a] text-xs font-medium">
          {error}
        </div>
      )}

      {/* Success result */}
      {result && (
        <div className="mb-4 py-2.5 px-3.5 bg-[#30d158]/10 border border-[#30d158]/20 rounded-lg text-[#30d158] text-xs font-medium">
          {result.message}
          {result.failed > 0 && (
            <span className="text-[#ff9f0a] ml-2">({result.failed} 个失败)</span>
          )}
        </div>
      )}

      {/* Preview table */}
      {preview && preview.items.length > 0 && (
        <div className="mb-4 overflow-x-auto max-h-[300px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-card">
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-2 px-2 text-text-tertiary font-semibold">当前路径</th>
                <th className="text-left py-2 px-2 text-text-tertiary font-semibold">新路径</th>
              </tr>
            </thead>
            <tbody>
              {preview.items.map((item, i) => (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-2 px-2 text-text-secondary font-mono text-[10px] max-w-[300px] truncate">{item.oldPath}</td>
                  <td className="py-2 px-2 text-text-primary font-mono text-[10px] max-w-[300px] truncate">{item.newPath}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.conflicts.length > 0 && (
            <div className="mt-2 py-2 px-3 bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 rounded-lg text-[#ff9f0a] text-[10px]">
              {preview.conflicts.length} 个冲突
            </div>
          )}
        </div>
      )}

      {/* Preview empty */}
      {preview && preview.items.length === 0 && (
        <div className="mb-4 py-6 text-center text-text-tertiary text-xs">
          没有需要整理的文件
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePreview}
          disabled={loading}
          className="py-2 px-5 bg-white/[0.06] text-text-secondary text-xs font-semibold rounded-[10px] border border-white/[0.08] cursor-pointer transition-all hover:bg-white/[0.1] hover:text-text-primary disabled:opacity-50 disabled:cursor-default"
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              预览中...
            </span>
          ) : '预览变更'}
        </button>

        {preview && preview.items.length > 0 && (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={executing}
            className="py-2 px-5 bg-gradient-to-br from-[#2997ff] via-[#40a8ff] to-[#64d2ff] text-white text-xs font-semibold rounded-[10px] border-none cursor-pointer transition-all duration-200 shadow-[0_2px_10px_rgba(41,151,255,0.3)] disabled:opacity-50 disabled:cursor-default"
          >
            {executing ? '执行中...' : '执行整理'}
          </button>
        )}

        {lastOperationId && result?.success && (
          <button
            onClick={handleRollback}
            disabled={rollingBack}
            className="py-2 px-4 bg-[#ff453a]/10 text-[#ff453a] text-xs font-semibold rounded-[10px] border border-[#ff453a]/20 cursor-pointer transition-all hover:bg-[#ff453a]/15 disabled:opacity-50 disabled:cursor-default"
          >
            {rollingBack ? '回滚中...' : '撤销操作'}
          </button>
        )}
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] animate-[fadeIn_0.15s_ease-out]" onClick={() => setShowConfirm(false)}>
          <div className="bg-bg-card border border-white/[0.1] rounded-2xl p-6 max-w-[360px] w-[90%] shadow-[0_16px_48px_rgba(0,0,0,0.5)] animate-[modalEnter_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="text-base font-semibold text-text-primary mb-2">确认执行</div>
            <div className="text-sm text-text-secondary leading-relaxed mb-5">
              确定要重命名 {preview?.items.length} 个文件吗？此操作可以通过撤销功能恢复。
            </div>
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="py-2 px-4 bg-white/[0.06] text-text-secondary text-xs font-medium rounded-lg border border-white/[0.08] cursor-pointer transition-all hover:bg-white/[0.1]"
              >
                取消
              </button>
              <button
                onClick={handleExecute}
                className="py-2 px-5 bg-gradient-to-br from-[#2997ff] via-[#40a8ff] to-[#64d2ff] text-white text-xs font-semibold rounded-lg border-none cursor-pointer transition-all shadow-[0_2px_10px_rgba(41,151,255,0.3)]"
              >
                确认执行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrganizePanel
