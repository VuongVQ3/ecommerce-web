import { useSyncExternalStore } from 'react'

/**
 * Something covers the page: a modal or drawer (aria-modal: quick view, cart drawer, phone menu), a native <dialog>,
 * or a popup that marks itself with data-overlay while open (cart preview).
 */
const OVERLAY = '[aria-modal="true"], dialog[open], [data-overlay]'

const isOpen = () => typeof document !== 'undefined' && document.querySelector(OVERLAY) !== null

function subscribe(onChange: () => void) {
  if (typeof MutationObserver === 'undefined') return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-modal', 'open', 'data-overlay'] })
  return () => observer.disconnect()
}

/** True while a modal, drawer or popup is open over the page (floating buttons hide then). */
export function useOverlayOpen(): boolean {
  return useSyncExternalStore(subscribe, isOpen, () => false)
}

/**
 * Marks an element that needs the bottom-right corner while it is on the page (an open ComboboxField list): the
 * floating buttons step aside, whatever the z-index of either.
 */
export const HIDE_FLOATING = 'data-hide-floating'

const isHideFloating = () => typeof document !== 'undefined' && document.querySelector(`[${HIDE_FLOATING}]`) !== null

function subscribeHideFloating(onChange: () => void) {
  if (typeof MutationObserver === 'undefined') return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: [HIDE_FLOATING] })
  return () => observer.disconnect()
}

/** True while something marked HIDE_FLOATING is on the page: the floating contact and "top" buttons hide. */
export function useFloatingHidden(): boolean {
  return useSyncExternalStore(subscribeHideFloating, isHideFloating, () => false)
}
