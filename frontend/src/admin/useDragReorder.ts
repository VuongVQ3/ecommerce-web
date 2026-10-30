import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { dropIndex, shiftOf, type Slot } from './reorder'

interface Drag {
  id: number
  /** Which list the handle belongs to (the page renders a table and a phone list of the same rows) */
  list: string
  from: number
  to: number
  /** How far the pointer moved since the drag started, scrolling included */
  dy: number
  slots: Slot[]
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Distance from the window edge (px) where dragging starts to scroll the page, and the fastest step per frame */
const EDGE = 56
const SPEED = 16

/**
 * Drag-to-reorder with Pointer Events (mouse, pen and touch; HTML5 drag and drop does not work on touch screens) and
 * the keyboard (↑/↓ on a focused handle). While dragging, the dragged row follows the pointer and the rows it passes
 * slide out of its way (transforms only: the rows stay in place in the DOM, moving the dragged node would end its
 * pointer capture); Esc cancels; the page scrolls near the window edges. `onMove` is called once, on drop.
 */
export function useDragReorder<T>(
  items: readonly T[],
  idOf: (item: T) => number,
  onMove: (id: number, from: number, to: number) => void,
) {
  const rows = useRef(new Map<string, HTMLElement>())
  const handles = useRef(new Map<string, HTMLElement>())
  const [drag, setDrag] = useState<Drag | null>(null)
  const current = useRef<Drag | null>(null)
  const pointer = useRef({ startY: 0, clientY: 0, id: 0, handle: null as HTMLElement | null })
  // pointerup and lostpointercapture both fire on a drop: only the first one counts
  const finished = useRef(true)
  const refocus = useRef<string | null>(null)
  const latestOnMove = useRef(onMove)

  useEffect(() => {
    latestOnMove.current = onMove
  })

  const set = useCallback((next: Drag | null) => {
    current.current = next
    setDrag(next)
  }, [])

  const follow = useCallback(() => {
    const d = current.current
    if (!d) return
    const dy = pointer.current.clientY + window.scrollY - pointer.current.startY
    set({ ...d, dy, to: dropIndex(d.slots, d.from, dy) })
  }, [set])

  const finish = useCallback(
    (commit: boolean) => {
      if (finished.current) return
      finished.current = true
      const d = current.current
      set(null)
      document.body.style.userSelect = ''
      const { handle, id } = pointer.current
      if (handle?.hasPointerCapture?.(id)) handle.releasePointerCapture(id)
      if (commit && d && d.to !== d.from) latestOnMove.current(d.id, d.from, d.to)
    },
    [set],
  )

  const active = drag !== null
  useEffect(() => {
    if (!active) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      finish(false)
    }
    let frame = requestAnimationFrame(function scroll() {
      const y = pointer.current.clientY
      const step =
        y < EDGE ? -SPEED * (1 - y / EDGE) : y > window.innerHeight - EDGE ? SPEED * (1 - (window.innerHeight - y) / EDGE) : 0
      if (step) {
        window.scrollBy(0, step)
        follow()
      }
      frame = requestAnimationFrame(scroll)
    })
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
    }
  }, [active, finish, follow])

  // Leaving the page mid-drag must not leave the page unselectable
  useEffect(() => () => void (document.body.style.userSelect = ''), [])

  // A keyboard move re-renders the rows in a new order (the browser drops focus from moved nodes): focus the handle again
  useEffect(() => {
    if (refocus.current === null) return
    handles.current.get(refocus.current)?.focus()
    refocus.current = null
  })

  const register = (map: Map<string, HTMLElement>, key: string) => (el: HTMLElement | null) => {
    if (el) map.set(key, el)
    else map.delete(key)
  }

  const rowProps = (list: string, id: number, index: number) => {
    const ref = register(rows.current, `${list}:${id}`)
    if (drag?.list !== list) return { ref }
    if (drag.id === id) {
      const style: CSSProperties = { transform: `translateY(${drag.dy}px)`, position: 'relative', zIndex: 10 }
      return { ref, style, 'data-dragging': true }
    }
    const style: CSSProperties = {
      transform: `translateY(${shiftOf(drag.slots, drag.from, drag.to, index)}px)`,
      transition: reducedMotion() ? undefined : 'transform 150ms ease',
    }
    return { ref, style }
  }

  const handleProps = (list: string, id: number, index: number) => {
    const key = `${list}:${id}`
    return {
      ref: register(handles.current, key),
      style: { touchAction: 'none' } as CSSProperties,
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || current.current) return
        e.preventDefault()
        e.currentTarget.setPointerCapture?.(e.pointerId)
        const slots = items.map((item) => {
          const rect = rows.current.get(`${list}:${idOf(item)}`)?.getBoundingClientRect()
          return { top: (rect?.top ?? 0) + window.scrollY, height: rect?.height ?? 0 }
        })
        pointer.current = { startY: e.clientY + window.scrollY, clientY: e.clientY, id: e.pointerId, handle: e.currentTarget }
        finished.current = false
        document.body.style.userSelect = 'none'
        set({ id, list, from: index, to: index, dy: 0, slots })
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (current.current?.id !== id || current.current.list !== list) return
        pointer.current.clientY = e.clientY
        follow()
      },
      onPointerUp: () => finish(true),
      onLostPointerCapture: () => finish(true),
      onPointerCancel: () => finish(false),
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : null
        if (to === null || current.current) return
        e.preventDefault()
        if (to < 0 || to >= items.length) return
        refocus.current = key
        onMove(id, index, to)
      },
    }
  }

  return { dragging: drag?.id ?? null, rowProps, handleProps }
}
