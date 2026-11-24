import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { JSONContent } from '@tiptap/react'
import { ArrowRight, BookText, Camera, GitFork, ImageOff, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { db, deleteEntity, type Entity, type EntityType, type RelationKind } from '../lib/db'
import { ENTITY_TYPES, RELATION_KINDS, typeDef } from '../lib/schema'
import { cn, resizeImage, uid } from '../lib/utils'
import { useNovelData } from '../lib/actions'
import { RichEditor } from '../components/editor/RichEditor'
import { PageHeader, Sep } from '../components/PageHeader'
import { AutoTextarea, Menu, MenuItem, usePatchSaver } from '../components/ui'
import { useBridge } from '../store/ui'

const EMOJIS = [
  '👤',
  '🧙',
  '🧝',
  '🧛',
  '👑',
  '🗡️',
  '🏹',
  '🛡️',
  '🧭',
  '⚓',
  '🕯️',
  '🔮',
  '📜',
  '🗝️',
  '💎',
  '🏰',
  '🌲',
  '🏔️',
  '🌊',
  '🌋',
  '🏙️',
  '⛪',
  '🐉',
  '🐺',
  '🦅',
  '🌙',
  '☀️',
  '⚔️',
  '💀',
  '❤️',
  '🔥',
  '⏳',
]

export default function EntityPage() {
  const { entityId = '' } = useParams()
  const entity = useLiveQuery(() => db.entities.get(entityId), [entityId])
  if (!entity) return null
  return <EntityView key={entity.id} entity={entity} />
}

function EntityView({ entity }: { entity: Entity }) {
  const { novelId, entities } = useNovelData()
  const navigate = useNavigate()
  const ask = useBridge((s) => s.ask)
  const def = typeDef(entity.type)
  const [name, setName] = useState(entity.name)
  const [summary, setSummary] = useState(entity.summary ?? '')
  const [fields, setFields] = useState(entity.fields)
  const [initialContent] = useState<JSONContent | undefined>(entity.content)
  const [tagDraft, setTagDraft] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const save = usePatchSaver<Entity>((p) => db.entities.update(entity.id, { ...p, updatedAt: Date.now() }))
  const saveNow = (p: Partial<Entity>) => db.entities.update(entity.id, { ...p, updatedAt: Date.now() })

  const appearances = useLiveQuery(() => db.chapters.where('mentions').equals(entity.id).sortBy('order'), [entity.id])
  const relations = useLiveQuery(
    async () => [
      ...(await db.relations.where('source').equals(entity.id).toArray()),
      ...(await db.relations.where('target').equals(entity.id).toArray()),
    ],
    [entity.id],
  )
  const byId = new Map((entities ?? []).map((e) => [e.id, e]))

  // Al cambiar de tipo, los campos se conservan (no se pierde información).
  const fieldDefs = [
    ...def.fields,
    ...Object.keys(fields)
      .filter((k) => !def.fields.some((f) => f.key === k) && fields[k])
      .map((k) => ({ key: k, label: k, multiline: true as const, options: undefined, placeholder: undefined })),
  ]

  return (
    <div>
      <PageHeader
        crumbs={
          <>
            <Link to={`/novel/${novelId}/wiki?type=${entity.type}`} className="hover:text-fg">
              {def.plural}
            </Link>
            <Sep />
            <span className="truncate text-fg">{name}</span>
          </>
        }
        actions={
          <>
            <button
              className="btn-ghost h-8"
              onClick={() =>
                ask(
                  `Ayúdame a desarrollar a fondo ${def.label.toLowerCase() === 'personaje' ? 'al personaje' : 'la entrada'} «${name}». Revisa lo que ya tengo, señala huecos o clichés, y propón detalles concretos que encajen con el resto del mundo.`,
                )
              }
            >
              <Sparkles size={14} /> Desarrollar
            </button>
            <button
              className="icon-btn h-8 w-8 hover:text-red-500"
              title="Eliminar"
              onClick={async () => {
                if (!confirm(`¿Eliminar «${name}»? También se borrarán sus relaciones.`)) return
                await deleteEntity(entity.id)
                navigate(`/novel/${novelId}/wiki?type=${entity.type}`)
              }}
            >
              <Trash2 size={15} />
            </button>
          </>
        }
      />

      <div
        className="h-28"
        style={{
          background: `linear-gradient(120deg, color-mix(in srgb, ${entity.color || def.color} 35%, var(--surface-2)), var(--surface-2))`,
        }}
      />

      <div className="mx-auto max-w-4xl px-4 sm:px-8 pb-32">
        {/* Avatar */}
        <div className="group relative -mt-12 mb-3 h-24 w-24">
          {entity.image ? (
            <img src={entity.image} className="h-24 w-24 rounded-2xl border-4 border-bg object-cover shadow-soft" />
          ) : (
            <Menu
              align="left"
              trigger={() => (
                <button className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-bg bg-surface text-5xl shadow-soft transition hover:scale-[1.03]">
                  {entity.emoji || def.emoji}
                </button>
              )}
            >
              {(close) => (
                <div className="grid w-72 grid-cols-8 gap-0.5 p-1">
                  {EMOJIS.map((e) => (
                    <button key={e} className="h-8 rounded-md text-lg hover:bg-hover" onClick={() => (saveNow({ emoji: e }), close())}>
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </Menu>
          )}
          <div className="absolute -right-2 -bottom-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              className="icon-btn border border-line bg-surface shadow-sm"
              title="Subir imagen"
              onClick={() => fileRef.current?.click()}
            >
              <Camera size={13} />
            </button>
            {entity.image && (
              <button
                className="icon-btn border border-line bg-surface shadow-sm"
                title="Quitar imagen"
                onClick={() => saveNow({ image: undefined })}
              >
                <ImageOff size={13} />
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) saveNow({ image: await resizeImage(f) })
            }}
          />
        </div>

        <AutoTextarea
          value={name}
          onChange={(v) => {
            const n = v.replace(/\n/g, '')
            setName(n)
            save({ name: n })
          }}
          placeholder="Nombre"
          className="w-full font-serif text-3xl font-semibold tracking-tight sm:text-4xl"
        />
        <AutoTextarea
          value={summary}
          onChange={(v) => {
            setSummary(v)
            save({ summary: v })
          }}
          placeholder="Resumen en una línea…"
          className="mt-1 w-full text-lg text-muted placeholder:text-subtle"
        />

        {/* Propiedades */}
        <div className="mt-6 space-y-0.5">
          <PropRow label="Tipo">
            <Menu
              align="left"
              trigger={() => (
                <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm hover:bg-hover">
                  <def.icon size={14} style={{ color: def.color }} /> {def.label}
                </span>
              )}
            >
              {(close) =>
                ENTITY_TYPES.map((t) => (
                  <MenuItem key={t.type} icon={<t.icon size={14} />} onClick={() => (close(), saveNow({ type: t.type as EntityType }))}>
                    {t.label}
                  </MenuItem>
                ))
              }
            </Menu>
          </PropRow>

          {fieldDefs.map((f) => (
            <PropRow key={f.key} label={f.label}>
              {f.options ? (
                <select
                  value={fields[f.key] ?? ''}
                  onChange={(e) => {
                    const nf = { ...fields, [f.key]: e.target.value }
                    setFields(nf)
                    save({ fields: nf })
                  }}
                  className="-ml-0.5 cursor-pointer rounded-md bg-transparent px-1 py-0.5 text-sm outline-none hover:bg-hover"
                >
                  <option value="">—</option>
                  {fields[f.key] && !f.options.includes(fields[f.key]) && <option>{fields[f.key]}</option>}
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <AutoTextarea
                  value={fields[f.key] ?? ''}
                  onChange={(v) => {
                    const nf = { ...fields, [f.key]: f.multiline ? v : v.replace(/\n/g, '') }
                    setFields(nf)
                    save({ fields: nf })
                  }}
                  placeholder={f.placeholder ?? 'Vacío'}
                  className="w-full rounded-md px-1.5 py-0.5 text-sm placeholder:text-subtle hover:bg-hover focus:bg-hover"
                />
              )}
            </PropRow>
          ))}

          <PropRow label="Etiquetas">
            <div className="flex flex-wrap items-center gap-1 px-1">
              {entity.tags.map((t) => (
                <span key={t} className="chip">
                  #{t}
                  <button onClick={() => saveNow({ tags: entity.tags.filter((x) => x !== t) })} className="hover:text-fg">
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ',') && tagDraft.trim()) {
                    e.preventDefault()
                    const t = tagDraft.trim().replace(/^#/, '').toLowerCase()
                    if (!entity.tags.includes(t)) saveNow({ tags: [...entity.tags, t] })
                    setTagDraft('')
                  }
                }}
                placeholder="Añadir…"
                className="w-24 bg-transparent py-0.5 text-sm outline-none placeholder:text-subtle"
              />
            </div>
          </PropRow>
        </div>

        {/* Relaciones y apariciones */}
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <GitFork size={14} className="text-accent" /> Relaciones
              </span>
              <AddRelation entity={entity} candidates={(entities ?? []).filter((e) => e.id !== entity.id)} />
            </div>
            <div className="space-y-1">
              {relations?.map((r) => {
                const otherId = r.source === entity.id ? r.target : r.source
                const other = byId.get(otherId)
                if (!other) return null
                const k = RELATION_KINDS[r.kind]
                return (
                  <div key={r.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-hover">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: k.color }} />
                    <span className="text-xs text-muted">{k.label}</span>
                    {r.source !== entity.id && <ArrowRight size={11} className="rotate-180 text-subtle" />}
                    <Link to={`/novel/${novelId}/wiki/${other.id}`} className="truncate font-medium hover:underline">
                      {other.name}
                    </Link>
                    {r.label && <span className="truncate text-xs text-subtle">· {r.label}</span>}
                    <button
                      className="ml-auto hidden text-subtle hover:text-red-500 group-hover:block"
                      onClick={() => db.relations.delete(r.id)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
              {relations?.length === 0 && <p className="text-xs text-subtle">Sin relaciones. Añádelas aquí o en el diagrama.</p>}
            </div>
          </div>
          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <BookText size={14} className="text-accent" /> Aparece en
            </div>
            <div className="space-y-1">
              {appearances?.map((c) => (
                <Link
                  key={c.id}
                  to={`/novel/${novelId}/chapter/${c.id}`}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-hover"
                >
                  <span className="text-xs tabular-nums text-subtle">{c.order + 1}</span>
                  <span className="truncate">{c.title}</span>
                </Link>
              ))}
              {appearances?.length === 0 && (
                <p className="text-xs text-subtle">Aún no se menciona. Escribe @{name.split(' ')[0]} en un capítulo.</p>
              )}
            </div>
          </div>
        </div>

        <div className="my-8 h-px bg-line" />
        <RichEditor
          novelId={novelId}
          variant="wiki"
          content={initialContent}
          placeholder="Notas, historia, descripción detallada… usa @ para enlazar otras entradas."
          onChange={(json) => save({ content: json })}
        />
      </div>
    </div>
  )
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-28 shrink-0 sm:w-36 py-1 text-sm text-muted">{label}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function AddRelation({ entity, candidates }: { entity: Entity; candidates: Entity[] }) {
  const [target, setTarget] = useState('')
  const [kind, setKind] = useState<RelationKind>('amistad')
  const [label, setLabel] = useState('')
  useEffect(() => setTarget(''), [entity.id])
  return (
    <Menu
      trigger={() => (
        <span className="icon-btn h-6 w-6 cursor-pointer">
          <Plus size={14} />
        </span>
      )}
    >
      {(close) => (
        <form
          className="w-64 space-y-2 p-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!target) return
            await db.relations.add({
              id: uid(),
              novelId: entity.novelId,
              source: entity.id,
              target,
              kind,
              label: label.trim(),
              createdAt: Date.now(),
            })
            setLabel('')
            close()
          }}
        >
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Con…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as RelationKind)}>
            {Object.entries(RELATION_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <input className="input" placeholder="Etiqueta (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className={cn('btn-primary w-full')} disabled={!target}>
            Añadir relación
          </button>
        </form>
      )}
    </Menu>
  )
}
