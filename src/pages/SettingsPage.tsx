import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Download, FileText, Loader2, RefreshCw, Trash2, XCircle } from 'lucide-react'
import { db, deleteNovel, type Novel } from '../lib/db'
import { exportManuscriptMarkdown, exportNovelJSON } from '../lib/backup'
import {
  RECOMMENDED_OLLAMA,
  listOllamaModels,
  listOpenAIModels,
  ollamaVersion,
  pullOllamaModel,
  streamChat,
  type OllamaModel,
  type PullProgress,
} from '../lib/ai'
import { useNovelData } from '../lib/actions'
import { NOVEL_COLORS, NOVEL_EMOJIS, cn } from '../lib/utils'
import { useUI, type AIProvider } from '../store/ui'
import { PageHeader } from '../components/PageHeader'
import { ThemeToggle, usePatchSaver } from '../components/ui'
import { BackupPanel } from '../components/BackupPanel'

export default function SettingsPage() {
  const { novelId, novel } = useNovelData()
  const navigate = useNavigate()
  const save = usePatchSaver<Novel>((p) => db.novels.update(novelId, { ...p, updatedAt: Date.now() }))
  const [form, setForm] = useState<Partial<Novel>>({})

  useEffect(() => {
    if (novel) setForm(novel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novel?.id])

  useEffect(() => {
    if (location.hash === '#ia') document.getElementById('ia')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  if (!novel) return null
  const set = (p: Partial<Novel>) => {
    setForm((f) => ({ ...f, ...p }))
    save(p)
  }

  return (
    <div>
      <PageHeader crumbs={<span className="text-fg">Ajustes</span>} />
      <div className="mx-auto max-w-3xl space-y-8 px-4 sm:px-8 pb-24 pt-6">
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Ajustes</h1>

        <Section title="Novela">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título">
              <input className="input" value={form.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label="Subtítulo / saga">
              <input className="input" value={form.subtitle ?? ''} onChange={(e) => set({ subtitle: e.target.value })} />
            </Field>
            <Field label="Género">
              <input className="input" value={form.genre ?? ''} onChange={(e) => set({ genre: e.target.value })} />
            </Field>
            <Field label="Objetivo de palabras">
              <input
                className="input"
                type="number"
                min={0}
                step={1000}
                value={form.targetWords ?? 0}
                onChange={(e) => set({ targetWords: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Icono">
            <div className="flex flex-wrap gap-1">
              {NOVEL_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => db.novels.update(novelId, { emoji: e })}
                  className={cn('h-9 w-9 rounded-lg text-lg hover:bg-hover', novel.emoji === e && 'bg-accent-soft ring-1 ring-accent')}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Color">
            <div className="flex gap-2">
              {NOVEL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => db.novels.update(novelId, { color: c })}
                  className={cn('h-7 w-7 rounded-full', novel.color === c && 'ring-2 ring-fg ring-offset-2 ring-offset-bg')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>
        </Section>

        <Section title="Apariencia">
          <div className="flex items-center justify-between">
            <span className="text-sm">Tema</span>
            <ThemeToggle />
          </div>
        </Section>

        <AISettings />

        <Section title="Copias de seguridad">
          <BackupPanel />
        </Section>

        <Section title="Exportar esta novela">
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" onClick={() => exportNovelJSON(novelId)}>
              <Download size={15} /> Copia de esta novela (.json)
            </button>
            <button className="btn-outline" onClick={() => exportManuscriptMarkdown(novelId)}>
              <FileText size={15} /> Manuscrito en Markdown
            </button>
          </div>
        </Section>

        <Section title="Zona peligrosa">
          <button
            className="btn border border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400"
            onClick={async () => {
              if (!confirm(`¿Eliminar «${novel.title}» con todos sus capítulos, wiki y relaciones?`)) return
              await deleteNovel(novelId)
              navigate('/')
            }}
          >
            <Trash2 size={15} /> Eliminar novela
          </button>
        </Section>
      </div>
    </div>
  )
}

function AISettings() {
  const { ai, setAI } = useUI()
  const [oaModels, setOaModels] = useState<string[]>([])
  const [oaLoading, setOaLoading] = useState(false)
  const [test, setTest] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; msg?: string }>({ state: 'idle' })

  const loadOpenAIModels = async () => {
    setOaLoading(true)
    try {
      setOaModels(await listOpenAIModels(ai.openaiUrl, ai.openaiKey))
      setTest({ state: 'idle' })
    } catch (e) {
      setOaModels([])
      setTest({ state: 'error', msg: (e as Error).message })
    } finally {
      setOaLoading(false)
    }
  }

  const runTest = async () => {
    setTest({ state: 'loading' })
    let out = ''
    try {
      await streamChat(ai, 'Responde solo con una palabra.', [{ role: 'user', content: 'Di "hola".' }], (t) => (out += t))
      setTest({ state: 'ok', msg: `Respuesta: ${out.trim().slice(0, 60)}` })
    } catch (e) {
      setTest({ state: 'error', msg: (e as Error).message })
    }
  }

  const providers: { v: AIProvider; label: string; desc: string }[] = [
    { v: 'ollama', label: 'Ollama (local)', desc: 'Gratis y privado. Corre en tu GPU.' },
    { v: 'openai', label: 'Compatible OpenAI', desc: 'OpenAI, OpenRouter, LM Studio, Groq…' },
    { v: 'anthropic', label: 'Anthropic', desc: 'Modelos Claude con tu API key.' },
  ]

  return (
    <Section title="Asesor IA" id="ia">
      <div className="grid gap-2 sm:grid-cols-3">
        {providers.map((p) => (
          <button
            key={p.v}
            onClick={() => (setAI({ provider: p.v }), setTest({ state: 'idle' }))}
            className={cn(
              'rounded-xl border p-3 text-left transition',
              ai.provider === p.v ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover',
            )}
          >
            <div className="text-sm font-medium">{p.label}</div>
            <div className="mt-0.5 text-xs text-muted">{p.desc}</div>
          </button>
        ))}
      </div>

      {ai.provider === 'ollama' && <OllamaSetup />}

      {ai.provider === 'openai' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label mr-1">Servicio</span>
            {OPENAI_PRESETS.map((p) => (
              <button
                key={p.url}
                onClick={() => (setAI({ openaiUrl: p.url }), setOaModels([]))}
                className={cn('chip', ai.openaiUrl === p.url && 'border-accent bg-accent-soft text-accent')}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="API key" className="sm:col-span-2">
              <input
                className="input font-mono"
                type="password"
                autoComplete="off"
                value={ai.openaiKey}
                onChange={(e) => setAI({ openaiKey: e.target.value.trim() })}
                placeholder={
                  ai.openaiUrl.includes('openai.com')
                    ? 'sk-proj-…'
                    : ai.openaiUrl.includes('googleapis.com')
                      ? 'AIza…'
                      : 'Opcional en servidores locales'
                }
              />
            </Field>
            <Field label="URL base">
              <input className="input" value={ai.openaiUrl} onChange={(e) => setAI({ openaiUrl: e.target.value })} />
            </Field>
            <Field label="Modelo">
              <div className="flex gap-1.5">
                {oaModels.length ? (
                  <select className="input" value={ai.openaiModel} onChange={(e) => setAI({ openaiModel: e.target.value })}>
                    {!oaModels.includes(ai.openaiModel) && <option>{ai.openaiModel}</option>}
                    {oaModels.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input className="input" value={ai.openaiModel} onChange={(e) => setAI({ openaiModel: e.target.value.trim() })} />
                )}
                <button
                  className="btn-outline px-2"
                  onClick={loadOpenAIModels}
                  disabled={oaLoading}
                  title="Cargar los modelos de tu cuenta"
                >
                  {oaLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
              </div>
            </Field>
          </div>
          {ai.openaiUrl.includes('googleapis.com') && (
            <p className="text-xs text-subtle">
              Consigue una clave gratuita en aistudio.google.com → Get API key (sin tarjeta). Pulsa ↻ y elige un modelo «flash»: es rápido y
              el nivel gratuito basta para uso personal. Ten en cuenta que en el nivel gratuito Google puede usar tus textos para mejorar
              sus modelos.
            </p>
          )}
          {ai.openaiUrl.includes('openai.com') && (
            <p className="text-xs text-subtle">
              Crea la clave en platform.openai.com → API keys y pon un límite de gasto mensual en Billing. Pulsa ↻ para ver los modelos de
              tu cuenta. Los modelos de razonamiento ignoran la «creatividad»: Nobelus lo detecta y no la envía.
            </p>
          )}
        </div>
      )}

      {ai.provider === 'anthropic' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Modelo">
            <input className="input" value={ai.anthropicModel} onChange={(e) => setAI({ anthropicModel: e.target.value })} />
          </Field>
          <Field label="API key">
            <input
              className="input font-mono"
              type="password"
              value={ai.anthropicKey}
              onChange={(e) => setAI({ anthropicKey: e.target.value })}
              placeholder="sk-ant-…"
            />
          </Field>
        </div>
      )}

      <Field label={`Creatividad (temperatura ${ai.temperature.toFixed(1)})`}>
        <input
          type="range"
          min={0}
          max={1.2}
          step={0.1}
          value={ai.temperature}
          onChange={(e) => setAI({ temperature: Number(e.target.value) })}
          className="w-full accent-[var(--accent)]"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button className="btn-outline" onClick={runTest} disabled={test.state === 'loading'}>
          {test.state === 'loading' ? <Loader2 size={14} className="animate-spin" /> : null} Probar conexión
        </button>
        {test.state === 'ok' && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 size={15} /> {test.msg}
          </span>
        )}
        {test.state === 'error' && (
          <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
            <XCircle size={15} /> <span className="line-clamp-2">{test.msg}</span>
          </span>
        )}
      </div>
      <p className="text-xs text-subtle">
        Las claves se guardan solo en este navegador (localStorage). Vale para uso personal en local; si algún día publicas Nobelus, las
        llamadas deberán pasar por un backend.
      </p>
    </Section>
  )
}

function OllamaSetup() {
  const { ai, setAI } = useUI()
  const [version, setVersion] = useState<string | null | undefined>(undefined)
  const [installed, setInstalled] = useState<OllamaModel[]>([])
  const [pulling, setPulling] = useState<{ model: string; p: PullProgress } | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const refresh = async () => {
    const v = await ollamaVersion(ai.ollamaUrl)
    setVersion(v)
    if (v) {
      const list = await listOllamaModels(ai.ollamaUrl).catch(() => [])
      setInstalled(list)
      // Si el modelo configurado no está instalado pero hay otro, selecciona el primero recomendado disponible
      if (list.length && !list.some((m) => m.name === ai.ollamaModel)) {
        const pick = RECOMMENDED_OLLAMA.find((r) => list.some((m) => m.name === r.name))?.name ?? list[0].name
        setAI({ ollamaModel: pick })
      }
    }
  }

  useEffect(() => {
    refresh()
    // Mientras Ollama no esté disponible, vuelve a comprobarlo cada pocos segundos
    const t = window.setInterval(() => version === null && refresh(), 4000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.ollamaUrl, version === null])

  const pull = async (model: string) => {
    setPullError(null)
    const ctrl = new AbortController()
    abort.current = ctrl
    setPulling({ model, p: { status: 'Conectando…' } })
    try {
      await pullOllamaModel(ai.ollamaUrl, model, (p) => setPulling({ model, p }), ctrl.signal)
      setAI({ ollamaModel: model })
      await refresh()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setPullError((e as Error).message)
    } finally {
      setPulling(null)
      abort.current = null
    }
  }

  const gb = (n: number) => (n / 1e9).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' GB'
  const pct = pulling?.p.total ? Math.round(((pulling.p.completed ?? 0) / pulling.p.total) * 100) : null

  return (
    <div className="space-y-4">
      {/* Estado */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border p-3 text-sm',
          version ? 'border-green-500/30 bg-green-500/5' : version === null ? 'border-amber-500/40 bg-amber-500/5' : 'border-line',
        )}
      >
        {version === undefined ? (
          <Loader2 size={16} className="animate-spin text-muted" />
        ) : version ? (
          <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
        ) : (
          <XCircle size={16} className="text-amber-600" />
        )}
        <div className="flex-1">
          {version === undefined && 'Buscando Ollama…'}
          {version && (
            <>
              Ollama {version} conectado · {installed.length} modelo{installed.length === 1 ? '' : 's'} instalado
              {installed.length === 1 ? '' : 's'}
            </>
          )}
          {version === null && (
            <>
              <b>Ollama no responde.</b> Ábrelo desde el menú Inicio (se queda junto al reloj) o instálalo desde ollama.com/download. Esta
              pantalla lo detectará sola.
            </>
          )}
        </div>
        <button className="btn-ghost h-7 px-2" onClick={refresh} title="Comprobar de nuevo">
          <RefreshCw size={13} />
        </button>
      </div>

      {version && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Modelo en uso">
              <select className="input" value={ai.ollamaModel} onChange={(e) => setAI({ ollamaModel: e.target.value })}>
                {!installed.some((m) => m.name === ai.ollamaModel) && (
                  <option value={ai.ollamaModel}>{ai.ollamaModel} (no descargado)</option>
                )}
                {installed.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} · {gb(m.size)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="URL de Ollama">
              <input className="input" value={ai.ollamaUrl} onChange={(e) => setAI({ ollamaUrl: e.target.value })} />
            </Field>
          </div>

          <div>
            <span className="label mb-1.5 block">Modelos recomendados para tu equipo</span>
            <div className="space-y-2">
              {RECOMMENDED_OLLAMA.map((r) => {
                const has = installed.some((m) => m.name === r.name)
                const isPulling = pulling?.model === r.name
                return (
                  <div
                    key={r.name}
                    className={cn('rounded-xl border p-3', ai.ollamaModel === r.name && has ? 'border-accent' : 'border-line')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">
                          {r.name} <span className="font-normal text-subtle">· {r.size}</span>
                        </div>
                        <div className="text-xs text-muted">{r.desc}</div>
                      </div>
                      {has ? (
                        ai.ollamaModel === r.name ? (
                          <span className="chip border-accent text-accent">En uso</span>
                        ) : (
                          <button className="btn-outline h-8" onClick={() => setAI({ ollamaModel: r.name })}>
                            Usar
                          </button>
                        )
                      ) : isPulling ? (
                        <button className="btn-ghost h-8" onClick={() => abort.current?.abort()}>
                          Cancelar
                        </button>
                      ) : (
                        <button className="btn-primary h-8" disabled={!!pulling} onClick={() => pull(r.name)}>
                          <Download size={14} /> Descargar
                        </button>
                      )}
                    </div>
                    {isPulling && (
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct ?? 3}%` }} />
                        </div>
                        <div className="mt-1 flex justify-between text-[11px] text-subtle">
                          <span>{pulling.p.status}</span>
                          {pulling.p.total ? (
                            <span>
                              {gb(pulling.p.completed ?? 0)} / {gb(pulling.p.total)} · {pct}%
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {pullError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{pullError}</p>}
            <p className="mt-2 text-xs text-subtle">
              Deja Nobelus abierto hasta que termine (puedes seguir escribiendo en otra sección). Todo se ejecuta en tu PC: tus textos no
              salen de él.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--accent)]"
              checked={ai.ollamaThink}
              onChange={(e) => setAI({ ollamaThink: e.target.checked })}
            />
            <span>
              <span className="text-sm font-medium">Razonar antes de responder</span>
              <span className="block text-xs text-muted">
                Mejores análisis de trama e incoherencias, pero tarda bastante más en empezar a responder. Desactivado, va más rápido.
              </span>
            </span>
          </label>
        </>
      )}
    </div>
  )
}

const OPENAI_PRESETS = [
  { label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { label: 'Google Gemini (gratis)', url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { label: 'LM Studio', url: 'http://localhost:1234/v1' },
]

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="card space-y-4 p-6">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="label mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}
