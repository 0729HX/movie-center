import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import TrendingPage from './pages/TrendingPage'
import MoviesPage from './pages/MoviesPage'
import TvPage from './pages/TvPage'
import LocalPage from './pages/LocalPage'
import SettingsPage from './pages/SettingsPage'
import SearchResultsPage from './pages/SearchResultsPage'

export default function App() {
  return (
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
  )
}
