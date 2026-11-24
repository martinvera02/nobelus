import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { Globe2, LayoutGrid, List, Plus, Search } from 'lucide-react'
import type { EntityType } from '../lib/db'
import { ENTITY_TYPES, typeDef } from '../lib/schema'
import { createEntity, useNovelData } from '../lib/actions'
import { cn, timeAgo } from '../lib/utils'
import { PageHeader, Sep } from '../components/PageHeader'
import { EmptyState } from '../components/ui'

export default function WikiPage() {
  const { novelId, entities } = useNovelData()
  const [params, setParams] = useSearchParams()
  const type = params.get('type') as EntityType | null
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const navigate = useNavigate()
  const def = type ? typeDef(type) : null

  const tags = useMemo(
    () => [...new Set((entities ?? []).filter((e) => !type || e.type === type).flatMap((e) => e.tags))].sort(),
    [entities, type],
  )

  const list = (entities ?? []).filter(
    (e) =>
      (!type || e.type === type) &&
      (!tag || e.tags.includes(tag)) &&
      (!q || `${e.name} ${e.summary ?? ''} ${Object.values(e.fields).join(' ')}`.toLowerCase().includes(q.toLowerCase())),
  )

  const add = async (t: EntityType) => navigate(`/novel/${novelId}/wiki/${await createEntity(novelId, t)}`)

  return (
    <div>
      <PageHeader
        crumbs={
          <>
            <Link to={`/novel/${novelId}/wiki`} className="hover:text-fg">
              Mundo
            </Link>
            {def && (
              <>
                <Sep />
                <span className="text-fg">{def.plural}</span>
              </>
            )}
          </>
        }
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-8 pb-24 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              {def ? <def.icon size={30} style={{ color: def.color }} /> : <Globe2 size={30} className="text-accent" />}
              {def ? def.plural : 'Wiki del mundo'}
            </h1>
            <p className="mt-1 text-muted">
              {def ? `Todo lo que define a tus ${def.plural.toLowerCase()}.` : 'Personajes, lugares, facciones, lore, objetos y eventos.'}{' '}
              Enlázalos en el texto con @.
            </p>
          </div>
          <button className="btn-primary" onClick={() => add(type ?? 'character')}>
            <Plus size={15} /> Nuevo {def ? def.label.toLowerCase() : 'personaje'}
          </button>
        </div>

        {/* Filtros */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
            <Tab active={!type} onClick={() => setParams({})}>
              Todo <span className="text-subtle">{entities?.length ?? 0}</span>
            </Tab>
            {ENTITY_TYPES.map((t) => (
              <Tab key={t.type} active={type === t.type} onClick={() => (setParams({ type: t.type }), setTag(null))}>
                <t.icon size={13} style={{ color: t.color }} />
                {t.plural}
              </Tab>
            ))}
          </div>
          <div className="relative ml-auto w-56">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
            <input className="input py-1.5 pl-8" placeholder="Filtrar…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex rounded-lg border border-line p-0.5">
            <button className={cn('icon-btn', view === 'grid' && 'bg-hover text-fg')} onClick={() => setView('grid')}>
              <LayoutGrid size={14} />
            </button>
            <button className={cn('icon-btn', view === 'list' && 'bg-hover text-fg')} onClick={() => setView('list')}>
              <List size={14} />
            </button>
          </div>
        </div>
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                className={cn('chip', tag === t && 'border-accent bg-accent-soft text-accent')}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6">
          {entities && list.length === 0 && (
            <EmptyState
              icon={def ? <def.icon size={22} /> : <Globe2 size={22} />}
              title={q || tag ? 'Sin resultados' : 'Nada por aquí todavía'}
              text={
                q || tag ? 'Prueba con otro filtro.' : 'Crea la primera entrada o escribe @Nombre en un capítulo para crearla al vuelo.'
              }
              action={
                !q && !tag ? (
                  <button className="btn-primary" onClick={() => add(type ?? 'character')}>
                    <Plus size={15} /> Crear
                  </button>
                ) : undefined
              }
            />
          )}

          {view === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((e, i) => {
                const d = typeDef(e.type)
                return (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 12) * 0.025 }}
                  >
                    <Link
                      to={`/novel/${novelId}/wiki/${e.id}`}
                      className="card group flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-soft"
                    >
                      <div
                        className="relative flex h-24 items-center justify-center"
                        style={{ background: `color-mix(in srgb, ${e.color || d.color} 14%, var(--surface-2))` }}
                      >
                        {e.image ? (
                          <img src={e.image} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-4xl transition group-hover:scale-110">{e.emoji || d.emoji}</span>
                        )}
                        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-surface/90 px-1.5 py-0.5 text-[10px] font-medium text-muted backdrop-blur">
                          <d.icon size={11} style={{ color: d.color }} /> {d.label}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col p-3.5">
                        <div className="font-medium">{e.name}</div>
                        {e.summary && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{e.summary}</p>}
                        {e.tags.length > 0 && (
                          <div className="mt-auto flex flex-wrap gap-1 pt-3">
                            {e.tags.slice(0, 3).map((t) => (
                              <span key={t} className="text-[11px] text-subtle">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          ) : (
            list.length > 0 && (
              <div className="card divide-y divide-line overflow-hidden">
                {list.map((e) => {
                  const d = typeDef(e.type)
                  return (
                    <Link key={e.id} to={`/novel/${novelId}/wiki/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
                      {e.image ? (
                        <img src={e.image} className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <span className="w-7 text-center text-lg">{e.emoji || d.emoji}</span>
                      )}
                      <span className="w-48 truncate font-medium">{e.name}</span>
                      <span className="flex w-28 items-center gap-1.5 text-xs text-muted">
                        <d.icon size={12} style={{ color: d.color }} /> {d.label}
                      </span>
                      <span className="flex-1 truncate text-sm text-muted">{e.summary}</span>
                      <span className="text-xs text-subtle">{timeAgo(e.updatedAt)}</span>
                    </Link>
                  )
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm transition',
        active ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}
