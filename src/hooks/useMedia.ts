import { useSyncExternalStore } from 'react'

export const COMPACT_QUERY = '(max-width: 1023px)'

/** true mientras la media query se cumpla (se actualiza al redimensionar). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => matchMedia(query).matches,
    () => false,
  )
}

/** Pantallas de tablet o móvil: la barra lateral y el asesor pasan a ser paneles superpuestos. */
export const useIsCompact = () => useMedia(COMPACT_QUERY)
