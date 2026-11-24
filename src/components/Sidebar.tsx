import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  GitFork,
  GripVertical,
  Home,
  LayoutDashboard,
  Library,
  Menu as MenuIcon,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  History,
} from 'lucide-react'
import { db, deleteEntity, type Chapter, type Entity, type EntityType } from '../lib/db'
import { ENTITY_TYPES, STATUS } from '../lib/schema'
import { createChapter, createEntity, moveChapter, useNovelData } from '../lib/actions'
import { cn, fmt } from '../lib/utils'
import { useUI } from '../store/ui'
import { Menu, MenuItem, ThemeToggle } from './ui'

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const { novelId, novel, chapters, entities } = useNovelData()
  const { toggleSidebar, setAIOpen, aiOpen } = useUI()
  const navigate = useNavigate()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const totalWords = chapters?.reduce((a, c) => a + c.words, 0) ?? 0

  const base = `/novel/${novelId}`

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-[color-mix(in_srgb,var(--surface-2)_60%,var(--bg))]">
      {/* Cabecera */}
      <div className="flex items-center gap-1 px-3 pb-2 pt-3">
        <Link to="/" className="icon-btn" title="Biblioteca">
          <Library size={16} />
        </Link>
        <Link to={base} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-hover">
          <span className="text-lg">{novel?.emoji}</span>
          <span className="truncate font-serif font-semibold">{novel?.title}</span>
        </Link>
        <button className="icon-btn" onClick={toggleSidebar} title="Ocultar barra (Ctrl+\)">
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="px-3">
        <button
          onClick={onSearch}
          className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-subtle transition hover:text-fg"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Buscar…</span>
          <kbd className="rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
        </button>
      </div>

      <nav className="mt-3 space-y-0.5 px-2">
        <NavItem to={base} end icon={<LayoutDashboard size={15} />}>
          Resumen
        </NavItem>
        <NavItem to={`${base}/relations`} icon={<GitFork size={15} />}>
          Relaciones
        </NavItem>
        <NavItem to={`${base}/timeline`} icon={<History size={15} />}>
          Cronología
        </NavItem>
        <button
          onClick={() => setAIOpen(!aiOpen)}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
            aiOpen ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg',
          )}
        >
          <Sparkles size={15} /> Asesor IA
        </button>
      </nav>

      <div className="no-scrollbar mt-4 flex-1 overflow-y-auto px-2 pb-4">
        {/* Manuscrito */}
        <SectionHeader
          label="Manuscrito"
          extra={<span className="text-[10px] font-normal normal-case tracking-normal text-subtle">{fmt(totalWords)} pal.</span>}
          onAdd={async () => navigate(`${base}/chapter/${await createChapter(novelId)}`)}
          addTitle="Nuevo capítulo"
        />
        <div className="space-y-px">
          {chapters?.map((c, i) => (
            <ChapterRow
              key={c.id}
              chapter={c}
              index={i}
              to={`${base}/chapter/${c.id}`}
              dragging={dragId === c.id}
              over={overId === c.id && dragId !== c.id}
              onDragStart={() => setDragId(c.id)}
              onDragOver={() => setOverId(c.id)}
              onDrop={() => {
                if (dragId && chapters) moveChapter(chapters, dragId, c.id)
                setDragId(null)
                setOverId(null)
              }}
              onDragEnd={() => (setDragId(null), setOverId(null))}
            />
          ))}
          {chapters?.length === 0 && <p className="px-2.5 py-1 text-xs text-subtle">Sin capítulos todavía</p>}
        </div>

        {/* Wiki */}
        <SectionHeader
          label="Mundo"
          className="mt-5"
          to={`${base}/wiki`}
          addMenu={(close) =>
            ENTITY_TYPES.map((t) => (
              <MenuItem
                key={t.type}
                icon={<t.icon size={14} />}
                onClick={async () => {
                  close()
                  navigate(`${base}/wiki/${await createEntity(novelId, t.type)}`)
                }}
              >
                {t.label}
              </MenuItem>
            ))
          }
        />
        <div className="space-y-px">
          {ENTITY_TYPES.map((t) => (
            <TypeGroup
              key={t.type}
              type={t.type}
              entities={entities?.filter((e) => e.type === t.type) ?? []}
              base={base}
              novelId={novelId}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-3 py-2">
        <ThemeToggle />
        <div className="flex">
          <Link to="/" className="icon-btn" title="Biblioteca">
            <Home size={15} />
          </Link>
          <Link to={`${base}/settings`} className="icon-btn" title="Ajustes">
            <Settings size={15} />
          </Link>
        </div>
      </div>
    </aside>
  )
}

function NavItem({ to, end, icon, children }: { to: string; end?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
          isActive ? 'bg-hover font-medium text-fg' : 'text-muted hover:bg-hover hover:text-fg',
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  )
}

function SectionHeader({
  label,
  extra,
  onAdd,
  addTitle,
  addMenu,
  className,
  to,
}: {
  label: string
  extra?: React.ReactNode
  onAdd?: () => void
  addTitle?: string
  addMenu?: (close: () => void) => React.ReactNode
  className?: string
  to?: string
}) {
  return (
    <div className={cn('group mb-1 flex items-center justify-between px-2.5', className)}>
      {to ? (
        <Link to={to} className="label hover:text-fg">
          {label}
        </Link>
      ) : (
        <span className="label flex items-center gap-2">
          {label} {extra}
        </span>
      )}
      {onAdd && (
        <button className="icon-btn h-5 w-5 opacity-0 group-hover:opacity-100" title={addTitle} onClick={onAdd}>
          <Plus size={14} />
        </button>
      )}
      {addMenu && (
        <Menu
          trigger={() => (
            <span className="icon-btn h-5 w-5 opacity-0 group-hover:opacity-100" title="Añadir a la wiki">
              <Plus size={14} />
            </span>
          )}
        >
          {addMenu}
        </Menu>
      )}
    </div>
  )
}

function ChapterRow({
  chapter,
  index,
  to,
  dragging,
  over,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  chapter: Chapter
  index: number
  to: string
  dragging: boolean
  over: boolean
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  const navigate = useNavigate()
  const loc = useLocation()
  return (
    <div
      draggable
      onDragStart={(e) => (e.dataTransfer.setData('text/plain', chapter.id), onDragStart())}
      onDragOver={(e) => (e.preventDefault(), onDragOver())}
      onDrop={(e) => (e.preventDefault(), onDrop())}
      onDragEnd={onDragEnd}
      className={cn('group relative', dragging && 'opacity-40')}
    >
      {over && <div className="absolute inset-x-2 -top-px h-0.5 rounded bg-accent" />}
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2 rounded-lg py-1.5 pl-1 pr-1.5 text-sm transition-colors',
            isActive ? 'bg-hover font-medium text-fg' : 'text-muted hover:bg-hover hover:text-fg',
          )
        }
      >
        <GripVertical size={12} className="shrink-0 cursor-grab text-subtle opacity-0 group-hover:opacity-100" />
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: STATUS[chapter.status].color }}
          title={STATUS[chapter.status].label}
        />
        <span className="w-4 shrink-0 text-[11px] tabular-nums text-subtle">{index + 1}</span>
        <span className="flex-1 truncate">{chapter.title || 'Sin título'}</span>
        <span className="text-[10px] tabular-nums text-subtle group-hover:hidden">{chapter.words ? fmt(chapter.words) : ''}</span>
        <span className="hidden group-hover:block">
          <Menu trigger={() => <MoreHorizontal size={14} className="text-subtle hover:text-fg" />}>
            {(close) => (
              <MenuItem
                danger
                icon={<Trash2 size={14} />}
                onClick={async () => {
                  close()
                  if (!confirm(`¿Eliminar «${chapter.title}»?`)) return
                  await db.chapters.delete(chapter.id)
                  if (loc.pathname.endsWith(chapter.id)) navigate(`/novel/${chapter.novelId}`)
                }}
              >
                Eliminar capítulo
              </MenuItem>
            )}
          </Menu>
        </span>
      </NavLink>
    </div>
  )
}

