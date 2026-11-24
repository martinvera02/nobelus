import clsx, { type ClassValue } from 'clsx'
import type { JSONContent } from '@tiptap/react'

export const cn = (...v: ClassValue[]) => clsx(v)

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 16)

export function countWords(text: string) {
  const m = text.trim().match(/[\p{L}\p{N}'’-]+/gu)
  return m ? m.length : 0
}

export function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000)
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
  if (s < 45) return 'ahora mismo'
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour')
  if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), 'day')
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const fmt = (n: number) => n.toLocaleString('es-ES')

/** Extrae texto plano de un documento TipTap (sin depender de un editor montado). */
export function docToText(doc?: JSONContent): string {
  if (!doc) return ''
  const out: string[] = []
  const walk = (n: JSONContent, buf: string[]) => {
    if (n.type === 'text') buf.push(n.text ?? '')
    else if (n.type === 'mention') buf.push(String(n.attrs?.label ?? ''))
    else if (n.type === 'hardBreak') buf.push('\n')
    n.content?.forEach((c) => walk(c, buf))
  }
  doc.content?.forEach((block) => {
    const buf: string[] = []
    walk(block, buf)
    out.push(block.type === 'horizontalRule' ? '* * *' : buf.join(''))
  })
  return out.join('\n\n').trim()
}

/** Recoge los ids de entidades mencionadas con @ en un documento. */
export function docMentions(doc?: JSONContent): string[] {
  const ids = new Set<string>()
  const walk = (n: JSONContent) => {
    if (n.type === 'mention' && n.attrs?.id) ids.add(String(n.attrs.id))
    n.content?.forEach(walk)
  }
  if (doc) walk(doc)
  return [...ids]
}

/** Convierte un documento TipTap a Markdown (lo justo para exportar manuscritos). */
export function docToMarkdown(doc?: JSONContent): string {
  if (!doc?.content) return ''
  const inline = (nodes?: JSONContent[]): string =>
    (nodes ?? [])
      .map((n) => {
        if (n.type === 'hardBreak') return '  \n'
        if (n.type === 'mention') return String(n.attrs?.label ?? '')
        let t = n.text ?? ''
        for (const m of n.marks ?? []) {
          if (m.type === 'bold') t = `**${t}**`
          else if (m.type === 'italic') t = `*${t}*`
          else if (m.type === 'strike') t = `~~${t}~~`
          else if (m.type === 'code') t = `\`${t}\``
          else if (m.type === 'link') t = `[${t}](${m.attrs?.href})`
        }
        return t
      })
      .join('')
  const block = (n: JSONContent, prefix = ''): string => {
    switch (n.type) {
      case 'heading':
        return '#'.repeat(n.attrs?.level ?? 2) + ' ' + inline(n.content)
      case 'blockquote':
        return (n.content ?? [])
          .map((c) => block(c))
          .join('\n\n')
          .split('\n')
          .map((l) => '> ' + l)
          .join('\n')
      case 'bulletList':
        return (n.content ?? []).map((li) => prefix + '- ' + (li.content ?? []).map((c) => block(c, prefix + '  ')).join('\n')).join('\n')
      case 'orderedList':
        return (n.content ?? [])
          .map((li, i) => prefix + `${i + 1}. ` + (li.content ?? []).map((c) => block(c, prefix + '   ')).join('\n'))
          .join('\n')
      case 'horizontalRule':
        return '* * *'
      case 'codeBlock':
        return '```\n' + inline(n.content) + '\n```'
      default:
        return inline(n.content)
    }
  }
  return doc.content.map((b) => block(b)).join('\n\n')
}

export function download(filename: string, data: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'novela'

/** Reduce una imagen subida a un dataURL ligero. */
export function resizeImage(file: File, max = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/webp', 0.85))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export const NOVEL_COLORS = ['#b4532a', '#7c5cff', '#1f8a70', '#c2410c', '#2563eb', '#be185d', '#a16207', '#475569']
export const NOVEL_EMOJIS = ['📖', '🗡️', '🌒', '🐉', '🏰', '🌊', '🔮', '🚀', '🕯️', '🌿', '🦉', '🗝️']
