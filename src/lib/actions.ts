import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, touchNovel, type Chapter, type EntityType } from './db'
import { typeDef } from './schema'
import { uid } from './utils'

export async function createChapter(novelId: string, title?: string) {
  const last = await db.chapters.where('[novelId+order]').between([novelId, -Infinity], [novelId, Infinity]).last()
  const count = await db.chapters.where('novelId').equals(novelId).count()
  const now = Date.now()
  const id = uid()
  await db.chapters.add({
    id,
    novelId,
    title: title ?? `Capítulo ${count + 1}`,
    status: 'draft',
    order: (last?.order ?? -1) + 1,
    words: 0,
    mentions: [],
    createdAt: now,
    updatedAt: now,
  })
  touchNovel(novelId)
  return id
}

export async function createEntity(novelId: string, type: EntityType, name?: string) {
  const now = Date.now()
  const id = uid()
  let order: number | undefined
  if (type === 'event') {
    const events = await db.entities.where('[novelId+type]').equals([novelId, 'event']).toArray()
    order = Math.max(0, ...events.map((e) => e.order ?? 0)) + 1
  }
  await db.entities.add({
    id,
    novelId,
    type,
    name: name ?? `${typeDef(type).label} sin nombre`,
    fields: {},
    tags: [],
    order,
    createdAt: now,
    updatedAt: now,
  })
  touchNovel(novelId)
  return id
}

/** Reordena capítulos moviendo `fromId` a la posición de `toId`. */
export async function moveChapter(chapters: Chapter[], fromId: string, toId: string) {
  const list = [...chapters]
  const from = list.findIndex((c) => c.id === fromId)
  const to = list.findIndex((c) => c.id === toId)
  if (from < 0 || to < 0 || from === to) return
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  await db.transaction('rw', db.chapters, async () => {
    await Promise.all(list.map((c, i) => (c.order !== i ? db.chapters.update(c.id, { order: i }) : null)))
  })
}

export function useNovelData() {
  const { novelId = '' } = useParams()
  const novel = useLiveQuery(async () => (await db.novels.get(novelId)) ?? null, [novelId])
  const chapters = useLiveQuery(
    () => db.chapters.where('[novelId+order]').between([novelId, -Infinity], [novelId, Infinity]).toArray(),
    [novelId],
  )
  const entities = useLiveQuery(() => db.entities.where('novelId').equals(novelId).sortBy('name'), [novelId])
  return { novelId, novel, chapters, entities }
}
