import { db } from './db'
import { AGENT_PROTOCOL } from './agent'
import { typeDef, STATUS, RELATION_KINDS } from './schema'
import { docToText } from './utils'
import type { AISettings } from '../store/ui'

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

/** Lee un stream línea a línea. */
async function* lines(res: Response) {
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line) yield line
    }
  }
  if (buf.trim()) yield buf.trim()
}

async function fail(res: Response, provider: string): Promise<never> {
  let detail = ''
  try {
    detail = (await res.text()).slice(0, 300)
  } catch {
    /* noop */
  }
  throw new Error(`${provider} respondió ${res.status}. ${detail}`)
}

export async function streamChat(
  s: AISettings,
  system: string,
  messages: ChatMsg[],
  onToken: (t: string) => void,
  signal?: AbortSignal,
  onThinking?: () => void,
) {
  if (s.provider === 'ollama') {
    const base = s.ollamaUrl.replace(/\/$/, '')
    const call = (withThink: boolean) =>
      fetch(`${base}/api/chat`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: s.ollamaModel,
          stream: true,
          // Los modelos con razonamiento (gemma4, qwen3, gpt-oss…) piensan antes de responder; se puede desactivar para ir más rápido
          ...(withThink ? { think: s.ollamaThink } : {}),
          options: { temperature: s.temperature, num_ctx: 16384 },
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      }).catch((e) => {
        if ((e as Error).name === 'AbortError') throw e
        throw new Error(
          `No se pudo conectar con Ollama en ${s.ollamaUrl}. Abre la app de Ollama (icono de la llama junto al reloj) y vuelve a intentarlo.`,
        )
      })
    let res = await call(!noThink.has(s.ollamaModel))
    if (res.status === 400) {
      const body = await res.clone().text()
      if (/think/i.test(body)) {
        noThink.add(s.ollamaModel)
        res = await call(false)
      }
    }
    if (res.status === 404)
      throw new Error(`El modelo «${s.ollamaModel}» no está descargado. Ve a Ajustes → Asesor IA y pulsa «Descargar».`)
    if (!res.ok) await fail(res, 'Ollama')
    let thinking = false
    for await (const line of lines(res)) {
      const j = JSON.parse(line)
      if (j.error) throw new Error(j.error)
      if (j.message?.thinking && !thinking) {
        thinking = true
        onThinking?.()
      }
      if (j.message?.content) onToken(j.message.content)
    }
    return
  }

  if (s.provider === 'openai') {
    if (!s.openaiKey && s.openaiUrl.includes('openai.com')) throw new Error('Falta la API key en Ajustes → Asesor IA.')
    const call = (withTemperature: boolean) =>
      fetch(`${s.openaiUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          ...(s.openaiKey ? { Authorization: `Bearer ${s.openaiKey}` } : {}),
        },
        body: JSON.stringify({
          model: s.openaiModel,
          stream: true,
          ...(withTemperature ? { temperature: s.temperature } : {}),
          // OpenAI usa el rol "developer" en modelos nuevos, pero "system" sigue siendo aceptado y es compatible con todos los proveedores
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      })
    let res = await call(!noTemperature.has(s.openaiModel))
    // Los modelos de razonamiento (familia GPT-5 y posteriores, o-series) rechazan "temperature": reintenta sin ella y recuérdalo.
    if (res.status === 400) {
      const body = await res.clone().text()
      if (/temperature/i.test(body)) {
        noTemperature.add(s.openaiModel)
        res = await call(false)
      }
    }
    if (!res.ok) await fail(res, s.openaiUrl.includes('openai.com') ? 'OpenAI' : 'La API')
    for await (const line of lines(res)) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') break
      const t = JSON.parse(data).choices?.[0]?.delta?.content
      if (t) onToken(t)
    }
    return
  }

  // Anthropic
  if (!s.anthropicKey) throw new Error('Falta la API key de Anthropic en Ajustes → Asesor IA.')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': s.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: s.anthropicModel,
      max_tokens: 4096,
      temperature: s.temperature,
      stream: true,
      system,
      messages,
    }),
  })
  if (!res.ok) await fail(res, 'Anthropic')
  for await (const line of lines(res)) {
    if (!line.startsWith('data:')) continue
    const j = JSON.parse(line.slice(5))
    if (j.type === 'content_block_delta' && j.delta?.text) onToken(j.delta.text)
    if (j.type === 'error') throw new Error(j.error?.message ?? 'Error de Anthropic')
  }
}

/** Modelos que han rechazado el parámetro temperature (se recuerda durante la sesión). */
const noTemperature = new Set<string>()
/** Modelos de Ollama que no admiten el parámetro think. */
const noThink = new Set<string>()

/** Lista los modelos de chat disponibles en una API compatible con OpenAI. */
export async function listOpenAIModels(url: string, key: string): Promise<string[]> {
  const res = await fetch(`${url.replace(/\/$/, '')}/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  })
  if (!res.ok) await fail(res, 'La API')
  const j = await res.json()
  const ids: string[] = (j.data ?? []).map((m: { id: string }) => m.id)
  // En OpenAI se filtran modelos que no sirven para chat (embeddings, audio, imagen, moderación…)
  const isOpenAI = url.includes('openai.com')
  const isGoogle = url.includes('googleapis.com')
  const noChat = /(audio|realtime|transcribe|tts|image|imagen|veo|search|embedding|moderation|aqa|live)/
  return ids
    .map((id) => id.replace(/^models\//, ''))
    .filter((id) => {
      if (isOpenAI) return /^(gpt|o\d|chatgpt|chat-latest)/.test(id) && !noChat.test(id)
      if (isGoogle) return /^(gemini|gemma)/.test(id) && !noChat.test(id)
      return true
    })
    .sort((a, b) => b.localeCompare(a))
}

export interface OllamaModel {
  name: string
  size: number
}

export async function listOllamaModels(url: string): Promise<OllamaModel[]> {
  const res = await fetch(`${url.replace(/\/$/, '')}/api/tags`)
  if (!res.ok) throw new Error('Ollama no responde')
  const j = await res.json()
  return (j.models ?? []).map((m: OllamaModel) => ({ name: m.name, size: m.size }))
}

export async function ollamaVersion(url: string): Promise<string | null> {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/version`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return null
    return (await res.json()).version ?? '?'
  } catch {
    return null
  }
}

export interface PullProgress {
  status: string
  completed?: number
  total?: number
}

/** Descarga un modelo en Ollama mostrando el progreso. */
export async function pullOllamaModel(url: string, model: string, onProgress: (p: PullProgress) => void, signal?: AbortSignal) {
  const res = await fetch(`${url.replace(/\/$/, '')}/api/pull`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
  })
  if (!res.ok) await fail(res, 'Ollama')
  for await (const line of lines(res)) {
    const j = JSON.parse(line)
    if (j.error) throw new Error(j.error)
    onProgress(j)
  }
}

/** Modelos recomendados para escribir en español con una GPU de 16 GB. */
export const RECOMMENDED_OLLAMA = [
  { name: 'gemma4:12b', size: '≈ 8 GB', desc: 'Recomendado. Muy buen español y estilo, rápido en 16 GB de VRAM.' },
  { name: 'qwen3.5:9b', size: '≈ 7 GB', desc: 'Más ligero y rápido. Útil si la GPU está ocupada con otras cosas.' },
  { name: 'gpt-oss:20b', size: '≈ 14 GB', desc: 'Razona mejor (incoherencias, trama), pero ocupa casi toda la VRAM.' },
]

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

/**
 * Construye el prompt de sistema con el contexto de la novela.
 * Prioriza: ficha de la novela → capítulo activo → entidades mencionadas en él → resto de la wiki resumida.
 */
export async function buildSystemPrompt(novelId: string, opts: { chapterId?: string | null; chapterText?: string; canEdit?: boolean }) {
  const [novel, chapters, entities, relations] = await Promise.all([
    db.novels.get(novelId),
    db.chapters.where('novelId').equals(novelId).sortBy('order'),
    db.entities.where('novelId').equals(novelId).toArray(),
    db.relations.where('novelId').equals(novelId).toArray(),
  ])
  if (!novel) return ''
  const byId = new Map(entities.map((e) => [e.id, e]))
  const active = chapters.find((c) => c.id === opts.chapterId)

  const parts: string[] = []
  parts.push(
    `Eres el asesor literario de Nobelus: un editor exigente, honesto y constructivo que ayuda a un autor a escribir y pulir su novela.
Responde siempre en español, con concreción. Cuando critiques, señala el fragmento exacto y propone una alternativa.
Respeta la voz del autor y la coherencia con la wiki de su mundo. Si detectas contradicciones con la wiki, dilo explícitamente.
No inventes datos de la wiki: si algo no está definido, sugiérelo como propuesta. Usa Markdown ligero.`,
  )

  parts.push(
    `## Novela\nTítulo: ${novel.title}${novel.subtitle ? ` — ${novel.subtitle}` : ''}\nGénero: ${novel.genre || 'sin definir'}\nSinopsis: ${novel.synopsis || 'sin sinopsis'}`,
  )

  if (chapters.length) {
    parts.push(
      '## Estructura\n' +
        chapters
          .map(
            (c, i) =>
              `${i + 1}. ${c.title} [${STATUS[c.status].label}, ${c.words} palabras]${c.synopsis ? ` — ${clip(c.synopsis, 200)}` : ''}`,
          )
          .join('\n'),
    )
  }

  const mentioned = new Set(active?.mentions ?? [])
  const detailed = entities.filter((e) => mentioned.has(e.id))
  const rest = entities.filter((e) => !mentioned.has(e.id))

  const describe = (e: (typeof entities)[number], full: boolean) => {
    const fields = Object.entries(e.fields)
      .filter(([, v]) => v?.trim())
      .map(([k, v]) => {
        const label = typeDef(e.type).fields.find((f) => f.key === k)?.label ?? k
        return `${label}: ${full ? v : clip(v, 120)}`
      })
      .join('; ')
    const body = full ? clip(docToText(e.content), 1500) : ''
    return `- [${typeDef(e.type).label}] ${e.name}${e.summary ? ` — ${e.summary}` : ''}${fields ? ` (${fields})` : ''}${body ? `\n  ${body.replace(/\n+/g, ' ')}` : ''}`
  }

  if (detailed.length)
    parts.push('## Wiki: elementos presentes en el capítulo actual\n' + detailed.map((e) => describe(e, true)).join('\n'))
  if (rest.length) parts.push('## Wiki: resto del mundo\n' + clip(rest.map((e) => describe(e, false)).join('\n'), 6000))

  if (relations.length) {
    parts.push(
      '## Relaciones\n' +
        relations
          .map((r) => {
            const a = byId.get(r.source)?.name
            const b = byId.get(r.target)?.name
            return a && b ? `- ${a} → ${b}: ${RELATION_KINDS[r.kind].label}${r.label ? ` (${r.label})` : ''}` : ''
          })
          .filter(Boolean)
          .join('\n'),
    )
  }

  if (active) {
    const text = opts.chapterText ?? docToText(active.content)
    parts.push(
      `## Capítulo abierto: «${active.title}»\n${active.synopsis ? `Sinopsis: ${active.synopsis}\n` : ''}Texto:\n"""\n${clip(text, 24000)}\n"""`,
    )
  }

  if (opts.canEdit) parts.push(AGENT_PROTOCOL)
  else
    parts.push(
      'No puedes modificar la novela: limítate a aconsejar. Si el autor pide cambios, dile que active «Editar estructura» en el panel.',
    )

  return parts.join('\n\n')
}

