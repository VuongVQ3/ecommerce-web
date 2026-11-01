import type { OrderStatus } from '../lib/api'
import { ORDER_STATUSES } from '../lib/orderStatus'

/** How a day total compares with the day before, for the small coloured label next to it. */
export interface Comparison {
  /** "▲ 33%", "▼ 50%", "— 0%" or "▲ mới" (nothing the day before, something today) */
  text: string
  /** true: good news (green), false: bad news (red), null: no change (grey) */
  good: boolean | null
}

/** upIsBad: more is worse (cancelled orders) */
export function compareDays(now: number, before: number, upIsBad = false): Comparison {
  if (now === before) return { text: '— 0%', good: null }
  const up = now > before
  const good = up !== upIsBad
  if (before === 0) return { text: '▲ mới', good }
  return { text: `${up ? '▲' : '▼'} ${Math.round((Math.abs(now - before) / before) * 100)}%`, good }
}

/** Orders per status, in lifecycle order, leaving out the statuses with none. */
export function statusCounts(orders: { status: OrderStatus }[]): { status: OrderStatus; count: number }[] {
  return ORDER_STATUSES.map((status) => ({ status, count: orders.filter((o) => o.status === status).length })).filter((s) => s.count > 0)
}
