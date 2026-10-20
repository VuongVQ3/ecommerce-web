import { useEffect, useState } from 'react'

export const TYPE_MS = 80
export const HOLD_MS = 1500
export const DELETE_MS = 40
/** Empty field for a moment before the next phrase starts */
export const NEXT_MS = 300

/**
 * Text that types itself: each phrase is typed one character at a time, held, deleted, then the next one starts;
 * it loops forever. `active: false` stops it (and starts again from the first phrase when active again). One
 * timer at a time, cleared when stopped or unmounted. Pass a stable array (a module constant).
 */
export function useTypewriterPlaceholder(phrases: readonly string[], { active }: { active: boolean }): string {
  const [text, setText] = useState('')

  useEffect(() => {
    if (!active || phrases.length === 0) return
    let timer: number | undefined
    let phrase = 0
    let length = 0
    let deleting = false

    const step = () => {
      const full = phrases[phrase]
      if (!deleting) {
        length += 1
        setText(full.slice(0, length))
        if (length >= full.length) {
          deleting = true
          timer = window.setTimeout(step, HOLD_MS)
        } else {
          timer = window.setTimeout(step, TYPE_MS)
        }
        return
      }
      length -= 1
      setText(full.slice(0, Math.max(length, 0)))
      if (length <= 0) {
        deleting = false
        phrase = (phrase + 1) % phrases.length
        timer = window.setTimeout(step, NEXT_MS)
      } else {
        timer = window.setTimeout(step, DELETE_MS)
      }
    }

    timer = window.setTimeout(step, TYPE_MS)
    return () => {
      window.clearTimeout(timer)
      // Starts again from an empty field next time
      setText('')
    }
  }, [active, phrases])

  return active ? text : ''
}
