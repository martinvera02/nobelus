import type { Chapter, Entity } from './db'
import { docToText } from './utils'

/**
 * Normaliza un texto (sin tildes, minúsculas) y guarda a qué posición del original corresponde cada carácter,
 * para poder buscar "accion" y encontrar «acción» sin perder la posición real.
 */
export function normalizeWithMap(text: string) {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const n = text[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    for (let k = 0; k < n.length; k++) {
      norm += n[k]
      map.push(i)
    }
  }
  map.push(text.length)
  return { norm, map }
}

export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Todas las coincidencias de `query` en `text`, como rangos [inicio, fin) del texto original. */
export function findAll(text: string, query: string): [number, number][] {
  const q = normalize(query.trim())
  if (!q) return []
  const { norm, map } = normalizeWithMap(text)
  const out: [number, number][] = []
  let i = norm.indexOf(q)
  while (i >= 0) {
    out.push([map[i], map[i + q.length - 1] + 1])
    i = norm.indexOf(q, i + q.length)
  }
  return out
}

export interface Snippet {
  before: string
  match: string
  after: string
}

export function snippet(text: string, [a, b]: [number, number], radius = 48): Snippet {
  const start = Math.max(0, a - radius)
  const end = Math.min(text.length, b + radius)
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, a).replace(/\s+/g, ' ').trimStart(),
    match: text.slice(a, b),
    after: text.slice(b, end).replace(/\s+/g, ' ').trimEnd() + (end < text.length ? '…' : ''),
  }
}

export interface TextHit {
  kind: 'chapter' | 'entity'
  id: string
  title: string
  count: number
  snippet: Snippet
}

/** Busca dentro del texto de capítulos y fichas. */
export function searchText(chapters: Chapter[], entities: Entity[], query: string, limit = 12): TextHit[] {
  if (query.trim().length < 3) return []
  const hits: TextHit[] = []
  for (const c of chapters) {
    const text = docToText(c.content)
    const m = findAll(text, query)
    if (m.length) hits.push({ kind: 'chapter', id: c.id, title: c.title, count: m.length, snippet: snippet(text, m[0]) })
  }
  for (const e of entities) {
    const text = [e.summary, ...Object.values(e.fields), docToText(e.content)].filter(Boolean).join('\n')
    const m = findAll(text, query)
    if (m.length) hits.push({ kind: 'entity', id: e.id, title: e.name, count: m.length, snippet: snippet(text, m[0]) })
  }
  return hits.sort((a, b) => b.count - a.count).slice(0, limit)
}
