import Dexie, { type EntityTable } from 'dexie'
import type { JSONContent } from '@tiptap/react'
import type { UndoSnapshot } from './agent'

export type ChapterStatus = 'idea' | 'draft' | 'revision' | 'final'

export type EntityType = 'character' | 'location' | 'faction' | 'lore' | 'item' | 'event'

export interface Novel {
  id: string
  title: string
  subtitle?: string
  genre?: string
  synopsis?: string
  color: string
  emoji: string
  targetWords?: number
  createdAt: number
  updatedAt: number
}

export interface Chapter {
  id: string
  novelId: string
  title: string
  synopsis?: string
  status: ChapterStatus
  order: number
  content?: JSONContent
  words: number
  /** ids de entidades de la wiki mencionadas con @ */
  mentions: string[]
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface Entity {
  id: string
  novelId: string
  type: EntityType
  name: string
  summary?: string
  emoji?: string
  color?: string
  /** imagen (dataURL reducida) */
  image?: string
  fields: Record<string, string>
  tags: string[]
  content?: JSONContent
  /** posición en el diagrama de relaciones */
  pos?: { x: number; y: number }
  /** orden en la cronología (solo eventos) */
  order?: number
  createdAt: number
  updatedAt: number
}

export type RelationKind = 'familia' | 'amor' | 'amistad' | 'alianza' | 'mentor' | 'rivalidad' | 'enemistad' | 'otro'

export interface Relation {
  id: string
  novelId: string
  source: string
  target: string
  kind: RelationKind
  label?: string
  notes?: string
  createdAt: number
}

export interface AIMessage {
  id: string
  novelId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  /** estado de los cambios propuestos por la IA en este mensaje */
  actionsState?: 'applied' | 'undone' | 'dismissed'
  /** resumen de lo aplicado (para mostrarlo aunque la novela cambie después) */
  appliedLabels?: string[]
}

export interface UndoRecord {
  /** id del mensaje del asesor que propuso los cambios */
  id: string
  novelId: string
  snapshot: UndoSnapshot
  createdAt: number
}

/** Almacén clave-valor para ajustes que no caben en localStorage (p. ej. la carpeta de copias). */
export interface KV {
  key: string
  value: unknown
}

export const db = new Dexie('nobelus') as Dexie & {
  novels: EntityTable<Novel, 'id'>
  chapters: EntityTable<Chapter, 'id'>
  entities: EntityTable<Entity, 'id'>
  relations: EntityTable<Relation, 'id'>
  messages: EntityTable<AIMessage, 'id'>
  undos: EntityTable<UndoRecord, 'id'>
  kv: EntityTable<KV, 'key'>
}

db.version(1).stores({
  novels: 'id, updatedAt',
  chapters: 'id, novelId, [novelId+order], updatedAt, *mentions',
  entities: 'id, novelId, [novelId+type], name, updatedAt',
  relations: 'id, novelId, source, target',
  messages: 'id, novelId, createdAt',
})

db.version(2).stores({
  undos: 'id, novelId',
  kv: 'key',
})

export async function touchNovel(novelId: string) {
  await db.novels.update(novelId, { updatedAt: Date.now() })
}

export async function deleteNovel(novelId: string) {
  await db.transaction('rw', [db.novels, db.chapters, db.entities, db.relations, db.messages, db.undos], async () => {
    await db.undos.where('novelId').equals(novelId).delete()
    await db.chapters.where('novelId').equals(novelId).delete()
    await db.entities.where('novelId').equals(novelId).delete()
    await db.relations.where('novelId').equals(novelId).delete()
    await db.messages.where('novelId').equals(novelId).delete()
    await db.novels.delete(novelId)
  })
}

export async function deleteEntity(entityId: string) {
  await db.transaction('rw', [db.entities, db.relations], async () => {
    await db.relations.where('source').equals(entityId).delete()
    await db.relations.where('target').equals(entityId).delete()
    await db.entities.delete(entityId)
  })
}