export const QUICK_ACTIONS: { label: string; prompt: string; needsChapter?: boolean; needsEdit?: boolean }[] = [
  {
    label: 'Fichas del capítulo',
    needsChapter: true,
    needsEdit: true,
    prompt:
      'Lee el capítulo abierto y propón crear fichas para los personajes, lugares, objetos o facciones que aparecen y aún no están en la wiki, con un resumen y los campos que se deduzcan del texto. Añade también las relaciones evidentes. No inventes datos que el texto no sugiera.',
  },
  {
    label: 'Mejorar estructura',
    needsEdit: true,
    prompt:
      'Analiza la estructura de la novela (orden de capítulos, sinopsis, estados) y propón cambios concretos: capítulos que faltan, reordenaciones, sinopsis que escribir o mejorar. Explica brevemente el porqué de cada cambio.',
  },
  {
    label: 'Revisar estilo',
    needsChapter: true,
    prompt:
      'Haz una revisión de estilo del capítulo abierto: ritmo, repeticiones, adverbios, muletillas, diálogos y show-don’t-tell. Dame los 5 problemas más importantes con cita del fragmento y una reescritura propuesta para cada uno.',
  },
  {
    label: 'Detectar incoherencias',
    needsChapter: true,
    prompt:
      'Compara el capítulo abierto con la wiki y las relaciones. Enumera cualquier incoherencia (nombres, edades, lugares, reglas del mundo, cronología, relaciones) y cómo resolverla.',
  },
  {
    label: 'Siguiente escena',
    needsChapter: true,
    prompt:
      'Propón 3 posibles direcciones para la siguiente escena, cada una con un objetivo dramático, conflicto y gancho final. Ten en cuenta los arcos de los personajes.',
  },
  {
    label: 'Resumir capítulo',
    needsChapter: true,
    prompt: 'Resume el capítulo abierto en 3-4 frases, en presente y sin valoraciones, útil como sinopsis de capítulo.',
  },
  {
    label: 'Ideas de world-building',
    prompt:
      'Revisa la wiki y señala huecos importantes del world-building (economía, religión, política, geografía, sistema de magia/tecnología…). Propón 5 ideas concretas que encajen con lo ya definido.',
  },
  {
    label: 'Analizar personajes',
    prompt:
      'Analiza el reparto de personajes: ¿tienen motivaciones y defectos claros? ¿Hay redundancias o huecos en las relaciones? Propón mejoras concretas.',
  },
]
