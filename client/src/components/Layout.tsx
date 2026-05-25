import { useEffect, useCallback } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Navbar from './Navbar'
import DetailModal from './DetailModal'
import { useData, useApp, useDetail } from '../context/hooks'

export default function Layout() {
  const { state } = useData()
  const { loadAll, handleSearch: appHandleSearch, handleClearSearch } = useApp()
  const { handleCloseDetail } = useDetail()
  const navigate = useNavigate()

  useEffect(() => { loadAll() }, [loadAll])

  const handlePageChange = (page: string) => {
    handleClearSearch()
    navigate(page === 'trending' ? '/' : `/${page}`)
  }

  const handleSearch = useCallback((q: string) => {
    appHandleSearch(q)
    if (q.trim()) {
      navigate(`/search?q=${encodeURIComponent(q)}`)
    }
  }, [appHandleSearch, navigate])

  return (
    <>
      <Navbar onSearch={handleSearch} onPageChange={handlePageChange} />
      <main className="main-content">
        {state.error && (
          <div className="error-banner">
            <span className="error-banner-text">⚠ {state.error}</span>
            <button className="error-banner-btn" onClick={() => loadAll(true)}>
              重试
            </button>
          </div>
        )}
        <Outlet />
      </main>
      {state.selectedMedia && (
        <DetailModal
          media={state.selectedMedia}
          loading={state.detailLoading}
        />
      )}
    </>
  )
}
