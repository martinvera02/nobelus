import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/react'
import { countWords, docMentions, docToMarkdown, docToText, slug } from './utils'

const doc: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'El puerto' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Llegó ' },
        { type: 'mention', attrs: { id: 'm1', label: 'Mara Ilvent' } },
        { type: 'text', text: ' de noche, ' },
        { type: 'text', text: 'empapada', marks: [{ type: 'italic' }] },
        { type: 'text', text: '.' },
      ],
    },
    { type: 'horizontalRule' },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nadie vuelve del mar.' }] }] },
    {
      type: 'paragraph',
      content: [
        { type: 'mention', attrs: { id: 'm1', label: 'Mara Ilvent' } },
        { type: 'mention', attrs: { id: 'm2', label: 'Oren' } },
      ],
    },
  ],
}

describe('countWords', () => {
  it('cuenta palabras con tildes, apóstrofos y guiones', () => {
    expect(countWords('—Eso vale más que tu vida, cartógrafa —dijo.')).toBe(8)
    expect(countWords("l'aigua és freda")).toBe(3)
    expect(countWords('   ')).toBe(0)
  })
})

describe('docToText', () => {
  it('incluye las menciones por su nombre y separa los bloques', () => {
    const t = docToText(doc)
    expect(t).toContain('Llegó Mara Ilvent de noche, empapada.')
    expect(t).toContain('* * *')
    expect(t.split('\n\n')).toHaveLength(5)
  })
  it('devuelve cadena vacía sin documento', () => {
    expect(docToText(undefined)).toBe('')
  })
})

describe('docMentions', () => {
  it('devuelve cada entidad mencionada una sola vez', () => {
    expect(docMentions(doc).sort()).toEqual(['m1', 'm2'])
  })
})

describe('docToMarkdown', () => {
  it('convierte títulos, cursivas, separadores y citas', () => {
    const md = docToMarkdown(doc)
    expect(md).toContain('## El puerto')
    expect(md).toContain('*empapada*')
    expect(md).toContain('* * *')
    expect(md).toContain('> Nadie vuelve del mar.')
  })
})

describe('slug', () => {
  it('quita tildes y signos', () => {
    expect(slug('La cartógrafa de mareas: Libro I')).toBe('la-cartografa-de-mareas-libro-i')
    expect(slug('¿?')).toBe('novela')
  })
})
