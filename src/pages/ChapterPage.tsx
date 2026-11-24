import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { findAll } from '../lib/search'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Editor, JSONContent } from '@tiptap/react'
import { ArrowLeft, ArrowRight, Check, Loader2, Maximize2, Minimize2, SlidersHorizontal } from 'lucide-react'
import { db, touchNovel, type ChapterStatus } from '../lib/db'
import { STATUS } from '../lib/schema'
import { cn, countWords, docMentions, fmt } from '../lib/utils'
import { RichEditor } from '../components/editor/RichEditor'
import { PageHeader, Sep } from '../components/PageHeader'
import { AutoTextarea, Menu, MenuItem } from '../components/ui'
import { useBridge, useUI } from '../store/ui'
import { useNovelData } from '../lib/actions'

const WIDTH = { narrow: 'max-w-[600px]', normal: 'max-w-[720px]', wide: 'max-w-[900px]' }

export default function ChapterPage() {
  const { chapterId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const find = params.get('find')
  const { novelId, chapters } = useNovelData()
  // Carga única por capítulo: el editor es la fuente de verdad mientras está abierto.
  const chapter = useLiveQuery(() => db.chapters.get(chapterId), [chapterId])
  const [initial, setInitial] = useState<{ id: string; content?: JSONContent } | null>(null)

  useEffect(() => {
    if (chapter && initial?.id !== chapter.id) setInitial({ id: chapter.id, content: chapter.content })
  }, [chapter, initial?.id])

  if (!chapter || initial?.id !== chapterId) return null

  const idx = chapters?.findIndex((c) => c.id === chapterId) ?? -1
  const prev = idx > 0 ? chapters![idx - 1] : null
  const next = chapters && idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null

  return (
    <ChapterEditor
      key={chapterId}
      novelId={novelId}
      chapterId={chapterId}
      initialContent={initial.content}
      title={chapter.title}
      synopsis={chapter.synopsis ?? ''}
      status={chapter.status}
      words={chapter.words}
      prev={prev ? { id: prev.id, title: prev.title } : null}
      next={next ? { id: next.id, title: next.title } : null}
      index={idx}
      find={find}
      onFound={() => setParams({}, { replace: true })}
    />
  )
}

function ChapterEditor(props: {
  novelId: string
  chapterId: string
  initialContent?: JSONContent
  title: string
  synopsis: string
  status: ChapterStatus
  words: number
  prev: { id: string; title: string } | null
  next: { id: string; title: string } | null
  index: number
  find: string | null
  onFound: () => void
}) {
  const { novelId, chapterId } = props
  const editorRef = useRef<Editor | null>(null)

  /** Selecciona y muestra la primera aparición de un texto (llega desde la búsqueda global). */
  const reveal = useCallback((editor: Editor, query: string) => {
    let range: { from: number; to: number } | null = null
    editor.state.doc.descendants((node, pos) => {
      if (range || !node.isText || !node.text) return !range
      const m = findAll(node.text, query)[0]
      if (m) range = { from: pos + m[0], to: pos + m[1] }
      return false
    })
    if (!range) return
    editor.chain().focus().setTextSelection(range).scrollIntoView().run()
    // Centra la coincidencia en pantalla
    requestAnimationFrame(() => {
      const { node } = editor.view.domAtPos(editor.state.selection.from)
      const el = node instanceof HTMLElement ? node : node.parentElement
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [])

  useEffect(() => {
    if (props.find && editorRef.current) {
      reveal(editorRef.current, props.find)
      props.onFound()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.find])
  const { focusMode, setFocusMode, editorWidth, indentParagraphs, setPref } = useUI()
  const register = useBridge((s) => s.register)
  const [words, setWords] = useState(props.words)
  const [saving, setSaving] = useState<'idle' | 'pending' | 'saved'>('idle')
  const startWords = useRef(props.words)
  const pending = useRef<JSONContent | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const wordsRef = useRef(props.words)

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    const doc = pending.current
    if (!doc) return
    pending.current = null
    const w = wordsRef.current
    await db.chapters.update(chapterId, { content: doc, words: w, mentions: docMentions(doc), updatedAt: Date.now() })
    touchNovel(novelId)
    setSaving('saved')
  }, [chapterId, novelId])

  // Guarda lo pendiente al salir del capítulo o cerrar la pestaña
  useEffect(() => {
    const onUnload = () => void flush()
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      void flush()
      register({ chapterId: null, getText: null, getSelection: null, insert: null })
    }
  }, [flush, register])

  const onChange = (json: JSONContent, editor: Editor) => {
    pending.current = json
    wordsRef.current = countWords(editor.getText())
    setWords(wordsRef.current)
    setSaving('pending')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 700)
  }

  const onReady = (editor: Editor) => {
    editorRef.current = editor
    if (props.find) {
      setTimeout(() => reveal(editor, props.find!), 50)
      props.onFound()
    }
    wordsRef.current = countWords(editor.getText())
    startWords.current = wordsRef.current
    setWords(wordsRef.current)
    register({
      chapterId,
      getText: () => editor.getText({ blockSeparator: '\n\n' }),
      getSelection: () => {
        const { from, to } = editor.state.selection
        return editor.state.doc.textBetween(from, to, '\n')
      },
      insert: (text: string) => {
        const paras = text
          .trim()
          .split(/\n{2,}/)
          .map((p) => ({ type: 'paragraph', content: p.trim() ? [{ type: 'text', text: p.replace(/\n/g, ' ') }] : [] }))
        editor.chain().focus().insertContent(paras).run()
      },
    })
  }

  const update = (p: Partial<{ title: string; synopsis: string; status: ChapterStatus }>) => {
    db.chapters.update(chapterId, { ...p, updatedAt: Date.now() })
  }

  const [title, setTitle] = useState(props.title)
  const [synopsis, setSynopsis] = useState(props.synopsis)

  // Si el título o la sinopsis cambian desde fuera (p. ej. el asesor IA), sincroniza salvo que los estés editando
  useEffect(() => {
    if (!(document.activeElement instanceof HTMLTextAreaElement)) setTitle(props.title)
  }, [props.title])
  useEffect(() => {
    if (!(document.activeElement instanceof HTMLTextAreaElement)) setSynopsis(props.synopsis)
  }, [props.synopsis])
  const session = words - startWords.current

  return (
    <div className={cn('min-h-full', focusMode && 'focus-mode')}>
      <PageHeader
        className={cn(focusMode && 'opacity-0 transition-opacity hover:opacity-100')}
        crumbs={
          <>
            <span>Manuscrito</span>
            <Sep />
            <span className="truncate text-fg">{title || 'Sin título'}</span>
            <span className="ml-2 flex items-center gap-1 text-xs text-subtle">
              {saving === 'pending' && <Loader2 size={12} className="animate-spin" />}
              {saving === 'saved' && <Check size={12} />}
              {saving === 'pending' ? 'Guardando' : saving === 'saved' ? 'Guardado' : ''}
            </span>
          </>
        }
        actions={
          <>
            <Menu
              trigger={() => (
                <span className="btn h-8 cursor-pointer px-2.5 text-muted hover:bg-hover hover:text-fg">
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS[props.status].color }} />
                  {STATUS[props.status].label}
                </span>
              )}
            >
              {(close) =>
                (Object.keys(STATUS) as ChapterStatus[]).map((s) => (
                  <MenuItem
                    key={s}
                    icon={<span className="block h-2 w-2 rounded-full" style={{ background: STATUS[s].color }} />}
                    onClick={() => (close(), update({ status: s }))}
                  >
                    {STATUS[s].label}
                  </MenuItem>
                ))
              }
            </Menu>
            <Menu
              trigger={() => (
                <span className="icon-btn h-8 w-8 cursor-pointer" title="Preferencias del editor">
                  <SlidersHorizontal size={15} />
                </span>
              )}
            >
              {(close) => (
                <div className="w-56 p-1.5">
                  <div className="label px-1 pb-1.5">Ancho de página</div>
                  <div className="mb-2 grid grid-cols-3 gap-1">
                    {(['narrow', 'normal', 'wide'] as const).map((w) => (
                      <button
                        key={w}
                        onClick={() => setPref({ editorWidth: w })}
                        className={cn(
                          'rounded-md py-1 text-xs',
                          editorWidth === w ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted hover:text-fg',
                        )}
                      >
                        {w === 'narrow' ? 'Estrecho' : w === 'normal' ? 'Normal' : 'Ancho'}
                      </button>
                    ))}
                  </div>
                  <MenuItem onClick={() => (setPref({ indentParagraphs: !indentParagraphs }), close())}>
                    {indentParagraphs ? '✓ ' : ''}Sangría de párrafo (estilo libro)
                  </MenuItem>
                </div>
              )}
            </Menu>
            <button className="icon-btn h-8 w-8" onClick={() => setFocusMode(!focusMode)} title="Modo enfoque (Esc para salir)">
              {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </>
        }
      />

      <div className={cn('mx-auto px-5 pb-24 pt-8 sm:px-6 sm:pt-10', WIDTH[editorWidth])}>
        {!focusMode && <div className="label mb-2">Capítulo {props.index + 1}</div>}
        <AutoTextarea
          value={title}
          onChange={(v) => {
            setTitle(v.replace(/\n/g, ''))
            update({ title: v.replace(/\n/g, '') })
          }}
          placeholder="Título del capítulo"
          className="w-full font-serif text-3xl font-semibold leading-tight tracking-tight placeholder:text-subtle sm:text-4xl"
        />
        {!focusMode && (
          <AutoTextarea
            value={synopsis}
            onChange={(v) => {
              setSynopsis(v)
              update({ synopsis: v })
            }}
            placeholder="Sinopsis del capítulo (qué pasa, objetivo de la escena)…"
            className="mt-2 w-full text-sm italic text-muted placeholder:text-subtle"
          />
        )}
        <div className="my-6 h-px bg-line" />

        <RichEditor
          novelId={novelId}
          content={props.initialContent}
          onChange={onChange}
          onReady={onReady}
          className={cn(indentParagraphs && 'indent')}
        />

        {!focusMode && (
          <div className="mt-16 grid grid-cols-2 gap-3">
            {props.prev ? (
              <Link
                to={`/novel/${novelId}/chapter/${props.prev.id}`}
                className="card flex items-center gap-2 p-3 text-sm text-muted hover:bg-hover"
              >
                <ArrowLeft size={15} /> <span className="truncate">{props.prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {props.next && (
              <Link
                to={`/novel/${novelId}/chapter/${props.next.id}`}
                className="card flex items-center justify-end gap-2 p-3 text-sm text-muted hover:bg-hover"
              >
                <span className="truncate">{props.next.title}</span> <ArrowRight size={15} />
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none sticky bottom-4 z-10 -mt-12 flex justify-center">
        <div className="flex items-center gap-3 rounded-full border border-line bg-surface/90 px-3.5 py-1.5 text-xs text-muted shadow-soft backdrop-blur">
          <span>
            <b className="font-semibold text-fg tabular-nums">{fmt(words)}</b> palabras
          </span>
          {session !== 0 && (
            <span className={cn('tabular-nums', session > 0 ? 'text-green-600 dark:text-green-400' : 'text-subtle')}>
              {session > 0 ? '+' : ''}
              {fmt(session)} esta sesión
            </span>
          )}
          <span className="text-subtle">~{Math.max(1, Math.round(words / 230))} min de lectura</span>
        </div>
      </div>
    </div>
  )
}
