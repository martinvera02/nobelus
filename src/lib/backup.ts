import { db, type Chapter, type Entity, type Novel, type Relation } from './db'
import { countWords, docToMarkdown, docToText, download, slug, uid } from './utils'

export interface NovelBackup {
  app: 'nobelus'
  version: 1
  exportedAt: string
  novel: Novel
  chapters: Chapter[]
  entities: Entity[]
  relations: Relation[]
}

/** Copia de toda la biblioteca (lo que guardan las copias automáticas). */
export interface LibraryBackup {
  app: 'nobelus'
  version: 1
  kind: 'library'
  exportedAt: string
  novels: NovelBackup[]
}

export async function buildNovelBackup(novelId: string): Promise<NovelBackup | null> {
  const novel = await db.novels.get(novelId)
  if (!novel) return null
  return {
    app: 'nobelus',
    version: 1,
    exportedAt: new Date().toISOString(),
    novel,
    chapters: await db.chapters.where('novelId').equals(novelId).sortBy('order'),
    entities: await db.entities.where('novelId').equals(novelId).toArray(),
    relations: await db.relations.where('novelId').equals(novelId).toArray(),
  }
}

export async function buildLibraryBackup(): Promise<LibraryBackup> {
  const novels = await db.novels.toArray()
  const list = (await Promise.all(novels.map((n) => buildNovelBackup(n.id)))).filter(Boolean) as NovelBackup[]
  return { app: 'nobelus', version: 1, kind: 'library', exportedAt: new Date().toISOString(), novels: list }
}

export async function exportNovelJSON(novelId: string) {
  const data = await buildNovelBackup(novelId)
  if (data) download(`${slug(data.novel.title)}.nobelus.json`, JSON.stringify(data, null, 2))
}

export async function exportLibraryJSON() {
  const data = await buildLibraryBackup()
  download(`nobelus-biblioteca-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data))
}

export async function exportManuscriptMarkdown(novelId: string) {
  const novel = await db.novels.get(novelId)
  if (!novel) return
  const chapters = await db.chapters.where('novelId').equals(novelId).sortBy('order')
  const md = [
    `# ${novel.title}`,
    novel.subtitle ? `*${novel.subtitle}*` : '',
    ...chapters.map((c) => `\n\n## ${c.title}\n\n${docToMarkdown(c.content)}`),
  ].join('\n')
  download(`${slug(novel.title)}.md`, md, 'text/markdown')
}

/**
 * Restaura una novela de una copia.
 * Si la novela ya no existe (p. ej. se borraron los datos del navegador) se recupera con sus ids originales;
 * si existe, se importa como una copia nueva para no pisar nada.
 */
export async function restoreNovel(data: NovelBackup): Promise<string> {
  const exists = !!(await db.novels.get(data.novel.id))
  const map = new Map<string, string>()
  const remap = (id: string) => {
    if (!exists) return id
    if (!map.has(id)) map.set(id, uid())
    return map.get(id)!
  }
  const now = Date.now()
  const novelId = remap(data.novel.id)
  data.entities.forEach((e) => remap(e.id))

  // Reescribe ids de menciones dentro de los documentos
  const fixDoc = <T>(doc: T): T =>
    doc && exists ? JSON.parse(JSON.stringify(doc), (k, v) => (k === 'id' && typeof v === 'string' && map.has(v) ? map.get(v) : v)) : doc

  await db.transaction('rw', [db.novels, db.chapters, db.entities, db.relations], async () => {
    await db.novels.add({ ...data.novel, id: novelId, title: exists ? `${data.novel.title} (copia)` : data.novel.title, updatedAt: now })
    await db.chapters.bulkAdd(
      data.chapters.map((c) => ({
        ...c,
        id: exists ? uid() : c.id,
        novelId,
        content: fixDoc(c.content),
        mentions: c.mentions.map((m) => map.get(m) ?? m),
      })),
    )
    await db.entities.bulkAdd(data.entities.map((e) => ({ ...e, id: remap(e.id), novelId, content: fixDoc(e.content) })))
    await db.relations.bulkAdd(
      data.relations
        .filter((r) => !exists || (map.has(r.source) && map.has(r.target)))
        .map((r) => ({ ...r, id: exists ? uid() : r.id, novelId, source: remap(r.source), target: remap(r.target) })),
    )
  })
  return novelId
}

