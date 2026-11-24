import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { applyActions, extractActions, previewActions, undoActions, type AgentAction } from './agent'
import { createSampleNovel } from './backup'

let novelId: string

beforeEach(async () => {
  await db.delete()
  await db.open()
  novelId = await createSampleNovel()
})

const chapters = async () => (await db.chapters.where('novelId').equals(novelId).sortBy('order')).map((c) => [c.title, c.status])

describe('extractActions', () => {
  it('separa el texto visible del bloque de acciones', () => {
    const r = extractActions('Te propongo esto:\n\n```nobelus\n[{"action":"create_chapter","title":"X"}]\n```')
    expect(r.text).toBe('Te propongo esto:')
    expect(r.actions).toHaveLength(1)
  })
  it('tolera comas finales y comentarios', () => {
    const r = extractActions('```nobelus\n[\n {"action":"move_chapter","chapter":2,"position":1}, // mover\n]\n```')
    expect(r.actions?.[0]).toMatchObject({ action: 'move_chapter', position: 1 })
  })
  it('acepta un único objeto', () => {
    expect(extractActions('```json\n{"action":"delete_chapter","chapter":1}\n```').actions).toHaveLength(1)
  })
  it('informa de JSON roto sin lanzar', () => {
    const r = extractActions('```nobelus\n[{"action":"create_chapter", title: X}]\n```')
    expect(r.actions).toBeNull()
    expect(r.error).toMatch(/JSON/)
  })
  it('oculta un bloque aún sin cerrar (streaming)', () => {
    const r = extractActions('Vale.\n```nobelus\n[{"action":')
    expect(r.text).toBe('Vale.')
    expect(r.actions).toBeNull()
  })
  it('ignora bloques de código que no son acciones', () => {
    expect(extractActions('```json\n{"a":1}\n```').actions).toBeNull()
  })
})

describe('previewActions', () => {
  it('no modifica la base de datos', async () => {
    const before = await chapters()
    await previewActions(novelId, [{ action: 'create_chapter', title: 'Nuevo' }])
    expect(await chapters()).toEqual(before)
  })
  it('marca como error lo que no puede resolver', async () => {
    const p = await previewActions(novelId, [
      { action: 'update_chapter', chapter: 9, status: 'final' },
      { action: 'create_relation', from: 'Nadie', to: 'Mara Ilvent' },
      { action: 'create_entity', type: 'dragón', name: 'X' },
    ])
    expect(p.every((a) => !a.ok)).toBe(true)
  })
})

describe('applyActions', () => {
  it('los números de capítulo se refieren a la estructura original', async () => {
    // Tras insertar en la posición 2, «capítulo 2» sigue siendo El Faro Negro
    const actions: AgentAction[] = [
      { action: 'create_chapter', title: 'El muelle', position: 2 },
      { action: 'update_chapter', chapter: 2, status: 'revisión' },
    ]
    await applyActions(novelId, actions)
    expect(await chapters()).toEqual([
      ['La brújula de hueso', 'draft'],
      ['El muelle', 'idea'],
      ['El Faro Negro', 'revision'],
    ])
  })

  it('traduce tipos, campos y relaciones en español', async () => {
    await applyActions(novelId, [
      {
        action: 'create_entity',
        type: 'personaje',
        name: 'Elara Dace',
        fields: { Rol: 'Secundario', Motivación: 'Pagar deudas', Mascota: 'Gato' },
      },
      { action: 'create_relation', from: 'Elara Dace', to: 'Oren', kind: 'familia', label: 'hermanos' },
    ])
    const elara = await db.entities.where('name').equals('Elara Dace').first()
    expect(elara?.type).toBe('character')
    expect(elara?.fields).toEqual({ role: 'Secundario', goal: 'Pagar deudas', Mascota: 'Gato' })
    const rel = await db.relations.where('source').equals(elara!.id).first()
    expect(rel?.kind).toBe('familia')
  })

  it('reordena capítulos', async () => {
    await applyActions(novelId, [{ action: 'move_chapter', chapter: 'El Faro Negro', position: 1 }])
    expect((await chapters()).map((c) => c[0])).toEqual(['El Faro Negro', 'La brújula de hueso'])
  })

  it('ignora los cambios que no cambian nada', async () => {
    const { results } = await applyActions(novelId, [{ action: 'update_chapter', chapter: 2, title: 'El Faro Negro' }])
    expect(results[0].ok).toBe(false)
  })
})

describe('undoActions', () => {
  it('revierte exactamente lo aplicado', async () => {
    const before = await chapters()
    const relsBefore = await db.relations.count()
    const { snapshot } = await applyActions(novelId, [
      { action: 'create_chapter', title: 'Nuevo', position: 1 },
      { action: 'update_chapter', chapter: 1, status: 'final', title: 'Renombrado' },
      { action: 'delete_chapter', chapter: 2 },
      { action: 'create_entity', type: 'lugar', name: 'Hesk' },
      { action: 'update_entity', entity: 'Oren Dace', summary: 'Cambiado' },
      { action: 'delete_relation', from: 'Mara Ilvent', to: 'Oren Dace' },
    ])
    await undoActions(snapshot!)
    expect(await chapters()).toEqual(before)
    expect(await db.entities.where('name').equals('Hesk').count()).toBe(0)
    expect((await db.entities.where('name').equals('Oren Dace').first())?.summary).toBe('Contrabandista con deudas y buen corazón.')
    expect(await db.relations.count()).toBe(relsBefore)
  })

  it('no borra un capítulo creado por la IA si ya tiene texto', async () => {
    const { snapshot } = await applyActions(novelId, [{ action: 'create_chapter', title: 'Con texto' }])
    const created = (await db.chapters.toArray()).find((c) => c.title === 'Con texto')
    await db.chapters.update(created!.id, { words: 120 })
    const { keptChapters } = await undoActions(snapshot!)
    expect(keptChapters).toBe(1)
    expect(await db.chapters.get(created!.id)).toBeTruthy()
  })

  it('no toca cambios posteriores en otras fichas', async () => {
    const { snapshot } = await applyActions(novelId, [{ action: 'update_entity', entity: 'Oren Dace', summary: 'IA' }])
    const mara = await db.entities.where('name').equals('Mara Ilvent').first()
    await db.entities.update(mara!.id, { summary: 'Editado a mano después' })
    await undoActions(snapshot!)
    expect((await db.entities.get(mara!.id))?.summary).toBe('Editado a mano después')
  })
})
