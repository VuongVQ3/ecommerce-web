import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { adminApi, type OrderSummary } from '../lib/adminApi'

/** How often the back office asks for the order summary while its tab is visible */
export const POLL_MS = 20_000

/**
 * The toast for new orders: one order (or a count that did not grow by more, e.g. one came in and one was confirmed)
 * names it and opens it; several name the count (how much the pending count grew) and open the order list.
 */
export function newOrderToast(summary: OrderSummary, previous: OrderSummary): { message: string; label: string; to: string } {
  const added = summary.pendingCount - previous.pendingCount
  if (added > 1) return { message: `Có ${added} đơn mới`, label: 'Xem đơn', to: '/admin/don-hang' }
  return { message: `Có đơn mới ${summary.latestOrderCode}`, label: 'Mở đơn', to: `/admin/don-hang/${summary.latestOrderCode}` }
}

const isOlder = (next: OrderSummary, previous: OrderSummary) =>
  !!previous.latestCreatedAt && !!next.latestCreatedAt && Date.parse(next.latestCreatedAt) < Date.parse(previous.latestCreatedAt)

/**
 * Polls GET /api/admin/orders/summary every 20 s, only while the tab is visible, and once more as soon as it is shown
 * again. `onNewOrder` runs when the newest order changes (never on the first answer), with the previous answer to
 * tell how many came in. Errors are silent: the next poll retries. Stops on unmount (leaving the back office, signing
 * out).
 */
export function useNewOrderPolling(onNewOrder: (summary: OrderSummary, previous: OrderSummary) => void, intervalMs = POLL_MS) {
  const [summary, setSummary] = useState<OrderSummary | null>(null)
  // null until the first answer: what was there before opening the page is not "new"
  const last = useRef<OrderSummary | null>(null)
  const notify = useRef(onNewOrder)
  useEffect(() => {
    notify.current = onNewOrder
  }, [onNewOrder])
  const inFlight = useRef<AbortController | null>(null)

  const poll = useCallback(async () => {
    if (document.visibilityState !== 'visible' || inFlight.current) return
    const controller = new AbortController()
    inFlight.current = controller
    try {
      const next = await adminApi.orderSummary(controller.signal)
      setSummary(next)
      const previous = last.current
      // Another order that is not older: deleting the newest order makes an older one the latest, which is not new
      if (previous && next.latestOrderId && next.latestOrderId !== previous.latestOrderId && !isOlder(next, previous)) {
        notify.current(next, previous)
      }
      last.current = next
    } catch {
      // Network error, server asleep, session gone: try again at the next tick
    } finally {
      if (inFlight.current === controller) inFlight.current = null
    }
  }, [])

  useEffect(() => {
    // First answer right away (from a task, not inside the effect), then every intervalMs
    const first = window.setTimeout(() => void poll(), 0)
    const timer = window.setInterval(() => void poll(), intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      inFlight.current?.abort()
      inFlight.current = null
    }
  }, [poll, intervalMs])

  return { summary, refresh: poll }
}

/**
 * Shared with the admin pages by AdminLayout: `newOrders` counts the new orders seen since the page was opened, so a
 * page can react to a change (reload its list, offer a reload).
 */
export const NewOrdersContext = createContext<{ newOrders: number; refresh: () => void }>({ newOrders: 0, refresh: () => {} })

export const useNewOrders = () => useContext(NewOrdersContext)

/**
 * Calls `onChange` each time a new order arrives while the page is open (not on mount). For pages reacting to new
 * orders: reload a list, show a "Tải lại" bar.
 */
export function useOnNewOrder(onChange: () => void) {
  const { newOrders } = useNewOrders()
  const seen = useRef(newOrders)
  const callback = useRef(onChange)
  useEffect(() => {
    callback.current = onChange
  }, [onChange])
  useEffect(() => {
    if (newOrders === seen.current) return
    seen.current = newOrders
    callback.current()
  }, [newOrders])
}

const SOUND_KEY = 'hatlanh.admin.newOrderSound'

/** The "sound on new order" switch, remembered in this browser (on by default; storage may be unavailable). */
export function useOrderSoundSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off'
    } catch {
      return true
    }
  })
  const set = useCallback((value: boolean) => {
    setOn(value)
    try {
      localStorage.setItem(SOUND_KEY, value ? 'on' : 'off')
    } catch {
      // private mode, storage blocked: the choice lasts for this page only
    }
  }, [])
  return [on, set]
}

let audio: AudioContext | null = null

/**
 * A short two-note chime made with Web Audio (no file to load). Browsers refuse sound before the user has interacted
 * with the page: that failure is ignored.
 */
export function playNewOrderSound() {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return
    audio ??= new Context()
    const ctx = audio
    void ctx.resume?.().catch(() => {})
    const start = ctx.currentTime
    for (const [i, frequency] of [880, 1320].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequency
      const t = start + i * 0.16
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.16)
    }
  } catch {
    // No audio (autoplay policy, old browser): the toast is enough
  }
}