function TypeGroup({ type, entities, base, novelId }: { type: EntityType; entities: Entity[]; base: string; novelId: string }) {
  const def = ENTITY_TYPES.find((t) => t.type === type)!
  const loc = useLocation()
  const containsActive = entities.some((e) => loc.pathname.endsWith(e.id))
  const [open, setOpen] = useState(type === 'character')
  const isOpen = open || containsActive
  const navigate = useNavigate()

  return (
    <div>
      <div className="group flex items-center rounded-lg pr-1.5 text-sm text-muted hover:bg-hover hover:text-fg">
        <button className="flex h-7 w-6 items-center justify-center text-subtle" onClick={() => setOpen(!isOpen)}>
          <ChevronRight size={13} className={cn('transition-transform', isOpen && 'rotate-90')} />
        </button>
        <Link to={`${base}/wiki?type=${type}`} className="flex flex-1 items-center gap-2 py-1.5">
          <def.icon size={14} style={{ color: def.color }} />
          <span className="flex-1">{def.plural}</span>
        </Link>
        <span className="text-[10px] text-subtle group-hover:hidden">{entities.length || ''}</span>
        <button
          className="hidden h-5 w-5 items-center justify-center rounded text-subtle hover:text-fg group-hover:flex"
          title={`Nuevo ${def.label.toLowerCase()}`}
          onClick={async () => navigate(`${base}/wiki/${await createEntity(novelId, type)}`)}
        >
          <Plus size={13} />
        </button>
      </div>
      {isOpen && (
        <div className="ml-[22px] space-y-px border-l border-line pl-1.5">
          {entities.map((e) => (
            <div key={e.id} className="group/item relative">
              <NavLink
                to={`${base}/wiki/${e.id}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] transition-colors',
                    isActive ? 'bg-hover font-medium text-fg' : 'text-muted hover:bg-hover hover:text-fg',
                  )
                }
              >
                {e.image ? (
                  <img src={e.image} className="h-4 w-4 rounded-full object-cover" />
                ) : (
                  <span className="w-4 text-center text-xs">{e.emoji || def.emoji}</span>
                )}
                <span className="truncate">{e.name}</span>
              </NavLink>
              <button
                className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-subtle hover:text-red-500 group-hover/item:block"
                title="Eliminar"
                onClick={async () => {
                  if (!confirm(`¿Eliminar «${e.name}»?`)) return
                  await deleteEntity(e.id)
                  if (loc.pathname.endsWith(e.id)) navigate(`${base}/wiki?type=${type}`)
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {entities.length === 0 && <p className="px-2 py-1 text-xs text-subtle">Vacío</p>}
        </div>
      )}
    </div>
  )
}

export function SidebarOpener() {
  const toggle = useUI((s) => s.toggleSidebar)
  return (
    <button className="icon-btn" onClick={toggle} title="Mostrar barra (Ctrl+\\)">
      <MenuIcon size={16} />
    </button>
  )
}
