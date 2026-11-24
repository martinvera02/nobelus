import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { Plus } from 'lucide-react'
import { db, type Entity } from '../../lib/db'
import { typeDef } from '../../lib/schema'
import { cn, uid } from '../../lib/utils'

type Item = { id: string; label: string; entity?: Entity; create?: boolean }

interface ListRef {
  onKeyDown: (e: KeyboardEvent) => boolean
}

const MentionList = forwardRef<ListRef, SuggestionProps<Item>>(({ items, command, query }, ref) => {
  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [items])

  const select = (i: number) => {
    const it = items[i]
    if (it) command(it)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (e.key === 'ArrowUp') {
        setIndex((i) => (i + items.length - 1) % Math.max(items.length, 1))
        return true
      }
      if (e.key === 'ArrowDown') {
        setIndex((i) => (i + 1) % Math.max(items.length, 1))
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        select(index)
        return true
      }
      return false
    },
  }))

  return (
    <div className="fade-in w-72 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-soft">
      {items.length === 0 && <div className="px-3 py-2 text-sm text-subtle">Escribe para buscar en la wiki…</div>}
      {items.map((it, i) => {
        const def = it.entity ? typeDef(it.entity.type) : null
        return (
          <button
            key={it.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select(i)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
              i === index ? 'bg-hover text-fg' : 'text-muted',
            )}
          >
            {it.create ? (
              <>
                <Plus size={15} className="text-accent" />
                <span>
                  Crear personaje «<b className="text-fg">{query}</b>»
                </span>
              </>
            ) : (
              <>
                <span className="w-5 text-center">{it.entity?.emoji || def?.emoji}</span>
                <span className="flex-1 truncate text-fg">{it.label}</span>
                <span className="text-[11px] text-subtle">{def?.label}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
})

/** Configuración de la sugerencia "@" vinculada a la wiki de una novela. */
export function mentionSuggestion(novelId: string): Omit<SuggestionOptions<Item>, 'editor'> {
  return {
    char: '@',
    allowSpaces: true,
    items: async ({ query }) => {
      const q = query.toLowerCase().trim()
      const all = await db.entities.where('novelId').equals(novelId).toArray()
      const res: Item[] = all
        .filter((e) => !q || e.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
        .slice(0, 7)
        .map((e) => ({ id: e.id, label: e.name, entity: e }))
      if (q.length > 1 && !all.some((e) => e.name.toLowerCase() === q)) res.push({ id: '__create', label: query.trim(), create: true })
      return res
    },
    command: ({ editor, range, props }) => {
      const insert = (id: string, label: string) =>
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: 'mention', attrs: { id, label } },
            { type: 'text', text: ' ' },
          ])
          .run()
      if (props.create) {
        const id = uid()
        const now = Date.now()
        db.entities
          .add({ id, novelId, type: 'character', name: props.label, fields: {}, tags: [], createdAt: now, updatedAt: now })
          .then(() => insert(id, props.label))
      } else insert(props.id, props.label)
    },
    render: () => {
      let renderer: ReactRenderer<ListRef, SuggestionProps<Item>> | null = null
      const place = (props: SuggestionProps<Item>) => {
        const el = renderer?.element as HTMLElement | undefined
        const rect = props.clientRect?.()
        if (!el || !rect) return
        computePosition({ getBoundingClientRect: () => rect }, el, {
          placement: 'bottom-start',
          strategy: 'fixed',
          middleware: [offset(6), flip(), shift({ padding: 8 })],
        }).then(({ x, y }) => Object.assign(el.style, { left: `${x}px`, top: `${y}px` }))
      }
      return {
        onStart: (props) => {
          renderer = new ReactRenderer(MentionList, { props, editor: props.editor })
          const el = renderer.element as HTMLElement
          Object.assign(el.style, { position: 'fixed', zIndex: '60', left: '0', top: '0' })
          document.body.appendChild(el)
          place(props)
        },
        onUpdate: (props) => {
          renderer?.updateProps(props)
          place(props)
        },
        onKeyDown: ({ event }) => {
          if (event.key === 'Escape') {
            renderer?.destroy()
            renderer?.element.remove()
            renderer = null
            return true
          }
          return renderer?.ref?.onKeyDown(event) ?? false
        },
        onExit: () => {
          renderer?.destroy()
          renderer?.element.remove()
          renderer = null
        },
      }
    },
  }
}
