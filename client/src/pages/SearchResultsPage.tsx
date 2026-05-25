import { useEffect, type FC } from 'react'
import { useSearchParams } from 'react-router-dom'
import PosterWall from '../components/PosterWall'
import { useData, useApp } from '../context/hooks'

const SearchResultsPage: FC = () => {
  const { state } = useData()
  const { handleSearch, handleClearSearch } = useApp()
  const [searchParams] = useSearchParams()

  // URL 深链接支持: /search?q=xxx
  const urlQuery = searchParams.get('q') || ''
  useEffect(() => {
    if (urlQuery && urlQuery !== state.searchQuery) {
      handleSearch(urlQuery)
    }
  }, [urlQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  const query = state.searchQuery || urlQuery
  if (!query) return null

  const hasMore = state.searchPage < state.searchTotalPages

  return (
    <div className="page-transition">
      <PosterWall
        title={`搜索: ${query}`}
        items={state.searchResults}
        loading={state.loading}
        onClear={handleClearSearch}
        hasMore={hasMore}
        onLoadMore={hasMore ? () => handleSearch(query, state.searchPage + 1) : undefined}
        loadingMore={state.loadingMore}
        highlightQuery={query}
        emptyTitle={`没有找到"${query}"的相关结果`}
        emptyDesc="试试其他关键词吧"
        resultCount={state.searchResultCount}
      />
    </div>
  )
}

export default SearchResultsPage
