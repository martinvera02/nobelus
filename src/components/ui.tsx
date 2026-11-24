import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Monitor, Moon, Sun, X } from 'lucide-react'
import { useUI, type Theme } from '../store/ui'
import { cn } from '../lib/utils'

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            className={cn('card w-full shadow-soft', width)}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <h2 className="font-semibold">{title}</h2>
                <button className="icon-btn" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Menú desplegable sencillo anclado a un disparador. */
export function Menu({
  trigger,
  children,
  align = 'right',
}: {
  trigger: (open: boolean) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const on = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', on)
    return () => document.removeEventListener('mousedown', on)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <div onClick={(e) => (e.stopPropagation(), e.preventDefault(), setOpen((o) => !o))}>{trigger(open)}</div>
      {open && (
        <div
          className={cn(
            'fade-in absolute top-full z-40 mt-1 min-w-44 rounded-xl border border-line bg-surface p-1 shadow-soft',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon?: ReactNode
  children: ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
        danger ? 'text-red-600 hover:bg-red-500/10 dark:text-red-400' : 'text-fg hover:bg-hover',
      )}
    >
      {icon && <span className="text-muted">{icon}</span>}
      {children}
    </button>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useUI()
  const opts: { v: Theme; icon: ReactNode; label: string }[] = [
    { v: 'light', icon: <Sun size={14} />, label: 'Claro' },
    { v: 'system', icon: <Monitor size={14} />, label: 'Sistema' },
    { v: 'dark', icon: <Moon size={14} />, label: 'Oscuro' },
  ]
  return (
    <div className={cn('inline-flex rounded-lg border border-line bg-surface-2 p-0.5', className)}>
      {opts.map((o) => (
        <button
          key={o.v}
          title={o.label}
          onClick={() => setTheme(o.v)}
          className={cn(
            'flex h-6 w-7 items-center justify-center rounded-md transition-colors',
            theme === o.v ? 'bg-surface text-fg shadow-sm' : 'text-subtle hover:text-fg',
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  )
}

/** Textarea que crece con el contenido. */
export function AutoTextarea({
  value,
  onChange,
  className,
  ...rest
}: { value: string; onChange: (v: string) => void } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.height = '0px'
      el.style.height = el.scrollHeight + 'px'
    }
    fit()
    // Recalcula si cambia el ancho (rotar el móvil, abrir/cerrar paneles)
    let w = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth
        fit()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('resize-none overflow-hidden bg-transparent outline-none', className)}
      {...rest}
    />
  )
}

/** Input que guarda al perder el foco (evita escribir en la BD a cada tecla). */
export function useDebounced<T extends unknown[]>(fn: (...a: T) => void, ms = 500) {
  const t = useRef<number | undefined>(undefined)
  const f = useRef(fn)
  f.current = fn
  useEffect(() => () => window.clearTimeout(t.current), [])
  return (...a: T) => {
    window.clearTimeout(t.current)
    t.current = window.setTimeout(() => f.current(...a), ms)
  }
}

/** Acumula cambios parciales y los guarda con debounce; vacía lo pendiente al desmontar. */
export function usePatchSaver<T extends object>(fn: (patch: Partial<T>) => void, ms = 400) {
  const patch = useRef<Partial<T>>({})
  const t = useRef<number | undefined>(undefined)
  const f = useRef(fn)
  f.current = fn
  const flush = () => {
    window.clearTimeout(t.current)
    if (Object.keys(patch.current).length) {
      const p = patch.current
      patch.current = {}
      f.current(p)
    }
  }
  useEffect(() => flush, [])
  return (p: Partial<T>) => {
    Object.assign(patch.current, p)
    window.clearTimeout(t.current)
    t.current = window.setTimeout(flush, ms)
  }
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="fade-in flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
