import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Typography from '@tiptap/extension-typography'
import { CharacterCount, Focus, Placeholder } from '@tiptap/extensions'
import { Bold, Heading2, Heading3, Highlighter, Italic, Quote, Sparkles, Strikethrough, Underline as UnderlineIcon } from 'lucide-react'
import { mentionSuggestion } from './mentions'
import { cn } from '../../lib/utils'
import { useBridge } from '../../store/ui'

interface Props {
  novelId: string
  content?: JSONContent
  placeholder?: string
  variant?: 'manuscript' | 'wiki'
  className?: string
  onChange?: (json: JSONContent, editor: Editor) => void
  onReady?: (editor: Editor) => void
}

export function RichEditor({ novelId, content, placeholder, variant = 'manuscript', className, onChange, onReady }: Props) {
  const navigate = useNavigate()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const ask = useBridge((s) => s.ask)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? 'Empieza a escribir… usa @ para enlazar la wiki, ## para títulos, > para citas, --- para un separador.',
      }),
      CharacterCount,
      Focus.configure({ className: 'has-focus', mode: 'shallowest' }),
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Typography.configure({ openDoubleQuote: '«', closeDoubleQuote: '»' }),
      Mention.configure({
        HTMLAttributes: { class: 'nb-mention' },
        renderText: ({ node }) => String(node.attrs.label ?? ''),
        renderHTML: ({ options, node }) => [
          'span',
          { ...options.HTMLAttributes, 'data-type': 'mention', 'data-id': node.attrs.id },
          String(node.attrs.label ?? ''),
        ],
        suggestion: mentionSuggestion(novelId),
      }),
    ],
    content: content ?? '',
    editorProps: {
      attributes: { spellcheck: 'true', lang: 'es', class: 'nb-manuscript' },
    },
    onUpdate: ({ editor }) => onChangeRef.current?.(editor.getJSON(), editor),
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
  })

  useEffect(() => {
    if (editor) onReady?.(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const handleClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('.nb-mention') as HTMLElement | null
    if (el?.dataset.id && (e.metaKey || e.ctrlKey || e.altKey || !editor?.isEditable)) {
      navigate(`/novel/${novelId}/wiki/${el.dataset.id}`)
    }
  }
  const handleDouble = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('.nb-mention') as HTMLElement | null
    if (el?.dataset.id) navigate(`/novel/${novelId}/wiki/${el.dataset.id}`)
  }

  if (!editor) return null

  const B = ({ on, active, title, children }: { on: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      className={cn('icon-btn h-8 w-8', active && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent')}
    >
      {children}
    </button>
  )

  return (
    <div className={cn('nb-editor', variant, className)} onClick={handleClick} onDoubleClick={handleDouble}>
      <BubbleMenu
        editor={editor}
        options={{ placement: 'top', offset: 8 }}
        shouldShow={({ editor, state }) => !state.selection.empty && !editor.isActive('mention') && editor.isEditable}
      >
        <div className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-soft">
          <B title="Negrita (Ctrl+B)" on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
            <Bold size={15} />
          </B>
          <B title="Cursiva (Ctrl+I)" on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
            <Italic size={15} />
          </B>
          <B title="Subrayado (Ctrl+U)" on={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')}>
            <UnderlineIcon size={15} />
          </B>
          <B title="Tachado" on={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')}>
            <Strikethrough size={15} />
          </B>
          <B title="Resaltar" on={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')}>
            <Highlighter size={15} />
          </B>
          <span className="mx-1 h-5 w-px bg-line" />
          <B
            title="Título"
            on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
          >
            <Heading2 size={15} />
          </B>
          <B
            title="Subtítulo"
            on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
          >
            <Heading3 size={15} />
          </B>
          <B title="Cita" on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}>
            <Quote size={15} />
          </B>
          <span className="mx-1 h-5 w-px bg-line" />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const { from, to } = editor.state.selection
              const text = editor.state.doc.textBetween(from, to, '\n')
              ask(`Mejora este fragmento manteniendo mi voz. Dame 2 alternativas y explica brevemente qué cambias:\n\n"""\n${text}\n"""`)
            }}
            className="btn h-8 px-2 text-accent hover:bg-accent-soft"
          >
            <Sparkles size={14} /> Mejorar
          </button>
        </div>
      </BubbleMenu>
      <EditorContent editor={editor} />
    </div>
  )
}
