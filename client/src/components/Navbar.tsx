import { useState, useEffect, useCallback, useRef, type FC } from 'react'
import { useLocation } from 'react-router-dom'

interface Props {
  onSearch: (q: string) => void
  onPageChange: (page: string) => void
}

const navItems = [
  { path: '/', label: '首页', icon: '🏠' },
  { path: '/movies', label: '电影', icon: '🎬' },
  { path: '/tv', label: '剧集', icon: '📺' },
  { path: '/local', label: '本地影视', icon: '💾' },
  { path: '/settings', label: '设置', icon: '⚙' },
]

const SEARCH_HISTORY_KEY = 'search_history'
const MAX_HISTORY = 5

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]') } catch { return [] }
}

function saveHistory(items: string[]) {
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items))
}

const Navbar: FC<Props> = ({ onSearch, onPageChange }) => {
  const [searchText, setSearchText] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [history, setHistory] = useState<string[]>(loadHistory)
  const location = useLocation()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // 防抖搜索
  useEffect(() => {
    if (!searchText.trim()) return
    debounceRef.current = setTimeout(() => {
      onSearch(searchText)
      addToHistory(searchText)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchText]) // eslint-disable-line react-hooks/exhaustive-deps

  const addToHistory = useCallback((query: string) => {
    if (!query.trim()) return
    setHistory(prev => {
      const next = [query, ...prev.filter(h => h !== query)].slice(0, MAX_HISTORY)
      saveHistory(next)
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    localStorage.removeItem(SEARCH_HISTORY_KEY)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchText.trim()) return
    clearTimeout(debounceRef.current)
    onSearch(searchText)
    addToHistory(searchText)
    setSearchFocused(false)
  }

  const handleHistoryClick = (query: string) => {
    setSearchText(query)
    onSearch(query)
    setSearchFocused(false)
  }

  const currentPath = location.pathname
  const showDropdown = searchFocused && !searchText && history.length > 0

  return (
    <nav className={`navbar${scrolled ? ' scrolled' : ''}`}>
      <div className="navbar-inner">
        {/* Logo */}
        <div
          className="nav-brand"
          onClick={() => onPageChange('trending')}
        >
          <span className="nav-brand-icon">🎬</span>
          Movie Center
        </div>

        {/* 导航链接 */}
        <div className="nav-links">
          {navItems.map(item => {
            const active = currentPath === item.path
            return (
              <button
                key={item.path}
                className={`nav-link ${active ? 'active' : ''}`}
                onClick={() => onPageChange(item.path === '/' ? 'trending' : item.path.slice(1))}
              >
                <span className="nav-link-icon">{item.icon}</span>
                <span className="nav-link-label">{item.label}</span>
              </button>
            )
          })}

          {/* 搜索框 */}
          <form
            className={`nav-search${searchFocused ? ' focused' : ''}`}
            onSubmit={handleSubmit}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="搜索影视..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            />
            {searchText && (
              <button
                type="button"
                className="nav-search-clear"
                onClick={() => { setSearchText(''); onSearch('') }}
              >
                ✕
              </button>
            )}

            {/* 搜索历史下拉 */}
            {showDropdown && (
              <div className="nav-search-dropdown">
                {history.map((query, i) => (
                  <button
                    key={`${query}-${i}`}
                    className="nav-search-history-item"
                    type="button"
                    onClick={() => handleHistoryClick(query)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {query}
                  </button>
                ))}
                <button
                  className="nav-search-history-clear"
                  type="button"
                  onClick={clearHistory}
                >
                  清除搜索历史
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
