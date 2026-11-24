import { describe, expect, it } from 'vitest'
import { findAll, snippet } from './search'

describe('findAll', () => {
  it('ignora tildes y mayúsculas pero devuelve la posición real', () => {
    const text = 'La Canción del mar. Otra cancion.'
    const hits = findAll(text, 'cancion')
    expect(hits).toHaveLength(2)
    expect(text.slice(...hits[0])).toBe('Canción')
    expect(text.slice(...hits[1])).toBe('cancion')
  })
  it('encuentra frases con tildes buscando sin ellas', () => {
    const text = 'como un perro que huele tormenta'
    expect(text.slice(...findAll(text, 'PERRO QUE')[0])).toBe('perro que')
  })
  it('no devuelve nada con una búsqueda vacía', () => {
    expect(findAll('texto', '  ')).toEqual([])
  })
})

describe('snippet', () => {
  it('recorta alrededor de la coincidencia con puntos suspensivos', () => {
    const text = 'a'.repeat(100) + 'AGUJA' + 'b'.repeat(100)
    const s = snippet(text, [100, 105], 10)
    expect(s.match).toBe('AGUJA')
    expect(s.before.startsWith('…')).toBe(true)
    expect(s.after.endsWith('…')).toBe(true)
  })
})
