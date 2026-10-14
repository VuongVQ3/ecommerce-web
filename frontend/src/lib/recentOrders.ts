import { useSyncExternalStore } from 'react'

/**
 * "Đơn hàng gần đây" of a guest, in this browser only: order code + the secret of its tracking link. Never names,
 * phones or addresses (those are fetched from the server with the token). At most 10, none older than the link's
 * 180-day lifetime. Storage may be unavailable (private mode, blocked): every access is guarded.
 */
export const RECENT_ORDERS_KEY = 'hatlanh_recent_orders_v1'
export const MAX_RECENT_ORDERS = 10
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000
const CHANGE_EVENT = 'hatlanh:recent-orders'

export interface RecentOrder {
  code: string
  token: string
  /** ISO timestamp of when it was saved here */
  createdAt: string
}

const EMPTY: RecentOrder[] = []
let cachedRaw: string | null = null
let cachedList: RecentOrder[] = EMPTY

function isRecentOrder(value: unknown): value is RecentOrder {
  const v = value as RecentOrder
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.code === 'string' &&
    /^[A-Z0-9]{4,30}$/.test(v.code) &&
    typeof v.token === 'string' &&
    /^[A-Za-z0-9_-]{20,100}$/.test(v.token) &&
    typeof v.createdAt === 'string' &&
    !Number.isNaN(Date.parse(v.createdAt))
  )
}

/** Valid, unexpired entries, newest first (stable array identity while storage is unchanged). */
export function readRecentOrders(now = Date.now()): RecentOrder[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(RECENT_ORDERS_KEY)
  } catch {
    return EMPTY
  }
  if (raw === cachedRaw) return cachedList
  let list: RecentOrder[] = EMPTY
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) {
      list = parsed
        .filter(isRecentOrder)
        .filter((o) => now - Date.parse(o.createdAt) < MAX_AGE_MS)
        // Keep only the fields we own, in case something else was stored with them
        .map(({ code, token, createdAt }) => ({ code, token, createdAt }))
        .slice(0, MAX_RECENT_ORDERS)
    }
  } catch {
    list = EMPTY
  }
  cachedRaw = raw
  cachedList = list
  return list
}

function write(list: RecentOrder[]) {
  try {
    if (list.length === 0) localStorage.removeItem(RECENT_ORDERS_KEY)
    else localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify(list))
  } catch {
    // Storage full or blocked: the order is still reachable through its link and the lookup page
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Adds (or refreshes) an order at the top of the list. */
export function saveRecentOrder(code: string, token: string, now = new Date()) {
  const entry = { code, token, createdAt: now.toISOString() }
  if (!isRecentOrder(entry)) return
  const existing = readRecentOrders(now.getTime()).find((o) => o.code === code)
  const others = readRecentOrders(now.getTime()).filter((o) => o.code !== code)
  // Opening an older link again must not reset its age
  write([{ ...entry, createdAt: existing?.token === token ? existing.createdAt : entry.createdAt }, ...others].slice(0, MAX_RECENT_ORDERS))
}

export function removeRecentOrders(codes: string[]) {
  if (codes.length === 0) return
  const remove = new Set(codes)
  const current = readRecentOrders()
  const next = current.filter((o) => !remove.has(o.code))
  if (next.length !== current.length) write(next)
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === RECENT_ORDERS_KEY) onChange()
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** Live list (updates when another tab or component changes it). */
export function useRecentOrders(): RecentOrder[] {
  return useSyncExternalStore(subscribe, () => readRecentOrders(), () => EMPTY)
}

/** In-app path of an order's tracking page (the host comes from wherever the app runs). */
export const trackingPath = (code: string, token: string) =>
  `/don-hang/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`
