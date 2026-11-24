import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  BookText,
  FilePlus2,
  GitFork,
  History,
  LayoutDashboard,
  Library,
  Maximize2,
  Moon,
  Settings,
  Sparkles,
  Sun,
  TextSearch,
} from 'lucide-react'
import { ENTITY_TYPES, STATUS, typeDef } from '../lib/schema'
import { createChapter, createEntity, useNovelData } from '../lib/actions'
import { normalize, searchText } from '../lib/search'
import { useUI } from '../store/ui'
import { Modal } from './ui'

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { novelId, chapters, entities } = useNovelData()
  const navigate = useNavigate()
  const { setTheme, setAIOpen, setFocusMode } = useUI()
  const [query, setQuery] = useState('')
  const base = `/novel/${novelId}`
  const q = normalize(query.trim())

  const close = () => {
    onClose()
    setQuery('')
  }
  const run = (fn: () => unknown) => () => {
    close()
    fn()
  }
  const has = (...parts: (string | undefined)[]) => !q || normalize(parts.filter(Boolean).join(' ')).includes(q)

  // Búsqueda dentro del texto (a partir de 3 letras)
  const textHits = useMemo(() => (open ? searchText(chapters ?? [], entities ?? [], query) : []), [open, chapters, entities, query])

  const actions = [
    {
      value: 'nuevo capitulo',
      icon: <FilePlus2 size={15} />,
      label: 'Nuevo capítulo',
      fn: async () => navigate(`${base}/chapter/${await createChapter(novelId)}`),
    },
    ...ENTITY_TYPES.map((t) => ({
      value: `nuevo ${t.label}`,
      icon: <t.icon size={15} />,
      label: `Nuevo ${t.label.toLowerCase()}`,
      fn: async () => navigate(`${base}/wiki/${await createEntity(novelId, t.type)}`),
    })),
  ]
  const goto = [
    { value: 'resumen', icon: <LayoutDashboard size={15} />, label: 'Resumen', fn: () => navigate(base) },
    { value: 'relaciones diagrama', icon: <GitFork size={15} />, label: 'Diagrama de relaciones', fn: () => navigate(`${base}/relations`) },
    { value: 'cronologia timeline', icon: <History size={15} />, label: 'Cronología', fn: () => navigate(`${base}/timeline`) },
    {
      value: 'ajustes exportar copias',
      icon: <Settings size={15} />,
      label: 'Ajustes, copias y exportación',
      fn: () => navigate(`${base}/settings`),
    },
    { value: 'biblioteca', icon: <Library size={15} />, label: 'Biblioteca', fn: () => navigate('/') },
    { value: 'asesor ia', icon: <Sparkles size={15} />, label: 'Abrir asesor IA', hint: 'Ctrl J', fn: () => setAIOpen(true) },
    { value: 'modo enfoque', icon: <Maximize2 size={15} />, label: 'Modo enfoque', fn: () => setFocusMode(true) },
    { value: 'tema claro', icon: <Sun size={15} />, label: 'Tema claro', fn: () => setTheme('light') },
    { value: 'tema oscuro', icon: <Moon size={15} />, label: 'Tema oscuro', fn: () => setTheme('dark') },
  ]

  const chapterList = (chapters ?? []).map((c, i) => ({ c, i })).filter(({ c, i }) => has(`cap ${i + 1}`, c.title, c.synopsis))
  const entityList = (entities ?? []).filter((e) => has(e.name, typeDef(e.type).label, e.tags.join(' '), e.summary))
  const actionList = actions.filter((a) => has(a.value, a.label))
  const gotoList = goto.filter((a) => has(a.value, a.label))
  const empty = !chapterList.length && !entityList.length && !actionList.length && !gotoList.length && !textHits.length

  const Item = ({
    icon,
    children,
    onSelect,
    value,
    hint,
  }: {
    icon: React.ReactNode
    children: React.ReactNode
    onSelect: () => void
    value: string
    hint?: string
  }) => (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted"
    >
      <span className="flex w-5 shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[11px] text-subtle">{hint}</span>}
    </Command.Item>
  )

  return (
    <Modal open={open} onClose={close} width="max-w-xl">
      <Command loop shouldFilter={false} className="overflow-hidden rounded-xl" label="Paleta de comandos">
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Busca capítulos, fichas, acciones… o cualquier frase de tu novela"
          className="w-full border-b border-line bg-transparent px-4 py-3.5 text-[15px] outline-none placeholder:text-subtle"
        />
        <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
          {empty && <div className="px-4 py-8 text-center text-sm text-subtle">Sin resultados</div>}

          {chapterList.length > 0 && (
            <Command.Group heading="Capítulos">
              {chapterList.slice(0, q ? 8 : 50).map(({ c, i }) => (
                <Item
                  key={c.id}
                  value={`c-${c.id}`}
                  icon={<BookText size={15} />}
                  hint={STATUS[c.status].label}
                  onSelect={run(() => navigate(`${base}/chapter/${c.id}`))}
                >
                  {i + 1}. {c.title}
                </Item>
              ))}
            </Command.Group>
          )}

          {entityList.length > 0 && (
            <Command.Group heading="Wiki">
              {entityList.slice(0, q ? 8 : 50).map((e) => (
                <Item
                  key={e.id}
                  value={`e-${e.id}`}
                  icon={<span>{e.emoji || typeDef(e.type).emoji}</span>}
                  hint={typeDef(e.type).label}
                  onSelect={run(() => navigate(`${base}/wiki/${e.id}`))}
                >
                  {e.name}
                </Item>
              ))}
            </Command.Group>
          )}

          {textHits.length > 0 && (
            <Command.Group heading="En el texto">
              {textHits.map((h) => (
                <Command.Item
                  key={`${h.kind}-${h.id}`}
                  value={`t-${h.kind}-${h.id}`}
                  onSelect={run(() =>
                    navigate(
                      h.kind === 'chapter' ? `${base}/chapter/${h.id}?find=${encodeURIComponent(query.trim())}` : `${base}/wiki/${h.id}`,
                    ),
                  )}
                  className="flex cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted"
                >
                  <span className="flex w-5 shrink-0 justify-center pt-0.5">
                    <TextSearch size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-fg">{h.title}</span>
                      <span className="shrink-0 text-[11px] text-subtle">
                        {h.count} {h.count === 1 ? 'vez' : 'veces'}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block font-serif text-[13px] leading-snug">
                      {h.snippet.before}
                      <mark className="rounded bg-accent-soft px-0.5 text-accent">{h.snippet.match}</mark>
                      {h.snippet.after}
                    </span>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {q.length > 0 && q.length < 3 && (
            <div className="px-3 py-2 text-[11px] text-subtle">Escribe al menos 3 letras para buscar dentro del texto.</div>
          )}

          {actionList.length > 0 && (
            <Command.Group heading="Crear">
              {actionList.map((a) => (
                <Item key={a.value} value={a.value} icon={a.icon} onSelect={run(a.fn)}>
                  {a.label}
                </Item>
              ))}
            </Command.Group>
          )}

          {gotoList.length > 0 && (
            <Command.Group heading="Ir a">
              {gotoList.map((a) => (
                <Item key={a.value} value={a.value} icon={a.icon} hint={a.hint} onSelect={run(a.fn)}>
                  {a.label}
                </Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </Modal>
  )
}
