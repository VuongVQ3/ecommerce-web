import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { matchesMedia } from '../lib/media'

/**
 * What the header badge shows while products fly to the cart. The cart data changes at once; the badge keeps its
 * number until each flight lands (then adds that flight's quantity), so the count "arrives" with the picture.
 * Also drives the cart icon bounce and the badge pop, and announces additions to screen readers.
 */
interface Snapshot {
  /** null = show the real count */
  frozen: number | null
  /** Changes when the icon should bounce (a flight landed) */
  bounce: number
  /** Changes when the badge should pop (new number) */
  pop: number
}

let state: Snapshot = { frozen: null, bounce: 0, pop: 0 }
let holds = 0
const listeners = new Set<() => void>()

function set(next: Partial<Snapshot>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export interface BadgeHold {
  /** The flight reached the cart (or was skipped): show its quantity, bounce, pop */
  land: (quantity: number, bounce: boolean) => void
  /** The add failed: let go without animating (the real count is already right) */
  cancel: () => void
}

/** Call before adding, with the count shown right now. */
export function holdBadge(current: number): BadgeHold {
  if (holds === 0) set({ frozen: current })
  holds++
  let done = false
  const release = () => {
    holds--
    if (holds === 0) set({ frozen: null })
  }
  return {
    land(quantity, bounce) {
      if (done) return
      done = true
      if (state.frozen !== null) set({ frozen: state.frozen + quantity })
      release()
      set(bounce ? { bounce: state.bounce + 1, pop: state.pop + 1 } : { pop: state.pop + 1 })
    },
    cancel() {
      if (done) return
      done = true
      release()
    },
  }
}

/** A quantity changed without a flight ("+" on a card): just pop the badge. */
export function popBadge() {
  set({ pop: state.pop + 1 })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const reducedMotion = () => matchesMedia('(prefers-reduced-motion: reduce)')

/**
 * For a header cart icon: the number to show, and refs for the icon (bounce: 1 → 1.25 → 0.95 → 1, 400ms) and the
 * badge (pop: 0.5 → 1.2 → 1, 300ms). No motion under prefers-reduced-motion.
 */
export function useCartBadge(count: number) {
  const snap = useSyncExternalStore(subscribe, () => state, () => state)
  const iconRef = useRef<HTMLElement | null>(null)
  const badgeRef = useRef<HTMLElement | null>(null)
  const seen = useRef({ bounce: snap.bounce, pop: snap.pop })

  useEffect(() => {
    if (snap.bounce !== seen.current.bounce) {
      seen.current.bounce = snap.bounce
      if (!reducedMotion()) {
        iconRef.current?.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(0.95)' }, { transform: 'scale(1)' }],
          { duration: 400, easing: 'ease-out' },
        )
      }
    }
    if (snap.pop !== seen.current.pop) {
      seen.current.pop = snap.pop
      if (!reducedMotion()) {
        badgeRef.current?.animate([{ transform: 'scale(0.5)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], {
          duration: 300,
          easing: 'ease-out',
        })
      }
    }
  }, [snap.bounce, snap.pop])

  // Callback refs for the icon and the badge elements
  const setIcon = useCallback((el: HTMLElement | null) => {
    iconRef.current = el
  }, [])
  const setBadge = useCallback((el: HTMLElement | null) => {
    badgeRef.current = el
  }, [])
  return { shown: snap.frozen ?? count, iconRef: setIcon, badgeRef: setBadge }
}

let liveRegion: HTMLElement | null = null

/** "Đã thêm … vào giỏ hàng" for screen readers, whether or not a toast or the quick cart shows it. */
export function announceToScreenReaders(text: string) {
  if (typeof document === 'undefined') return
  if (!liveRegion || !liveRegion.isConnected) {
    liveRegion = document.createElement('div')
    liveRegion.setAttribute('aria-live', 'polite')
    liveRegion.setAttribute('role', 'status')
    liveRegion.className = 'sr-only'
    liveRegion.dataset.cartAnnouncer = ''
    document.body.appendChild(liveRegion)
  }
  const region = liveRegion
  region.textContent = ''
  // A new text node after a tick so repeated messages are read again
  window.setTimeout(() => {
    region.textContent = text
  }, 50)
}
