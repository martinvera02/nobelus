import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import Markdown from 'react-markdown'
import { ArrowUp, Check, Copy, CornerDownLeft, Eraser, Loader2, Settings2, Sparkles, Square, Wand2, X } from 'lucide-react'
import { db, type AIMessage } from '../lib/db'
import { extractActions } from '../lib/agent'
import { ActionProposal } from './ActionProposal'
import { QUICK_ACTIONS, buildSystemPrompt, streamChat, type ChatMsg } from '../lib/ai'
import { cn, uid } from '../lib/utils'
import { useBridge, useUI } from '../store/ui'
import { useNovelData } from '../lib/actions'

export function AIPanel() {
  const { novelId, chapters, entities } = useNovelData()
  const { ai, setAIOpen, aiCanEdit, setAICanEdit } = useUI()
  const bridge = useBridge()
  const messages = useLiveQuery(() => db.messages.where('novelId').equals(novelId).sortBy('createdAt'), [novelId])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const chapter = chapters?.find((c) => c.id === bridge.chapterId)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages?.length, streaming])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || streaming !== null) return
    setError(null)
    setInput('')
    const now = Date.now()
    await db.messages.add({ id: uid(), novelId, role: 'user', content, createdAt: now })

    const history: ChatMsg[] = [
      ...(messages ?? []).slice(-12).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ]
    const system = await buildSystemPrompt(novelId, {
      chapterId: bridge.chapterId,
      chapterText: bridge.getText?.(),
      canEdit: useUI.getState().aiCanEdit,
    })

    const ctrl = new AbortController()
    abortRef.current = ctrl
    let acc = ''
    setStreaming('')
    try {
      await streamChat(
        ai,
        system,
        history,
        (t) => {
          acc += t
          setStreaming(acc)
        },
        ctrl.signal,
        () => setThinking(true),
      )
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      if (acc.trim()) await db.messages.add({ id: uid(), novelId, role: 'assistant', content: acc, createdAt: Date.now() })
      setStreaming(null)
      setThinking(false)
      abortRef.current = null
    }
  }

  // Prompts enviados desde otras partes (p. ej. "Mejorar" en el editor)
  useEffect(() => {
    if (bridge.pending && streaming === null && messages) {
      const p = bridge.consume()
      if (p) send(p)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.pending, messages])

  const providerLabel =
    ai.provider === 'ollama'
      ? `Ollama · ${ai.ollamaModel}`
      : ai.provider === 'openai'
        ? `OpenAI-compat. · ${ai.openaiModel}`
        : `Anthropic · ${ai.anthropicModel}`

  return (
    <div className="flex h-full w-full flex-col bg-surface lg:w-[400px]">
      <div className="flex h-12 items-center gap-2 border-b border-line px-4">
        <Sparkles size={16} className="text-accent" />
        <span className="font-medium">Asesor</span>
        <span className="truncate text-xs text-subtle">{providerLabel}</span>
        <div className="ml-auto flex">
          <button
            className="icon-btn"
            title="Borrar conversación"
            onClick={() => {
              if (!confirm('¿Borrar la conversación?')) return
              db.messages.where('novelId').equals(novelId).delete()
              db.undos.where('novelId').equals(novelId).delete()
            }}
          >
            <Eraser size={15} />
          </button>
          <Link to={`/novel/${novelId}/settings#ia`} className="icon-btn" title="Configurar IA">
            <Settings2 size={15} />
          </Link>
          <button className="icon-btn" onClick={() => setAIOpen(false)}>
            <X size={15} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages?.length === 0 && streaming === null && (
          <div className="fade-in pt-6 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Sparkles size={20} />
            </div>
            <p className="font-medium">Tu editor literario</p>
            <p className="mx-auto mt-1 max-w-72 text-sm text-muted">
              Conoce tu wiki, tus relaciones y el capítulo que tienes abierto. Pídele críticas, ideas o que detecte incoherencias.
            </p>
            {aiCanEdit && (
              <p className="mx-auto mt-3 max-w-72 text-xs text-subtle">
                También puede proponer cambios: «crea un capítulo entre el 2 y el 3», «haz fichas de los personajes de este capítulo», «pon
                el capítulo 1 en revisión»… Tú decides si se aplican.
              </p>
            )}
          </div>
        )}
        {messages?.map((m) => (
          <Bubble
            key={m.id}
            message={m}
            role={m.role}
            content={m.content}
            canInsert={!!bridge.insert}
            onInsert={(t) => bridge.insert?.(t)}
          />
        ))}
        {streaming !== null && <Bubble role="assistant" content={streaming} streaming thinking={thinking} />}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
            <div className="mt-1">
              <Link to={`/novel/${novelId}/settings#ia`} className="underline">
                Revisar ajustes de IA
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
          {QUICK_ACTIONS.filter((q) => (!q.needsChapter || chapter) && (!q.needsEdit || aiCanEdit)).map((q) => (
            <button
              key={q.label}
              className="chip shrink-0 hover:border-accent hover:text-accent"
              disabled={streaming !== null}
              onClick={() => send(q.prompt)}
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-line bg-bg focus-within:border-accent focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            rows={3}
            placeholder="Pregunta sobre tu novela…"
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-subtle"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={() => setAICanEdit(!aiCanEdit)}
                title={aiCanEdit ? 'El asesor puede proponer cambios en capítulos, fichas y relaciones' : 'El asesor solo aconseja'}
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition',
                  aiCanEdit ? 'bg-accent-soft text-accent' : 'text-subtle hover:text-fg',
                )}
              >
                <Wand2 size={11} /> Editar estructura {aiCanEdit ? 'sí' : 'no'}
              </button>
              <span className="truncate text-[11px] text-subtle">
                {chapter ? `«${chapter.title}» + ` : ''}wiki ({entities?.length ?? 0})
              </span>
            </div>
            {streaming !== null ? (
              <button
                className="icon-btn bg-fg text-bg hover:bg-fg hover:text-bg"
                onClick={() => abortRef.current?.abort()}
                title="Detener"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                className="icon-btn bg-accent text-accent-fg hover:bg-accent hover:text-accent-fg disabled:opacity-40"
                disabled={!input.trim()}
                onClick={() => send(input)}
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Bubble({
  message,
  role,
  content,
  streaming,
  thinking,
  canInsert,
  onInsert,
}: {
  message?: AIMessage
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  thinking?: boolean
  canInsert?: boolean
  onInsert?: (text: string) => void
}) {
  const [copied, setCopied] = useState(false)
  if (role === 'user')
    return (
      <div className="fade-in ml-8 whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-2 px-3.5 py-2.5 text-sm">
        {content.length > 600 ? content.slice(0, 600) + '…' : content}
      </div>
    )

  const parsed = extractActions(content)
  const text = parsed.text
  const preparing = streaming && (parsed.actions || /```nobelus/.test(content))

  return (
    <div className="fade-in group">
      <div className="prose prose-sm max-w-none text-fg dark:prose-invert prose-headings:font-serif prose-p:my-2 prose-li:my-0.5 prose-blockquote:border-accent prose-blockquote:text-muted">
        {text ? (
          <Markdown>{text}</Markdown>
        ) : (
          !preparing && (
            <span className="inline-flex gap-1 py-2">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
              {thinking && <span className="ml-1.5 text-xs text-subtle">Pensando…</span>}
            </span>
          )
        )}
      </div>
      {preparing && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-accent/40 px-3 py-2 text-xs text-accent">
          <Loader2 size={12} className="animate-spin" /> Preparando cambios…
        </div>
      )}
      {!streaming && message && parsed.actions && parsed.actions.length > 0 && (
        <ActionProposal message={message} actions={parsed.actions} />
      )}
      {!streaming && parsed.error && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{parsed.error} Pídele que lo repita.</p>
      )}
      {!streaming && (
        <div className="mt-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            className={cn('btn h-7 px-2 text-xs text-muted hover:bg-hover hover:text-fg')}
            onClick={() => {
              navigator.clipboard.writeText(text)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} Copiar
          </button>
          {canInsert && (
            <button
              className="btn h-7 px-2 text-xs text-muted hover:bg-hover hover:text-fg"
              onClick={() => onInsert?.(text)}
              title="Inserta el texto en la posición del cursor"
            >
              <CornerDownLeft size={12} /> Insertar en el capítulo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
