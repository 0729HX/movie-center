import { useState, useEffect, useCallback, type FC } from 'react'
import type { ApiSubtitleSearchResult, ApiSubtitleLanguage } from '../types/api'
import { api } from '../api/client'

interface Props {
  mediaId: number
  visible: boolean
}

const SubtitlePanel: FC<Props> = ({ mediaId, visible }) => {
  const [languages, setLanguages] = useState<ApiSubtitleLanguage[]>([])
  const [selectedLang, setSelectedLang] = useState('zh')
  const [results, setResults] = useState<ApiSubtitleSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [downloadResult, setDownloadResult] = useState<{ success: boolean; message: string } | null>(null)
  const [configured, setConfigured] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!visible) return
    api.subtitles.languages().then(res => {
      setLanguages(res.languages)
      setConfigured(res.configured)
    }).catch(() => setConfigured(false))
  }, [visible])

  const handleSearch = useCallback(async () => {
    setSearching(true)
    setDownloadResult(null)
    try {
      const res = await api.subtitles.search(mediaId, selectedLang)
      setResults(res.results)
      setConfigured(res.configured)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [mediaId, selectedLang])

  const handleDownload = async (subtitleId: number) => {
    setDownloading(subtitleId)
    setDownloadResult(null)
    try {
      const res = await api.subtitles.download({ mediaId, subtitleId })
      setDownloadResult({ success: res.success, message: res.message })
    } catch (err) {
      setDownloadResult({ success: false, message: err instanceof Error ? err.message : '下载失败' })
    } finally {
      setDownloading(null)
    }
  }

  if (!visible) return null

  return (
    <div className="bg-bg-card rounded-card border border-white/[0.06]">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-sm font-bold text-text-primary">字幕管理</span>
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
          {/* API key warning */}
          {!configured && (
            <div className="mt-3 py-2 px-3 bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 rounded-lg text-[#ff9f0a] text-xs">
              请在设置中配置 OpenSubtitles API Key
            </div>
          )}

          {/* Search controls */}
          <div className="flex items-center gap-2 mt-3">
            <select
              value={selectedLang}
              onChange={e => setSelectedLang(e.target.value)}
              className="py-1.5 px-2.5 bg-bg-card border border-white/[0.08] rounded-[8px] text-text-primary text-xs outline-none appearance-none cursor-pointer min-w-[100px]"
            >
              {languages.length > 0
                ? languages.map(l => (
                    <option key={l.code} value={l.code}>{l.localName}</option>
                  ))
                : <>
                    <option value="zh">中文(简体)</option>
                    <option value="en">English</option>
                    <option value="ja">日本語</option>
                    <option value="ko">한국어</option>
                  </>
              }
            </select>
            <button
              onClick={handleSearch}
              disabled={searching || !configured}
              className="py-1.5 px-4 bg-gradient-to-br from-[#2997ff] via-[#40a8ff] to-[#64d2ff] text-white text-xs font-semibold rounded-[8px] border-none cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-default"
            >
              {searching ? (
                <span className="flex items-center gap-1">
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  搜索中
                </span>
              ) : '搜索字幕'}
            </button>
          </div>

          {/* Download result */}
          {downloadResult && (
            <div className={`mt-2.5 py-2 px-3 rounded-lg text-xs font-medium ${
              downloadResult.success
                ? 'bg-[#30d158]/10 border border-[#30d158]/20 text-[#30d158]'
                : 'bg-[#ff453a]/10 border border-[#ff453a]/20 text-[#ff453a]'
            }`}>
              {downloadResult.message}
            </div>
          )}

          {/* Results list */}
          {results.length > 0 && (
            <div className="mt-3 space-y-1.5 max-h-[280px] overflow-y-auto">
              {results.map(sub => (
                <div
                  key={sub.id}
                  className="flex items-center gap-3 py-2 px-3 bg-white/[0.02] rounded-lg border border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-text-primary font-medium truncate">{sub.filename}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-text-tertiary">{sub.language}</span>
                      <span className="text-[10px] text-text-tertiary">{sub.format}</span>
                      <span className="text-[10px] text-text-tertiary">{sub.downloadCount} 次下载</span>
                      {sub.rating > 0 && (
                        <span className="text-[10px] text-[#ff9f0a]">{sub.rating.toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(sub.id)}
                    disabled={downloading === sub.id}
                    className="shrink-0 py-1 px-3 bg-white/[0.06] text-text-secondary text-[10px] font-semibold rounded-md border border-white/[0.08] cursor-pointer transition-all hover:bg-white/[0.1] hover:text-text-primary disabled:opacity-50 disabled:cursor-default"
                  >
                    {downloading === sub.id ? '下载中...' : '下载'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!searching && results.length === 0 && configured && (
            <div className="mt-3 py-6 text-center text-text-tertiary text-xs">
              点击「搜索字幕」查找可用字幕
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SubtitlePanel
