import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'

// Route-level code splitting with React.lazy
const TrendingPage = lazy(() => import('./pages/TrendingPage'))
const MoviesPage = lazy(() => import('./pages/MoviesPage'))
const TvPage = lazy(() => import('./pages/TvPage'))
const LocalPage = lazy(() => import('./pages/LocalPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'))

// Loading fallback for Suspense
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <p className="text-text-secondary text-sm">Loading...</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TrendingPage />} />
          <Route path="movies" element={<MoviesPage />} />
          <Route path="tv" element={<TvPage />} />
          <Route path="local" element={<LocalPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="search" element={<SearchResultsPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
