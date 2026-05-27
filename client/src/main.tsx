import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { DataContextProvider } from './context/DataContext'
import { AppContextProvider } from './context/AppContext'
import { DetailContextProvider } from './context/DetailContext'
import './styles/global.css'
import './styles/skeleton.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <DataContextProvider>
          <AppContextProvider>
            <DetailContextProvider>
              <App />
            </DetailContextProvider>
          </AppContextProvider>
        </DataContextProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
