import { useState, useEffect, useCallback, useRef } from 'react'
import Navbar from './components/Navbar'
import HeroBanner from './components/HeroBanner'
import PosterWall from './components/PosterWall'
import PosterCard from './components/PosterCard'
import LocalMediaView from './components/LocalMediaView'
import SettingsPanel from './components/SettingsPanel'
import DetailModal from './components/DetailModal'
import type { MediaWithRatings, LocalMedia, Recommendation } from './types'

type Page = 'trending' | 'movies' | 'tv' | 'local' | 'settings'

const API_BASE = '/api'
const CACHE_TTL = 5 * 60 * 1000 // 客户端缓存 5 分钟，超时后才重新请求

export default function App() {
  const lastFetchRef = useRef(0)
  const [page, setPage] = useState<Page>('trending')
  const [trending, setTrending] = useState<MediaWithRatings[]>([])
  const [movies, setMovies] = useState<MediaWithRatings[]>([])
  const [tvShows, setTvShows] = useState<MediaWithRatings[]>([])
  const [localMedia, setLocalMedia] = useState<LocalMedia[]>([])
  const [selectedMedia, setSelectedMedia] = useState<MediaWithRatings | null>(null)

  // 分页状态
  const [moviePage, setMoviePage] = useState(1)
  const [tvPage, setTvPage] = useState(1)
  const [movieTotalPages, setMovieTotalPages] = useState(1)
  const [tvTotalPages, setTvTotalPages] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)

  // 分类筛选
  const [movieGenre, setMovieGenre] = useState('')
  const [tvGenre, setTvGenre] = useState('')
  const [movieGenres, setMovieGenres] = useState<{ id: number; name: string }[]>([])
  const [tvGenres, setTvGenres] = useState<{ id: number; name: string }[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)

  // 获取数据
  const fetchTrending = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trending`)
      const data = await res.json()
      setTrending(data.items || [])
    } catch (err: any) {
      console.error('fetchTrending 失败:', err.message)
      setTrending([])
    }
  }, [])

  const fetchMovies = useCallback(async (pageNum = 1, genre = '') => {
    try {
      const params = new URLSearchParams({ page: String(pageNum) })
      if (genre) params.set('genre', genre)
      const res = await fetch(`${API_BASE}/movies?${params}`)
      const data = await res.json()
      if (pageNum === 1) {
        setMovies(data.items || [])
      } else {
        setMovies(prev => [...prev, ...(data.items || [])])
      }
      setMovieTotalPages(data.totalPages || 1)
    } catch (err: any) {
      console.error('fetchMovies 失败:', err.message)
      if (pageNum === 1) setMovies([])
    }
  }, [])

  const fetchTv = useCallback(async (pageNum = 1, genre = '') => {
    try {
      const params = new URLSearchParams({ page: String(pageNum) })
      if (genre) params.set('genre', genre)
      const res = await fetch(`${API_BASE}/tv?${params}`)
      const data = await res.json()
      if (pageNum === 1) {
        setTvShows(data.items || [])
      } else {
        setTvShows(prev => [...prev, ...(data.items || [])])
      }
      setTvTotalPages(data.totalPages || 1)
    } catch (err: any) {
      console.error('fetchTv 失败:', err.message)
      if (pageNum === 1) setTvShows([])
    }
  }, [])

  const fetchGenres = useCallback(async () => {
    try {
      const [mRes, tRes] = await Promise.all([
        fetch(`${API_BASE}/movies/genres`),
        fetch(`${API_BASE}/tv/genres`),
      ])
      const mData = await mRes.json()
      const tData = await tRes.json()
      setMovieGenres(mData.genres || [])
      setTvGenres(tData.genres || [])
    } catch {}
  }, [])

  const fetchLocal = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/local`)
      const data = await res.json()
      setLocalMedia(data.items || [])
    } catch (err: any) {
      console.error('fetchLocal 失败:', err.message)
      setLocalMedia([])
    }
  }, [])

  const loadAll = useCallback(async (force = false) => {
    // 客户端缓存：5 分钟内未过期且非强制刷新，跳过请求
    const now = Date.now()
    if (!force && lastFetchRef.current > 0 && (now - lastFetchRef.current) < CACHE_TTL) {
      return
    }

    setLoading(true)
    setError(null)
    setMoviePage(1)
    setTvPage(1)
    try {
      const results = await Promise.allSettled([fetchTrending(), fetchMovies(1), fetchTv(1), fetchLocal(), fetchGenres()])
      const allFailed = results.every(r => r.status === 'rejected')
      if (allFailed) {
        setError('无法连接到服务器，请确认后端已启动（localhost:3001）')
      } else {
        lastFetchRef.current = now
      }
    } catch (err: any) {
      console.error('loadAll 异常:', err.message)
      setError('加载失败，请刷新页面重试')
    } finally {
      setLoading(false)
    }
  }, [fetchTrending, fetchMovies, fetchTv, fetchLocal, fetchGenres])

  useEffect(() => { loadAll() }, [loadAll])

  // 电影/剧集加载更多
  const loadMoreMovies = async () => {
    const nextPage = moviePage + 1
    setLoadingMore(true)
    setMoviePage(nextPage)
    await fetchMovies(nextPage, movieGenre)
    setLoadingMore(false)
  }

  const loadMoreTv = async () => {
    const nextPage = tvPage + 1
    setLoadingMore(true)
    setTvPage(nextPage)
    await fetchTv(nextPage, tvGenre)
    setLoadingMore(false)
  }

  // 切换分类
  const switchMovieGenre = (genreId: string) => {
    setMovieGenre(genreId)
    setMoviePage(1)
    setLoading(true)
    fetchMovies(1, genreId).then(() => setLoading(false))
  }

  const switchTvGenre = (genreId: string) => {
    setTvGenre(genreId)
    setTvPage(1)
    setLoading(true)
    fetchTv(1, genreId).then(() => setLoading(false))
  }

  // 搜索
  const handleSearch = async (q: string) => {
    setSearchQuery(q)
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setTrending([])
      setMovies(data.items || [])
      setTvShows([])
    } catch (err: any) {
      console.error('搜索失败:', err.message)
      setError('搜索请求失败，请检查网络连接')
      setMovies([])
    } finally {
      setLoading(false)
    }
  }

  const handleClearSearch = () => {
    setSearchQuery('')
  }

  // 点击海报查看详情 — 立即弹窗（列表数据），后台加载完整详情
  const handleSelect = async (item: MediaWithRatings) => {
    // 立即用列表数据打开弹窗，0ms 延迟
    setSelectedMedia(item)

    if (item.isLocal) {
      // 后台获取完整详情：有 TMDB ID 直接取，没有则服务器端会按标题搜索匹配
      if (item.localId) {
        setDetailLoading(true)
        try {
          const res = await fetch(`${API_BASE}/local/detail/${item.localId}`)
          if (res.ok) {
            const detail = await res.json()
            setSelectedMedia(detail)
            // TMDB 匹配成功且之前未匹配时，刷新本地列表更新 tmdbId
            if (detail.tmdbId > 0 && !item.tmdbId) fetchLocal()
          }
        } catch { /* 列表数据兜底 */ }
        setDetailLoading(false)
      }
      return
    }

    // 后台获取完整详情（演员、推荐、全量评分）
    setDetailLoading(true)
    try {
      const res = await fetch(`${API_BASE}/detail/${item.mediaType}/${item.tmdbId}`)
      const detail = await res.json()
      setSelectedMedia(detail)
    } catch {
      // 列表数据已经显示，静默处理
    }
    setDetailLoading(false)
  }

  // 保存到本地
  const handleSaveLocal = async (item: MediaWithRatings) => {
    // 乐观更新弹窗状态
    setSelectedMedia(prev => prev && prev.tmdbId === item.tmdbId ? { ...prev, isLocal: true } : prev)
    await fetch(`${API_BASE}/local/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tmdb_id: item.tmdbId,
        media_type: item.mediaType,
        title: item.title,
      }),
    })
    fetchLocal()
  }

  // 取消收藏
  const handleRemoveLocal = async (item: MediaWithRatings) => {
    const id = item.localId || item.id
    if (!id) return
    // 乐观更新弹窗状态
    setSelectedMedia(prev => prev && (prev.localId === id || prev.tmdbId === item.tmdbId) ? { ...prev, isLocal: false, localId: undefined, localPath: undefined } : prev)
    await fetch(`${API_BASE}/local/${id}`, { method: 'DELETE' })
    fetchLocal()
  }

  const handleCloseDetail = () => { setSelectedMedia(null); setDetailLoading(false) }

  // 推荐卡片点击 → 构造 MediaWithRatings 走当前系统详情弹窗
  const handleSelectRecommendation = (rec: Recommendation) => {
    const item: MediaWithRatings = {
      id: rec.id,
      tmdbId: rec.id,
      title: rec.title,
      overview: '',
      posterPath: rec.posterPath,
      backdropPath: null,
      year: rec.year,
      mediaType: rec.mediaType,
      ratings: [],
      genres: [],
      status: '',
      tagline: '',
      isLocal: false,
    }
    handleSelect(item)
  }

  return (
    <>
      <Navbar
        currentPage={page}
        onPageChange={(p) => { setSearchQuery(''); setPage(p) }}
        onSearch={handleSearch}
      />

      <main className="main-content">
        {error && (
          <div style={{
            background: 'rgba(255,59,48,0.12)',
            border: '1px solid rgba(255,59,48,0.3)',
            borderRadius: 12,
            margin: '16px var(--content-padding)',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <span style={{ color: '#ff453a', fontSize: 14, fontWeight: 500 }}>⚠ {error}</span>
            <button
              onClick={() => loadAll(true)}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#f5f5f7',
                border: 'none',
                padding: '6px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              重试
            </button>
          </div>
        )}
        {page === 'trending' && (
          <div key="trending" className="page-transition">
            {loading && (
              <div className="loading-hint">正在加载最新影视数据…</div>
            )}
            <HeroBanner items={trending.slice(0, 8)} onSelect={handleSelect} />

            {/* 热门电影 — 8 项网格 + 更多按钮 */}
            <section className="category-section" style={{ paddingTop: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 var(--content-padding)', marginBottom: 16,
              }}>
                <h2 className="section-title" style={{ margin: 0, padding: 0 }}>🎬 热门电影</h2>
                <button onClick={() => setPage('movies')} className="btn-outline" style={{ fontSize: 13 }}>
                  更多电影 →
                </button>
              </div>
              {loading ? (
                <div className="skeleton-row">
                  {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton skeleton-poster" />)}
                </div>
              ) : (
                <div className="poster-grid">
                  {movies.slice(0, 8).map((item, i) => (
                    <div key={`movie-${item.tmdbId}`} style={{ animation: `fadeInUp 0.4s ease ${i * 0.06}s both` }}>
                      <PosterCard item={item} onSelect={handleSelect} onSaveLocal={handleSaveLocal} onRemoveLocal={handleRemoveLocal} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 热门剧集 — 8 项网格 + 更多按钮 */}
            <section className="category-section">
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 var(--content-padding)', marginBottom: 16,
              }}>
                <h2 className="section-title" style={{ margin: 0, padding: 0 }}>📺 热门剧集</h2>
                <button onClick={() => setPage('tv')} className="btn-outline" style={{ fontSize: 13 }}>
                  更多剧集 →
                </button>
              </div>
              {loading ? (
                <div className="skeleton-row">
                  {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton skeleton-poster" />)}
                </div>
              ) : (
                <div className="poster-grid">
                  {tvShows.slice(0, 8).map((item, i) => (
                    <div key={`tv-${item.tmdbId}`} style={{ animation: `fadeInUp 0.4s ease ${i * 0.06}s both` }}>
                      <PosterCard item={item} onSelect={handleSelect} onSaveLocal={handleSaveLocal} onRemoveLocal={handleRemoveLocal} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {page === 'movies' && (
          <div key="movies" className="page-transition">
            <PosterWall
              title="电影"
              items={movies}
              onSelect={handleSelect}
              loading={loading}
              onSaveLocal={handleSaveLocal}
              onRemoveLocal={handleRemoveLocal}
              hasMore={moviePage < movieTotalPages}
              onLoadMore={loadMoreMovies}
              loadingMore={loadingMore}
              genres={movieGenres}
              activeGenre={movieGenre}
              onGenreChange={switchMovieGenre}
            />
          </div>
        )}

        {page === 'tv' && (
          <div key="tv" className="page-transition">
            <PosterWall
              title="剧集"
              items={tvShows}
              onSelect={handleSelect}
              loading={loading}
              onSaveLocal={handleSaveLocal}
              onRemoveLocal={handleRemoveLocal}
              hasMore={tvPage < tvTotalPages}
              onLoadMore={loadMoreTv}
              loadingMore={loadingMore}
              genres={tvGenres}
              activeGenre={tvGenre}
              onGenreChange={switchTvGenre}
            />
          </div>
        )}

        {page === 'local' && (
          <div key="local" className="page-transition">
            <LocalMediaView
              items={localMedia}
              onSelect={handleSelect}
              onRefresh={fetchLocal}
              loading={loading}
            />
          </div>
        )}

        {page === 'settings' && (
          <div key="settings" className="page-transition">
            <SettingsPanel />
          </div>
        )}

        {searchQuery && page !== 'local' && (
          <div key="search" className="page-transition">
            <PosterWall
              title={`搜索: ${searchQuery}`}
              items={movies}
              onSelect={handleSelect}
              loading={loading}
              onSaveLocal={handleSaveLocal}
              onRemoveLocal={handleRemoveLocal}
            />
          </div>
        )}
      </main>

      {selectedMedia && (
        <DetailModal
          media={selectedMedia}
          onClose={handleCloseDetail}
          onSaveLocal={() => handleSaveLocal(selectedMedia)}
          onRemoveLocal={() => handleRemoveLocal(selectedMedia)}
          loading={detailLoading}
          onSelectRecommendation={handleSelectRecommendation}
        />
      )}
    </>
  )
}
