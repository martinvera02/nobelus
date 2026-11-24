/**
 * Acciones estructurales que el asesor IA puede proponer.
 *
 * El modelo no toca la base de datos directamente: escribe un bloque ```nobelus con una lista JSON de acciones.
 * Nobelus las valida, las muestra como propuesta y solo las aplica cuando el autor pulsa «Aplicar».
 * Funciona igual con Ollama, OpenAI o Anthropic porque no depende del "tool calling" de cada proveedor.
 */
import { db, touchNovel, type Chapter, type ChapterStatus, type Entity, type EntityType, type Relation, type RelationKind } from './db'
import { RELATION_KINDS, STATUS, typeDef } from './schema'
import { uid } from './utils'

/* ---------- Tipos ---------- */

export type AgentAction =
  | { action: 'create_chapter'; title: string; synopsis?: string; status?: string; position?: number }
  | { action: 'update_chapter'; chapter: string | number; title?: string; synopsis?: string; status?: string }
  | { action: 'move_chapter'; chapter: string | number; position: number }
  | { action: 'delete_chapter'; chapter: string | number }
  | { action: 'create_entity'; type: string; name: string; summary?: string; fields?: Record<string, string>; tags?: string[] }
  | { action: 'update_entity'; entity: string; name?: string; summary?: string; fields?: Record<string, string>; tags?: string[] }
  | { action: 'create_relation'; from: string; to: string; kind?: string; label?: string }
  | { action: 'delete_relation'; from: string; to: string }

export interface PlannedAction {
  raw: AgentAction
  /** descripción legible para el autor */
  label: string
  detail?: string
  kind: 'create' | 'update' | 'move' | 'delete'
  ok: boolean
  error?: string
}

/* ---------- Instrucciones para el modelo ---------- */

export const AGENT_PROTOCOL = `## Cambios en la estructura
Puedes PROPONER cambios en la novela. Hazlo solo cuando el autor lo pida o cuando sea claramente útil para su petición.
Para proponerlos, escribe primero una explicación breve y después UN bloque de código con la etiqueta nobelus que contenga una lista JSON de acciones.
El autor revisará la propuesta y decidirá si aplicarla. No digas que los cambios ya están hechos.

Acciones disponibles (los capítulos se identifican por su número en la Estructura o por su título; las fichas por su nombre).
Los números de capítulo se refieren SIEMPRE a la Estructura actual, antes de tus cambios. Incluye solo acciones que cambien algo.
- {"action":"create_chapter","title":"…","synopsis":"…","status":"idea|borrador|revision|final","position":3}   (position opcional, 1 = primero)
- {"action":"update_chapter","chapter":2,"title":"…","synopsis":"…","status":"…"}   (solo los campos que cambian)
- {"action":"move_chapter","chapter":"Título o número","position":1}
- {"action":"delete_chapter","chapter":4}   (solo si el autor lo pide expresamente)
- {"action":"create_entity","type":"personaje|lugar|faccion|lore|objeto|evento","name":"…","summary":"…","fields":{"Rol":"…","Edad":"…"},"tags":["…"]}
- {"action":"update_entity","entity":"Nombre actual","name":"…","summary":"…","fields":{"Motivación":"…"},"tags":["…"]}
- {"action":"create_relation","from":"Nombre","to":"Nombre","kind":"familia|amor|amistad|alianza|mentor|rivalidad|enemistad|otro","label":"…"}
- {"action":"delete_relation","from":"Nombre","to":"Nombre"}

Campos útiles por tipo: personaje (Rol, Edad, Apariencia, Personalidad, Motivación, Defecto / herida, Arco, Voz); lugar (Tipo, Ubicación, Clima, Habitantes, Sensaciones); facción (Líder, Ideología, Sede, Recursos); lore (Categoría, Reglas / límites); objeto (Portador, Origen, Propiedades); evento (Fecha, Lugar, Implicados, Consecuencias).

Ejemplo:
\`\`\`nobelus
[
  {"action":"create_chapter","title":"Título","synopsis":"Qué ocurre","status":"idea","position":3},
  {"action":"update_chapter","chapter":2,"status":"revision"},
  {"action":"create_entity","type":"personaje","name":"Nombre","summary":"Una línea","fields":{"Rol":"Secundario"}},
  {"action":"create_relation","from":"Nombre","to":"Otro personaje","kind":"familia","label":"hermanos"}
]
\`\`\`
Usa JSON válido (comillas dobles, sin comentarios). Un solo bloque por respuesta.`

