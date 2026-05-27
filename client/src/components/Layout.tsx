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
      <main className="pt-[var(--nav-height)]">
        {state.error && (
          <div className="flex items-center justify-between gap-3 mx-[var(--content-padding)] my-4 px-5 py-3.5 rounded-xl bg-[rgba(255,59,48,0.12)] border border-[rgba(255,59,48,0.3)]">
            <span className="text-sm font-medium text-[#ff453a]">⚠ {state.error}</span>
            <button
              className="px-4 py-1.5 rounded-lg text-[13px] font-semibold cursor-pointer whitespace-nowrap border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.08)] text-[#f5f5f7] transition-all duration-200 hover:bg-[rgba(255,255,255,0.15)] hover:border-[rgba(255,255,255,0.2)]"
              onClick={() => loadAll(true)}
            >
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