/** Importa un archivo de copia (de una novela o de la biblioteca entera). Devuelve los ids importados. */
export async function importBackupFile(file: File): Promise<string[]> {
  let data: NovelBackup | LibraryBackup
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('El archivo no es JSON válido')
  }
  if (data?.app !== 'nobelus') throw new Error('El archivo no es una copia de Nobelus')
  if ('kind' in data && data.kind === 'library') {
    const ids: string[] = []
    for (const n of data.novels) ids.push(await restoreNovel(n))
    return ids
  }
  if (!('novel' in data)) throw new Error('Copia de Nobelus incompleta')
  return [await restoreNovel(data)]
}

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** Crea una novela de ejemplo para explorar la app. */
export async function createSampleNovel(): Promise<string> {
  const now = Date.now()
  const novelId = uid()
  const ids = {
    mara: uid(),
    oren: uid(),
    velka: uid(),
    puerto: uid(),
    orden: uid(),
    mareas: uid(),
    brujula: uid(),
    naufragio: uid(),
    juramento: uid(),
  }

  const ent = (e: Partial<Entity> & Pick<Entity, 'id' | 'type' | 'name'>): Entity => ({
    novelId,
    fields: {},
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...e,
  })

  const mention = (id: string, label: string) => ({ type: 'mention', attrs: { id, label } })

  await db.transaction('rw', [db.novels, db.chapters, db.entities, db.relations], async () => {
    await db.novels.add({
      id: novelId,
      title: 'La cartógrafa de mareas',
      subtitle: 'Libro I',
      genre: 'Fantasía náutica',
      synopsis:
        'Mara, una cartógrafa sin gremio, hereda una brújula que no señala el norte sino la próxima gran marea. La Orden del Faro la quiere muerta antes de que descubra qué se esconde bajo el Puerto Sumergido.',
      color: '#1f8a70',
      emoji: '🌊',
      targetWords: 90000,
      createdAt: now,
      updatedAt: now,
    })

    await db.entities.bulkAdd([
      ent({
        id: ids.mara,
        type: 'character',
        name: 'Mara Ilvent',
        emoji: '🧭',
        summary: 'Cartógrafa expulsada del gremio; terca y brillante.',
        fields: {
          role: 'Protagonista',
          age: '27 años',
          goal: 'Demostrar que los mapas de su padre eran ciertos.',
          flaw: 'No confía en nadie, ni siquiera en sí misma.',
          arc: 'De la soledad orgullosa a aceptar una tripulación.',
        },
        tags: ['tripulación'],
        pos: { x: 0, y: 0 },
      }),
      ent({
        id: ids.oren,
        type: 'character',
        name: 'Oren Dace',
        emoji: '⚓',
        summary: 'Contrabandista con deudas y buen corazón.',
        fields: { role: 'Aliado', age: '31 años', voice: 'Habla en refranes de marinero.' },
        tags: ['tripulación'],
        pos: { x: 320, y: -60 },
      }),
      ent({
        id: ids.velka,
        type: 'character',
        name: 'Madre Velka',
        emoji: '🕯️',
        summary: 'Suma sacerdotisa de la Orden del Faro.',
        fields: { role: 'Antagonista', age: '58 años', goal: 'Que nadie cartografíe las mareas profundas.' },
        pos: { x: 160, y: 240 },
      }),
      ent({
        id: ids.orden,
        type: 'faction',
        name: 'Orden del Faro',
        emoji: '🗼',
        summary: 'Culto que controla las rutas marítimas.',
        fields: { leader: 'Madre Velka', base: 'El Faro Negro' },
        pos: { x: 440, y: 220 },
      }),
      ent({
        id: ids.puerto,
        type: 'location',
        name: 'Puerto Sumergido',
        emoji: '🏚️',
        summary: 'Ciudad que solo emerge en las mareas vivas.',
        fields: { kind: 'Ciudad', senses: 'Sal, campanas ahogadas, algas en los tejados.' },
      }),
      ent({
        id: ids.mareas,
        type: 'lore',
        name: 'Las Mareas Vivas',
        emoji: '🌕',
        summary: 'Mareas que alteran la geografía cada siete años.',
        fields: { category: 'Magia', rules: 'Solo se pueden predecir con instrumentos de hueso de ballena.' },
      }),
      ent({
        id: ids.brujula,
        type: 'item',
        name: 'La brújula de hueso',
        emoji: '🧭',
        summary: 'Señala la próxima gran marea.',
        fields: { owner: 'Mara Ilvent', origin: 'Tallada por su padre.' },
      }),
      ent({
        id: ids.naufragio,
        type: 'event',
        name: 'Naufragio del Albatros',
        summary: 'Muere el padre de Mara.',
        order: 1,
        fields: { date: 'Año 412, invierno', place: 'Estrecho de Hesk' },
      }),
      ent({
        id: ids.juramento,
        type: 'event',
        name: 'Mara recibe la brújula',
        summary: 'Comienza la novela.',
        order: 2,
        fields: { date: 'Año 419, primavera', place: 'Puerto de Lisle' },
      }),
    ])

    await db.relations.bulkAdd([
      { id: uid(), novelId, source: ids.mara, target: ids.oren, kind: 'amistad', label: 'socios a regañadientes', createdAt: now },
      { id: uid(), novelId, source: ids.velka, target: ids.mara, kind: 'enemistad', label: 'quiere la brújula', createdAt: now },
      { id: uid(), novelId, source: ids.velka, target: ids.orden, kind: 'alianza', label: 'lidera', createdAt: now },
    ])

    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'La brújula llegó envuelta en una vela vieja, con olor a brea y a muerto. ' },
            mention(ids.mara, 'Mara Ilvent'),
            { type: 'text', text: ' supo que era de su padre antes de deshacer el nudo.' },
          ],
        },
        p(
          'No señalaba el norte. Nunca lo había hecho. La aguja temblaba hacia el oeste, hacia mar abierto, como un perro que huele tormenta.',
        ),
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '—Eso vale más que tu vida, cartógrafa —dijo ' },
            mention(ids.oren, 'Oren Dace'),
            { type: 'text', text: ' desde la puerta—. Y la Orden lo sabe.' },
          ],
        },
      ],
    }

    await db.chapters.bulkAdd([
      {
        id: uid(),
        novelId,
        title: 'La brújula de hueso',
        status: 'draft',
        order: 0,
        content,
        words: countWords(docToText(content)),
        mentions: [ids.mara, ids.oren],
        synopsis: 'Mara recibe la brújula de su padre y Oren le advierte del peligro.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uid(),
        novelId,
        title: 'El Faro Negro',
        status: 'idea',
        order: 1,
        words: 0,
        mentions: [],
        synopsis: 'Primera aparición de Madre Velka.',
        createdAt: now,
        updatedAt: now,
      },
    ])
  })
  return novelId
}