/* ---------- Extracción del bloque ---------- */

const BLOCK_RE = /```(?:nobelus|json)?\s*\n([\s\S]*?)```/g

/** Separa el texto visible de las acciones propuestas. */
export function extractActions(text: string): { text: string; actions: AgentAction[] | null; error?: string } {
  let found: string | null = null
  let stripped = text
  for (const m of text.matchAll(BLOCK_RE)) {
    const body = m[1]
    if (!/"action"\s*:/.test(body)) continue
    found = body
    stripped = stripped.replace(m[0], '')
  }
  // Bloque sin cerrar (respuesta aún en streaming o cortada)
  if (!found) {
    const open = text.match(/```nobelus\s*\n([\s\S]*)$/)
    if (open) return { text: text.slice(0, open.index).trim(), actions: null }
    return { text, actions: null }
  }
  try {
    const clean = found
      .replace(/\/\/.*$/gm, '')
      .replace(/,\s*([\]}])/g, '$1')
      .trim()
    const parsed = JSON.parse(clean)
    const list = (Array.isArray(parsed) ? parsed : [parsed]).filter((a) => a && typeof a.action === 'string')
    return { text: stripped.trim(), actions: list as AgentAction[] }
  } catch (e) {
    return { text: stripped.trim(), actions: null, error: `La propuesta de la IA no es JSON válido (${(e as Error).message}).` }
  }
}

/* ---------- Normalización ---------- */

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const STATUS_ALIASES: Record<string, ChapterStatus> = {
  idea: 'idea',
  borrador: 'draft',
  draft: 'draft',
  revision: 'revision',
  'en revision': 'revision',
  final: 'final',
  terminado: 'final',
}

const TYPE_ALIASES: Record<string, EntityType> = {
  personaje: 'character',
  character: 'character',
  lugar: 'location',
  location: 'location',
  faccion: 'faction',
  faction: 'faction',
  lore: 'lore',
  objeto: 'item',
  item: 'item',
  evento: 'event',
  event: 'event',
}

const toStatus = (s?: string) => (s ? STATUS_ALIASES[norm(s)] : undefined)
const toType = (s?: string) => TYPE_ALIASES[norm(s)]
const toKind = (s?: string): RelationKind => {
  const k = norm(s) as RelationKind
  return k in RELATION_KINDS ? k : 'otro'
}

/** Convierte etiquetas de campo ("Motivación") en sus claves internas ("goal"); lo desconocido se guarda tal cual. */
function mapFields(type: EntityType, fields?: Record<string, string>) {
  const out: Record<string, string> = {}
  if (!fields) return out
  const defs = typeDef(type).fields
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === '') continue
    const def = defs.find((f) => norm(f.label) === norm(k) || norm(f.key) === norm(k) || norm(f.label).startsWith(norm(k)))
    out[def?.key ?? k] = String(v)
  }
  return out
}

/* ---------- Simulación (sirve para la vista previa y para aplicar) ---------- */

interface State {
  chapters: Chapter[]
  entities: Entity[]
  relations: Relation[]
  deletedChapters: string[]
  deletedRelations: string[]
  /** orden original de los capítulos: los números que da la IA se refieren siempre a él */
  initialOrder: string[]
}

function findChapter(st: State, ref: string | number) {
  const ordered = [...st.chapters].sort((a, b) => a.order - b.order)
  const n = typeof ref === 'number' ? ref : /^\d+$/.test(String(ref).trim()) ? Number(ref) : NaN
  if (!Number.isNaN(n)) {
    const id = st.initialOrder[n - 1]
    return st.chapters.find((c) => c.id === id)
  }
  const r = norm(ref).replace(/^capitulo\s+\d+[:.\s-]*/, '')
  return ordered.find((c) => norm(c.title) === r) ?? ordered.find((c) => norm(c.title).includes(r) || r.includes(norm(c.title)))
}

function findEntity(st: State, ref: string) {
  const r = norm(ref)
  return (
    st.entities.find((e) => norm(e.name) === r) ??
    st.entities.find((e) => norm(e.name).split(' ')[0] === r.split(' ')[0] && r.length > 2) ??
    st.entities.find((e) => norm(e.name).includes(r))
  )
}

function reorder(list: Chapter[]) {
  list.sort((a, b) => a.order - b.order).forEach((c, i) => (c.order = i))
}

function step(st: State, a: AgentAction, novelId: string): PlannedAction {
  const now = Date.now()
  const base = { raw: a, ok: true } as const
  try {
    switch (a.action) {
      case 'create_chapter': {
        if (!a.title?.trim()) throw new Error('Falta el título')
        reorder(st.chapters)
        const pos = a.position ? Math.max(1, Math.min(a.position, st.chapters.length + 1)) : st.chapters.length + 1
        st.chapters.forEach((c) => c.order >= pos - 1 && c.order++)
        st.chapters.push({
          id: uid(),
          novelId,
          title: a.title.trim(),
          synopsis: a.synopsis,
          status: toStatus(a.status) ?? 'idea',
          order: pos - 1,
          words: 0,
          mentions: [],
          createdAt: now,
          updatedAt: now,
        })
        reorder(st.chapters)
        return { ...base, kind: 'create', label: `Nuevo capítulo ${pos}: «${a.title.trim()}»`, detail: a.synopsis }
      }
      case 'update_chapter': {
        const c = findChapter(st, a.chapter)
        if (!c) throw new Error(`No encuentro el capítulo «${a.chapter}»`)
        const old = c.title
        const changes: string[] = []
        if (a.title && a.title.trim() !== c.title) ((c.title = a.title.trim()), changes.push(`título → «${a.title.trim()}»`))
        if (a.synopsis !== undefined && a.synopsis !== (c.synopsis ?? '')) ((c.synopsis = a.synopsis), changes.push('sinopsis'))
        const s = toStatus(a.status)
        if (s && s !== c.status) ((c.status = s), changes.push(`estado → ${STATUS[s].label}`))
        if (!changes.length) throw new Error('Sin cambios: se ignora')
        c.updatedAt = now
        return { ...base, kind: 'update', label: `Capítulo «${old}»: ${changes.join(', ')}`, detail: a.synopsis }
      }
      case 'move_chapter': {
        const c = findChapter(st, a.chapter)
        if (!c) throw new Error(`No encuentro el capítulo «${a.chapter}»`)
        reorder(st.chapters)
        const list = [...st.chapters].sort((x, y) => x.order - y.order).filter((x) => x.id !== c.id)
        const pos = Math.max(1, Math.min(Number(a.position) || 1, list.length + 1))
        list.splice(pos - 1, 0, c)
        list.forEach((x, i) => (x.order = i))
        return { ...base, kind: 'move', label: `Mover «${c.title}» a la posición ${pos}` }
      }
      case 'delete_chapter': {
        const c = findChapter(st, a.chapter)
        if (!c) throw new Error(`No encuentro el capítulo «${a.chapter}»`)
        st.chapters = st.chapters.filter((x) => x.id !== c.id)
        st.deletedChapters.push(c.id)
        reorder(st.chapters)
        return {
          ...base,
          kind: 'delete',
          label: `Eliminar el capítulo «${c.title}»`,
          detail: c.words ? `Contiene ${c.words} palabras (se pueden recuperar con «Deshacer»)` : undefined,
        }
      }
      case 'create_entity': {
        const type = toType(a.type)
        if (!type) throw new Error(`Tipo desconocido «${a.type}»`)
        if (!a.name?.trim()) throw new Error('Falta el nombre')
        if (findEntity(st, a.name) && norm(findEntity(st, a.name)!.name) === norm(a.name)) throw new Error(`«${a.name}» ya existe`)
        let order: number | undefined
        if (type === 'event') order = Math.max(0, ...st.entities.filter((e) => e.type === 'event').map((e) => e.order ?? 0)) + 1
        st.entities.push({
          id: uid(),
          novelId,
          type,
          name: a.name.trim(),
          summary: a.summary,
          fields: mapFields(type, a.fields),
          tags: (a.tags ?? []).map((t) => norm(t)),
          order,
          createdAt: now,
          updatedAt: now,
        })
        return { ...base, kind: 'create', label: `Nueva ficha (${typeDef(type).label.toLowerCase()}): ${a.name.trim()}`, detail: a.summary }
      }
      case 'update_entity': {
        const e = findEntity(st, a.entity)
        if (!e) throw new Error(`No encuentro la ficha «${a.entity}»`)
        const changes: string[] = []
        const old = e.name
        if (a.name && a.name !== e.name) ((e.name = a.name), changes.push(`nombre → ${a.name}`))
        if (a.summary !== undefined && a.summary !== (e.summary ?? '')) ((e.summary = a.summary), changes.push('resumen'))
        const f = Object.fromEntries(Object.entries(mapFields(e.type, a.fields)).filter(([k, v]) => e.fields[k] !== v))
        if (Object.keys(f).length) {
          e.fields = { ...e.fields, ...f }
          changes.push(
            Object.keys(f)
              .map((k) => typeDef(e.type).fields.find((d) => d.key === k)?.label ?? k)
              .join(', '),
          )
        }
        if (a.tags?.length) {
          e.tags = [...new Set([...e.tags, ...a.tags.map((t) => norm(t))])]
          changes.push('etiquetas')
        }
        if (!changes.length) throw new Error('Sin cambios: se ignora')
        e.updatedAt = now
        return { ...base, kind: 'update', label: `${old}: ${changes.join(', ')}`, detail: a.summary }
      }
      case 'create_relation': {
        const from = findEntity(st, a.from)
        const to = findEntity(st, a.to)
        if (!from) throw new Error(`No encuentro «${a.from}»`)
        if (!to) throw new Error(`No encuentro «${a.to}»`)
        if (from.id === to.id) throw new Error('Relación consigo mismo')
        const kind = toKind(a.kind)
        st.relations.push({ id: uid(), novelId, source: from.id, target: to.id, kind, label: a.label, createdAt: now })
        return {
          ...base,
          kind: 'create',
          label: `Relación: ${from.name} → ${to.name} (${RELATION_KINDS[kind].label}${a.label ? `, ${a.label}` : ''})`,
        }
      }
      case 'delete_relation': {
        const from = findEntity(st, a.from)
        const to = findEntity(st, a.to)
        const rel = st.relations.find(
          (r) => (r.source === from?.id && r.target === to?.id) || (r.source === to?.id && r.target === from?.id),
        )
        if (!rel) throw new Error(`No hay relación entre «${a.from}» y «${a.to}»`)
        st.relations = st.relations.filter((r) => r.id !== rel.id)
        st.deletedRelations.push(rel.id)
        return { ...base, kind: 'delete', label: `Quitar la relación ${from!.name} ↔ ${to!.name}` }
      }
      default:
        throw new Error(`Acción desconocida «${(a as { action: string }).action}»`)
    }
  } catch (e) {
    return { raw: a, ok: false, kind: 'update', label: describeRaw(a), error: (e as Error).message }
  }
}

const VERB: Record<string, string> = {
  create_chapter: 'Nuevo capítulo',
  update_chapter: 'Capítulo',
  move_chapter: 'Mover capítulo',
  delete_chapter: 'Eliminar capítulo',
  create_entity: 'Nueva ficha',
  update_entity: 'Ficha',
  create_relation: 'Relación',
  delete_relation: 'Quitar relación',
}

function describeRaw(a: AgentAction): string {
  const r = a as Record<string, unknown>
  const what = r.title ?? r.name ?? r.chapter ?? r.entity ?? `${r.from ?? '?'} → ${r.to ?? '?'}`
  return `${VERB[String(r.action)] ?? String(r.action)} «${String(what)}»`
}

async function load(novelId: string): Promise<State> {
  const [chapters, entities, relations] = await Promise.all([
    db.chapters.where('novelId').equals(novelId).toArray(),
    db.entities.where('novelId').equals(novelId).toArray(),
    db.relations.where('novelId').equals(novelId).toArray(),
  ])
  const initialOrder = [...chapters].sort((a, b) => a.order - b.order).map((c) => c.id)
  return { chapters, entities, relations, deletedChapters: [], deletedRelations: [], initialOrder }
}

const clone = <T>(v: T): T => structuredClone(v)

/** Calcula qué haría cada acción, sin tocar la base de datos. */
export async function previewActions(novelId: string, actions: AgentAction[]): Promise<PlannedAction[]> {
  const st = clone(await load(novelId))
  return actions.map((a) => step(st, a, novelId))
}

export interface UndoSnapshot {
  novelId: string
  /** estado previo de los capítulos modificados o eliminados */
  chapters: Chapter[]
  createdChapters: string[]
  /** estado previo de las fichas modificadas */
  entities: Entity[]
  createdEntities: string[]
  /** relaciones eliminadas (para recuperarlas) y creadas (para quitarlas) */
  deletedRelations: Relation[]
  createdRelations: string[]
}

/**
 * Aplica las acciones seleccionadas en una única transacción.
 * Devuelve el resultado de cada acción y una instantánea mínima para deshacer solo lo que se cambió.
 */
export async function applyActions(novelId: string, actions: AgentAction[]) {
  let results: PlannedAction[] = []
  let snapshot: UndoSnapshot | null = null
  await db.transaction('rw', [db.chapters, db.entities, db.relations], async () => {
    const before = await load(novelId)
    const st = clone(before)
    results = actions.map((a) => step(st, a, novelId))

    const prevC = new Map(before.chapters.map((c) => [c.id, c]))
    const prevE = new Map(before.entities.map((e) => [e.id, e]))
    const prevR = new Map(before.relations.map((r) => [r.id, r]))
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

    const changedC = st.chapters.filter((c) => !same(prevC.get(c.id), c))
    const changedE = st.entities.filter((e) => !same(prevE.get(e.id), e))
    const createdR = st.relations.filter((r) => !prevR.has(r.id))

    snapshot = {
      novelId,
      chapters: clone([
        ...changedC.filter((c) => prevC.has(c.id)).map((c) => prevC.get(c.id)!),
        ...st.deletedChapters.map((id) => prevC.get(id)!).filter(Boolean),
      ]),
      createdChapters: changedC.filter((c) => !prevC.has(c.id)).map((c) => c.id),
      entities: clone(changedE.filter((e) => prevE.has(e.id)).map((e) => prevE.get(e.id)!)),
      createdEntities: changedE.filter((e) => !prevE.has(e.id)).map((e) => e.id),
      deletedRelations: clone(st.deletedRelations.map((id) => prevR.get(id)!).filter(Boolean)),
      createdRelations: createdR.map((r) => r.id),
    }

    await db.chapters.bulkPut(changedC)
    await db.entities.bulkPut(changedE)
    if (st.deletedChapters.length) await db.chapters.bulkDelete(st.deletedChapters)
    await db.relations.bulkAdd(createdR)
    if (st.deletedRelations.length) await db.relations.bulkDelete(st.deletedRelations)
  })
  touchNovel(novelId)
  return { results, snapshot: snapshot as UndoSnapshot | null }
}

/**
 * Deshace un conjunto de cambios: solo toca lo que esas acciones modificaron.
 * Conserva el texto escrito en los capítulos; un capítulo creado por la IA en el que ya has escrito no se borra.
 * Devuelve cuántos capítulos se conservaron por tener texto.
 */
export async function undoActions(snap: UndoSnapshot): Promise<{ keptChapters: number }> {
  let keptChapters = 0
  await db.transaction('rw', [db.chapters, db.entities, db.relations], async () => {
    for (const id of snap.createdChapters) {
      const c = await db.chapters.get(id)
      if (!c) continue
      if (c.words) keptChapters++
      else await db.chapters.delete(id)
    }
    for (const b of snap.chapters) {
      const now = await db.chapters.get(b.id)
      if (now) await db.chapters.update(b.id, { title: b.title, synopsis: b.synopsis, status: b.status, order: b.order })
      else await db.chapters.add(b)
    }
    await db.entities.bulkDelete(snap.createdEntities)
    await db.entities.bulkPut(snap.entities)
    await db.relations.bulkDelete(snap.createdRelations)
    await db.relations.bulkPut(snap.deletedRelations)
  })
  touchNovel(snap.novelId)
  return { keptChapters }
}
