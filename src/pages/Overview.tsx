import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { BookText, FilePlus2, GitFork, Globe2, PenLine, Target } from 'lucide-react'
import { db, type ChapterStatus, type Novel } from '../lib/db'
import { ENTITY_TYPES, STATUS } from '../lib/schema'
import { createChapter, useNovelData } from '../lib/actions'
import { fmt, timeAgo } from '../lib/utils'
import { PageHeader } from '../components/PageHeader'
import { AutoTextarea, usePatchSaver } from '../components/ui'

export default function Overview() {
  const { novelId, novel, chapters, entities } = useNovelData()
  const relations = useLiveQuery(() => db.relations.where('novelId').equals(novelId).count(), [novelId])
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const save = usePatchSaver<Novel>((p) => db.novels.update(novelId, { ...p, updatedAt: Date.now() }))

  useEffect(() => {
    if (novel) {
      setTitle(novel.title)
      setSynopsis(novel.synopsis ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novel?.id])

  if (!novel || !chapters || !entities) return null

  const words = chapters.reduce((a, c) => a + c.words, 0)
  const target = novel.targetWords || 0
  const pct = target ? Math.min(100, (words / target) * 100) : 0
  const lastChapter = [...chapters].sort((a, b) => b.updatedAt - a.updatedAt)[0]

  return (
    <div>
      <PageHeader crumbs={<span className="text-fg">Resumen</span>} />
      <div
        className="relative h-40"
        style={{ background: `linear-gradient(120deg, ${novel.color}, color-mix(in srgb, ${novel.color} 45%, #000))` }}
      >
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-8 pb-24">
        <div className="relative z-10 -mt-10 mb-2 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-bg bg-surface text-4xl shadow-soft">
          {novel.emoji}
        </div>
        <AutoTextarea
          value={title}
          onChange={(v) => {
            const t = v.replace(/\n/g, '')
            setTitle(t)
            save({ title: t })
          }}
          className="w-full font-serif text-3xl font-semibold tracking-tight sm:text-5xl"
          placeholder="Título"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          {novel.genre && <span className="chip">{novel.genre}</span>}
          {novel.subtitle && <span>{novel.subtitle}</span>}
          <span className="text-subtle">· editada {timeAgo(novel.updatedAt)}</span>
        </div>
        <AutoTextarea
          value={synopsis}
          onChange={(v) => {
            setSynopsis(v)
            save({ synopsis: v })
          }}
          placeholder="Escribe la sinopsis de tu novela… (el asesor IA la usará como contexto)"
          className="mt-5 w-full font-serif text-lg leading-relaxed text-muted placeholder:text-subtle"
        />

        {/* Métricas */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={<Target size={16} />}
            label="Progreso"
            value={`${fmt(words)}`}
            sub={target ? `de ${fmt(target)} palabras` : 'palabras'}
          >
            {target > 0 && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            )}
          </Stat>
          <Stat
            icon={<BookText size={16} />}
            label="Capítulos"
            value={String(chapters.length)}
            sub={`${chapters.filter((c) => c.status === 'final').length} terminados`}
          />
          <Stat
            icon={<Globe2 size={16} />}
            label="Entradas de wiki"
            value={String(entities.length)}
            sub={`${entities.filter((e) => e.type === 'character').length} personajes`}
          />
          <Stat
            icon={<GitFork size={16} />}
            label="Relaciones"
            value={String(relations ?? 0)}
            sub="en el diagrama"
            to={`/novel/${novelId}/relations`}
          />
        </div>

        {lastChapter && (
          <Link
            to={`/novel/${novelId}/chapter/${lastChapter.id}`}
            className="card mt-3 flex items-center gap-3 p-4 transition hover:shadow-soft"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <PenLine size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Seguir escribiendo</div>
              <div className="truncate text-xs text-muted">
                {lastChapter.title} · {timeAgo(lastChapter.updatedAt)}
              </div>
            </div>
          </Link>
        )}

        {/* Tablero de capítulos */}
        <div className="mb-3 mt-10 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-semibold">Estructura</h2>
          <button className="btn-outline" onClick={async () => navigate(`/novel/${novelId}/chapter/${await createChapter(novelId)}`)}>
            <FilePlus2 size={15} /> Capítulo
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(STATUS) as ChapterStatus[]).map((s) => {
            const list = chapters.filter((c) => c.status === s)
            return (
              <div
                key={s}
                className="rounded-xl bg-surface-2/70 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('chapter')
                  if (id) db.chapters.update(id, { status: s })
                }}
              >
                <div className="flex items-center gap-2 px-1.5 pb-2 pt-1 text-xs font-medium text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS[s].color }} />
                  {STATUS[s].label}
                  <span className="text-subtle">{list.length}</span>
                </div>
                <div className="min-h-16 space-y-2">
                  {list.map((c) => (
                    <Link
                      key={c.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('chapter', c.id)}
                      to={`/novel/${novelId}/chapter/${c.id}`}
                      className="card block p-3 transition hover:shadow-soft"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 text-[11px] tabular-nums text-subtle">{chapters.indexOf(c) + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium leading-snug">{c.title}</div>
                          {c.synopsis && <p className="mt-1 line-clamp-3 text-xs text-muted">{c.synopsis}</p>}
                          <div className="mt-2 text-[11px] text-subtle">{fmt(c.words)} palabras</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Wiki */}
        <h2 className="mb-3 mt-10 font-serif text-2xl font-semibold">Mundo</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ENTITY_TYPES.map((t) => {
            const n = entities.filter((e) => e.type === t.type).length
            return (
              <Link key={t.type} to={`/novel/${novelId}/wiki?type=${t.type}`} className="card group p-4 transition hover:shadow-soft">
                <t.icon size={18} style={{ color: t.color }} />
                <div className="mt-3 text-2xl font-semibold tabular-nums">{n}</div>
                <div className="text-xs text-muted">{t.plural}</div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  sub,
  children,
  to,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  children?: React.ReactNode
  to?: string
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="text-accent">{icon}</span> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-subtle">{sub}</div>
      {children}
    </>
  )
  return to ? (
    <Link to={to} className="card p-4 transition hover:shadow-soft">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  )
}
