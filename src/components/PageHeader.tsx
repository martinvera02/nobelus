import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { useUI } from '../store/ui'
import { cn } from '../lib/utils'
import { SidebarOpener } from './Sidebar'
import { useIsCompact } from '../hooks/useMedia'

export function PageHeader({ crumbs, actions, className }: { crumbs: ReactNode; actions?: ReactNode; className?: string }) {
  const { sidebarOpen, aiOpen, setAIOpen } = useUI()
  const compact = useIsCompact()
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-transparent bg-bg/85 px-2 backdrop-blur sm:px-4',
        className,
      )}
    >
      {(compact || !sidebarOpen) && <SidebarOpener />}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm text-muted">{crumbs}</div>
      <div className="flex items-center gap-1">
        {actions}
        <button
          onClick={() => setAIOpen(!aiOpen)}
          className={cn('btn h-8 px-2.5', aiOpen ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg')}
          title="Asesor IA (Ctrl+J)"
        >
          <Sparkles size={15} /> <span className="hidden sm:inline">Asesor</span>
        </button>
      </div>
    </header>
  )
}

export const Sep = () => <span className="text-subtle">/</span>
