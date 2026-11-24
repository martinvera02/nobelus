import { COMPACT_QUERY } from '../hooks/useMedia'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'
export type AIProvider = 'ollama' | 'openai' | 'anthropic'

export interface AISettings {
  provider: AIProvider
  ollamaUrl: string
  ollamaModel: string
  ollamaThink: boolean
  openaiUrl: string
  openaiModel: string
  openaiKey: string
  anthropicModel: string
  anthropicKey: string
  temperature: number
}

interface UIState {
  theme: Theme
  sidebarOpen: boolean
  /** barra lateral como cajón en pantallas pequeñas (no se guarda) */
  mobileNav: boolean
  setMobileNav: (v: boolean) => void
  aiOpen: boolean
  /** el asesor puede proponer cambios en la estructura */
  aiCanEdit: boolean
  focusMode: boolean
  indentParagraphs: boolean
  editorWidth: 'narrow' | 'normal' | 'wide'
  ai: AISettings
  setTheme: (t: Theme) => void
  toggleSidebar: () => void
  setAIOpen: (v: boolean) => void
  setAICanEdit: (v: boolean) => void
  setFocusMode: (v: boolean) => void
  setPref: (p: Partial<Pick<UIState, 'indentParagraphs' | 'editorWidth'>>) => void
  setAI: (p: Partial<AISettings>) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      theme: 'system',
      sidebarOpen: true,
      mobileNav: false,
      setMobileNav: (mobileNav) => set({ mobileNav }),
      aiOpen: false,
      aiCanEdit: true,
      focusMode: false,
      indentParagraphs: true,
      editorWidth: 'normal',
      ai: {
        provider: 'ollama',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'gemma4:12b',
        ollamaThink: false,
        openaiUrl: 'https://api.openai.com/v1',
        openaiModel: 'gpt-5.4-mini',
        openaiKey: '',
        anthropicModel: 'claude-sonnet-5-5',
        anthropicKey: '',
        temperature: 0.7,
      },
      setTheme: (theme) => set({ theme }),
      // En pantallas pequeñas la barra es un cajón superpuesto con su propio estado
      toggleSidebar: () => set((s) => (matchMedia(COMPACT_QUERY).matches ? { mobileNav: !s.mobileNav } : { sidebarOpen: !s.sidebarOpen })),
      setAIOpen: (aiOpen) => set({ aiOpen }),
      setAICanEdit: (aiCanEdit) => set({ aiCanEdit }),
      setFocusMode: (focusMode) => set({ focusMode }),
      setPref: (p) => set(p),
      setAI: (p) => set((s) => ({ ai: { ...s.ai, ...p } })),
    }),
    {
      name: 'nobelus-ui',
      version: 1,
      partialize: ({ focusMode: _f, mobileNav: _m, ...rest }) => rest,
      // Mezcla en profundidad los ajustes de IA para que las opciones nuevas reciban su valor por defecto
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UIState>
        return { ...current, ...p, ai: { ...current.ai, ...(p.ai ?? {}) } }
      },
      migrate: (persisted, version) => {
        const p = persisted as Partial<UIState>
        // v0 → v1: el modelo por defecto pasa de llama3.1:8b a gemma4:12b
        if (version < 1 && p.ai?.ollamaModel === 'llama3.1:8b') p.ai = { ...p.ai, ollamaModel: 'gemma4:12b' }
        return p as UIState
      },
    },
  ),
)

/**
 * Puente efímero entre el editor activo y el resto de la app (asesor IA, paleta de comandos).
 * No se persiste.
 */
interface BridgeState {
  chapterId: string | null
  getText: (() => string) | null
  getSelection: (() => string) | null
  insert: ((text: string) => void) | null
  /** prompt pendiente que el panel IA debe enviar al abrirse */
  pending: string | null
  register: (b: Partial<Omit<BridgeState, 'register' | 'ask' | 'consume'>>) => void
  ask: (prompt: string) => void
  consume: () => string | null
}

export const useBridge = create<BridgeState>()((set, get) => ({
  chapterId: null,
  getText: null,
  getSelection: null,
  insert: null,
  pending: null,
  register: (b) => set(b),
  ask: (prompt) => {
    set({ pending: prompt })
    useUI.getState().setAIOpen(true)
  },
  consume: () => {
    const p = get().pending
    set({ pending: null })
    return p
  },
}))

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#131210' : '#faf8f5')
}
