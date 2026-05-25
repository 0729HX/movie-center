import { useState, useEffect, type FC } from 'react'

type Page = 'trending' | 'movies' | 'tv' | 'local' | 'settings'

interface Props {
  currentPage: Page
  onPageChange: (page: Page) => void
  onSearch: (q: string) => void
}

const Navbar: FC<Props> = ({ currentPage, onPageChange, onSearch }) => {
  const [searchText, setSearchText] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(searchText)
  }

  const navItems: { key: Page; label: string; icon: string }[] = [
    { key: 'trending', label: '首页', icon: '🏠' },
    { key: 'movies', label: '电影', icon: '🎬' },
    { key: 'tv', label: '剧集', icon: '📺' },
    { key: 'local', label: '本地影视', icon: '💾' },
    { key: 'settings', label: '设置', icon: '⚙' },
  ]

  return (
    <nav
      className="navbar"
      style={{
        background: scrolled
          ? 'rgba(0,0,0,0.95)'
          : 'rgba(0,0,0,0.78)',
        boxShadow: scrolled
          ? '0 1px 0 rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.4)'
          : '0 1px 0 rgba(255,255,255,0.04)',
        transition: 'background 0.35s ease, box-shadow 0.35s ease',
      }}
    >
      <div className="navbar-inner">
        {/* Logo */}
        <div
          className="nav-brand"
          onClick={() => onPageChange('trending')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28, height: 28,
            borderRadius: 8,
            background: 'var(--accent-gradient)',
            fontSize: 14,
          }}>
            🎬
          </span>
          Movie Center
        </div>

        {/* 导航链接 */}
        <div className="nav-links">
          {navItems.map(item => {
            const active = currentPage === item.key
            return (
              <button
                key={item.key}
                className={`nav-link ${active ? 'active' : ''}`}
                onClick={() => onPageChange(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span style={{
                  fontSize: 13,
                  opacity: active ? 1 : 0,
                  transform: active ? 'scale(1)' : 'scale(0.6)',
                  transition: 'all 0.3s var(--ease-spring)',
                  position: 'absolute',
                  marginLeft: -18,
                }}>
                  {item.icon}
                </span>
                <span style={{
                  transform: active ? 'translateX(6px)' : 'translateX(0)',
                  transition: 'transform 0.3s var(--ease-spring)',
                }}>
                  {item.label}
                </span>
              </button>
            )
          })}

          {/* 搜索框 */}
          <form
            className="nav-search"
            onSubmit={handleSearch}
            style={{
              transition: 'all 0.3s var(--ease-spring)',
              background: searchFocused
                ? 'rgba(255,255,255,0.12)'
                : 'rgba(255,255,255,0.06)',
              borderColor: searchFocused
                ? 'rgba(0,113,227,0.5)'
                : 'rgba(255,255,255,0.06)',
            }}
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
              onBlur={() => setSearchFocused(false)}
              style={{
                width: searchFocused ? 200 : 150,
                transition: 'width 0.3s var(--ease-spring)',
              }}
            />
            {searchText && (
              <button
                type="button"
                onClick={() => { setSearchText(''); onSearch('') }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            )}
          </form>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
