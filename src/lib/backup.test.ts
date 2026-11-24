import { beforeEach, describe, expect, it } from 'vitest'
import { db, deleteNovel } from './db'
import { buildLibraryBackup, createSampleNovel, restoreNovel } from './backup'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('copias de seguridad', () => {
  it('restaura una novela borrada con sus ids originales', async () => {
    const id = await createSampleNovel()
    const lib = await buildLibraryBackup()
    await deleteNovel(id)
    expect(await db.chapters.count()).toBe(0)

    const restored = await restoreNovel(lib.novels[0])
    expect(restored).toBe(id)
    expect(await db.chapters.where('novelId').equals(id).count()).toBe(2)
    expect(await db.relations.where('novelId').equals(id).count()).toBe(3)
  })

  it('si la novela existe, importa una copia con ids nuevos y menciones reenlazadas', async () => {
    const id = await createSampleNovel()
    const lib = await buildLibraryBackup()
    const copyId = await restoreNovel(lib.novels[0])
    expect(copyId).not.toBe(id)

    const copy = await db.novels.get(copyId)
    expect(copy?.title).toMatch(/\(copia\)$/)

    const copyEntities = new Set((await db.entities.where('novelId').equals(copyId).toArray()).map((e) => e.id))
    const chapter = (await db.chapters.where('novelId').equals(copyId).toArray()).find((c) => c.mentions.length)!
    // Las menciones apuntan a las fichas de la copia, no a las originales
    expect(chapter.mentions.every((m) => copyEntities.has(m))).toBe(true)
    const json = JSON.stringify(chapter.content)
    for (const m of chapter.mentions) expect(json).toContain(m)

    const rels = await db.relations.where('novelId').equals(copyId).toArray()
    expect(rels).toHaveLength(3)
    expect(rels.every((r) => copyEntities.has(r.source) && copyEntities.has(r.target))).toBe(true)
  })
})
