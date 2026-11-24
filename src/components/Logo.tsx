import { Link } from 'react-router-dom'
import { cn } from '../lib/utils'

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <path d="M20 46V18h4.5l15 20.5V18H44v28h-4.5l-15-20.5V46z" fill="var(--bg)" />
      <circle cx="48" cy="46" r="3" fill="var(--bg)" />
    </svg>
  )
}

export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2 font-serif text-lg font-semibold tracking-tight', className)}>
      <LogoMark />
      {!compact && <span>Nobelus</span>}
    </Link>
  )
}
