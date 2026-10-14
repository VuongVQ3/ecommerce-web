import { FINE_POINTER, matchesMedia } from '../lib/media'

/**
 * "Something was just added to the cart": on desktops with a mouse the header's quick cart opens for a few seconds
 * instead of showing a toast. Touch devices keep the toast (and the drawer).
 */
const events = new EventTarget()
let mounted = 0

/** True when a quick cart is on screen and will show the addition (so the caller can skip its toast). */
export function announceAdded(): boolean {
  if (mounted === 0 || !matchesMedia(FINE_POINTER)) return false
  events.dispatchEvent(new Event('added'))
  return true
}

export function onAdded(listener: () => void): () => void {
  mounted++
  events.addEventListener('added', listener)
  return () => {
    mounted--
    events.removeEventListener('added', listener)
  }
}
