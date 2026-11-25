import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { lazy, Suspense } from 'react'
import { isSiteTabHash } from './core/sites/siteTabAddress'

const SiteTabView = lazy(() => import('./screens/SiteTabView'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSiteTabHash(window.location.hash) ? <Suspense fallback={<p role="status">Открываем страницу…</p>}><SiteTabView /></Suspense> : <App />}
  </StrictMode>,
)
