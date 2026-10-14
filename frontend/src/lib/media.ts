import { useSyncExternalStore } from 'react'

/** Devices with a real mouse/trackpad: hover previews make sense there, never on touch screens. */
export const FINE_POINTER = '(hover: hover) and (pointer: fine)'

const matches = (query: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches

/** Live result of a CSS media query (false where matchMedia is unavailable). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => matches(query),
    () => false,
  )
}

export const matchesMedia = matches
