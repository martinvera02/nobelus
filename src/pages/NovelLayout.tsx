import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useIsCompact } from '../hooks/useMedia'
import { AnimatePresence, motion } from 'motion/react'
import { Sidebar } from '../components/Sidebar'
const AIPanel = lazy(() => import('../components/AIPanel').then((m) => ({ default: m.AIPanel })))
import { CommandPalette } from '../components/CommandPalette'
import { useNovelData } from '../lib/actions'
import { useUI } from '../store/ui'

export default function NovelLayout() {
  const { novel } = useNovelData()
  const { sidebarOpen, aiOpen, focusMode, mobileNav, toggleSidebar, setAIOpen, setFocusMode, setMobileNav } = useUI()
  const compact = useIsCompact()
  const location = useLocation()

  // En tablet/móvil, el cajón se cierra al navegar
  useEffect(() => {
    setMobileNav(false)
  }, [location.pathname, setMobileNav])
  const [palette, setPalette] = useState(false)

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      } else if (mod && e.key === '\\') {
        e.preventDefault()
        toggleSidebar()
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setAIOpen(!useUI.getState().aiOpen)
      } else if (e.key === 'Escape' && useUI.getState().focusMode) {
        setFocusMode(false)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [toggleSidebar, setAIOpen, setFocusMode])

  if (novel === undefined) return null
  if (novel === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <p>Esta novela no existe o se ha eliminado.</p>
        <Link to="/" className="btn-outline">
          Volver a la biblioteca
        </Link>
      </div>
    )
  }

  const showSidebar = (compact ? mobileNav : sidebarOpen) && !focusMode
  const showAI = aiOpen && !focusMode
  const spring = { type: 'spring', duration: 0.35, bounce: 0 } as const

  return (
    <div className="flex h-full overflow-hidden">
      {/* Barra lateral: columna fija en escritorio, cajón superpuesto en tablet/móvil */}
      <AnimatePresence initial={false}>
        {showSidebar &&
          (compact ? (
            <motion.div
              key="nav-drawer"
              className="fixed inset-0 z-40 flex"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div className="h-full shadow-soft" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={spring}>
                <Sidebar onSearch={() => (setMobileNav(false), setPalette(true))} />
              </motion.div>
              <div className="flex-1 bg-black/30 backdrop-blur-[1px]" onClick={() => setMobileNav(false)} />
            </motion.div>
          ) : (
            <motion.div
              key="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={spring}
              className="h-full shrink-0 overflow-hidden"
            >
              <Sidebar onSearch={() => setPalette(true)} />
            </motion.div>
          ))}
      </AnimatePresence>

      <main className="relative min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Asesor IA: columna en escritorio, panel superpuesto en tablet/móvil */}
      <AnimatePresence initial={false}>
        {showAI &&
          (compact ? (
            <motion.div
              key="ai-drawer"
              className="fixed inset-0 z-40 flex justify-end"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="hidden flex-1 bg-black/30 backdrop-blur-[1px] sm:block" onClick={() => setAIOpen(false)} />
              <motion.div
                className="h-full w-full shadow-soft sm:w-[400px] sm:border-l sm:border-line"
                initial={{ x: 400 }}
                animate={{ x: 0 }}
                exit={{ x: 400 }}
                transition={spring}
              >
                <Suspense fallback={null}>
                  <AIPanel />
                </Suspense>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="ai"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={spring}
              className="h-full shrink-0 overflow-hidden border-l border-line"
            >
              <Suspense fallback={null}>
                <AIPanel />
              </Suspense>
            </motion.div>
          ))}
      </AnimatePresence>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}
