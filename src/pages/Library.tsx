import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { BookPlus, Download, FileUp, MoreHorizontal, Sparkles, Trash2 } from 'lucide-react'
import { db, deleteNovel } from '../lib/db'
import { createSampleNovel, exportLibraryJSON, exportNovelJSON, importBackupFile } from '../lib/backup'
import { BackupBanner } from '../components/BackupPanel'
import { NOVEL_COLORS, NOVEL_EMOJIS, cn, fmt, timeAgo, uid } from '../lib/utils'
import { EmptyState, Menu, MenuItem, Modal, ThemeToggle } from '../components/ui'
import { Logo } from '../components/Logo'

export default function Library() {
  const navigate = useNavigate()
  const novels = useLiveQuery(() => db.novels.orderBy('updatedAt').reverse().toArray(), [])
  const stats = useLiveQuery(async () => {
    const chapters = await db.chapters.toArray()
    const m = new Map<string, { words: number; chapters: number }>()
    for (const c of chapters) {
      const s = m.get(c.novelId) ?? { words: 0, chapters: 0 }
      s.words += c.words
      s.chapters++
      m.set(c.novelId, s)
    }
    return m
  }, [])
  const [creating, setCreating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const onImport = async (f?: File) => {
    if (!f) return
    try {
      const ids = await importBackupFile(f)
      if (ids.length === 1) navigate(`/novel/${ids[0]}`)
      else alert(`Se han restaurado ${ids.length} novelas.`)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Logo />
          <div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              <FileUp size={15} /> Importar
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                onImport(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {!!novels?.length && (
              <button
                className="btn-ghost hidden sm:inline-flex"
                onClick={() => exportLibraryJSON()}
                title="Descargar una copia de todas las novelas"
              >
                <Download size={15} /> Exportar todo
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <BackupBanner hasNovels={!!novels?.length} />
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Tu biblioteca</h1>
            <p className="mt-1 text-muted">Cada historia, con su mundo, sus personajes y su manuscrito.</p>
          </div>
          <button className="btn-primary px-4 py-2" onClick={() => setCreating(true)}>
            <BookPlus size={16} /> Nueva novela
          </button>
        </div>

        {novels && novels.length === 0 && (
          <EmptyState
            icon={<BookPlus size={22} />}
            title="Aún no hay novelas"
            text="Crea tu primera novela o carga un ejemplo para explorar el editor, la wiki y el diagrama de relaciones."
            action={
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => setCreating(true)}>
                  <BookPlus size={15} /> Nueva novela
                </button>
                <button className="btn-outline" onClick={async () => navigate(`/novel/${await createSampleNovel()}`)}>
                  <Sparkles size={15} /> Cargar ejemplo
                </button>
              </div>
            }
          />
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {novels?.map((n, i) => {
            const s = stats?.get(n.id)
            const pct = n.targetWords ? Math.min(100, ((s?.words ?? 0) / n.targetWords) * 100) : 0
            return (
              <motion.div key={n.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Link
                  to={`/novel/${n.id}`}
                  className="group card relative flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <div
                    className="relative flex h-28 items-end px-5 pb-3"
                    style={{ background: `linear-gradient(135deg, ${n.color}, color-mix(in srgb, ${n.color} 55%, #000))` }}
                  >
                    <span className="absolute -bottom-6 left-5 flex h-12 w-12 items-center justify-center rounded-xl border-4 border-surface bg-surface text-2xl">
                      {n.emoji}
                    </span>
                    <div className="absolute right-3 top-3 opacity-0 transition group-hover:opacity-100">
                      <Menu
                        trigger={() => (
                          <span className="icon-btn bg-black/20 text-white hover:bg-black/30 hover:text-white">
                            <MoreHorizontal size={16} />
                          </span>
                        )}
                      >
                        {(close) => (
                          <>
                            <MenuItem icon={<Download size={14} />} onClick={() => (close(), exportNovelJSON(n.id))}>
                              Copia de seguridad
                            </MenuItem>
                            <MenuItem
                              danger
                              icon={<Trash2 size={14} />}
                              onClick={() => {
                                close()
                                if (confirm(`¿Eliminar «${n.title}» y todo su contenido? No se puede deshacer.`)) deleteNovel(n.id)
                              }}
                            >
                              Eliminar
                            </MenuItem>
                          </>
                        )}
                      </Menu>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col px-5 pb-5 pt-9">
                    <h3 className="font-serif text-xl font-semibold leading-snug">{n.title}</h3>
                    {n.genre && <p className="text-sm text-muted">{n.genre}</p>}
                    {n.synopsis && <p className="mt-2 line-clamp-2 text-sm text-muted">{n.synopsis}</p>}
                    <div className="mt-auto pt-4">
                      {n.targetWords ? (
                        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: n.color }} />
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between text-xs text-subtle">
                        <span>
                          {fmt(s?.words ?? 0)} palabras · {s?.chapters ?? 0} cap.
                        </span>
                        <span>{timeAgo(n.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </main>

      <NewNovelModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function NewNovelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [emoji, setEmoji] = useState(NOVEL_EMOJIS[0])
  const [color, setColor] = useState(NOVEL_COLORS[0])

  const create = async () => {
    if (!title.trim()) return
    const now = Date.now()
    const id = uid()
    await db.novels.add({ id, title: title.trim(), genre: genre.trim(), emoji, color, createdAt: now, updatedAt: now, targetWords: 80000 })
    await db.chapters.add({
      id: uid(),
      novelId: id,
      title: 'Capítulo 1',
      status: 'draft',
      order: 0,
      words: 0,
      mentions: [],
      createdAt: now,
      updatedAt: now,
    })
    onClose()
    setTitle('')
    setGenre('')
    navigate(`/novel/${id}`)
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva novela">
      <form className="space-y-4 p-5" onSubmit={(e) => (e.preventDefault(), create())}>
        <div className="flex gap-3">
          <div
            className="flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-2xl text-3xl"
            style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))` }}
          >
            {emoji}
          </div>
          <div className="flex-1 space-y-2">
            <input
              autoFocus
              className="input text-base font-medium"
              placeholder="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input className="input" placeholder="Género (opcional)" value={genre} onChange={(e) => setGenre(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="label mb-1.5">Icono</div>
          <div className="flex flex-wrap gap-1">
            {NOVEL_EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setEmoji(e)}
                className={cn('h-9 w-9 rounded-lg text-lg hover:bg-hover', emoji === e && 'bg-accent-soft ring-1 ring-accent')}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-1.5">Color</div>
          <div className="flex gap-2">
            {NOVEL_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className={cn('h-7 w-7 rounded-full transition', color === c && 'ring-2 ring-fg ring-offset-2 ring-offset-surface')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!title.trim()}>
            Crear novela
          </button>
        </div>
      </form>
    </Modal>
  )
}
