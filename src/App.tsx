import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { applyTheme, useUI } from './store/ui'
import { startAutoBackup } from './lib/autobackup'
import Library from './pages/Library'
import NovelLayout from './pages/NovelLayout'
import Overview from './pages/Overview'
const ChapterPage = lazy(() => import('./pages/ChapterPage'))
import WikiPage from './pages/WikiPage'
const EntityPage = lazy(() => import('./pages/EntityPage'))
const RelationsPage = lazy(() => import('./pages/RelationsPage'))
import TimelinePage from './pages/TimelinePage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const theme = useUI((s) => s.theme)

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])

  // Copias de seguridad automáticas mientras la app está abierta
  useEffect(() => startAutoBackup(), [])

  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/novel/:novelId" element={<NovelLayout />}>
            <Route index element={<Overview />} />
            <Route path="chapter/:chapterId" element={<ChapterPage />} />
            <Route path="wiki" element={<WikiPage />} />
            <Route path="wiki/:entityId" element={<EntityPage />} />
            <Route path="relations" element={<RelationsPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Library />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
