import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError, type TrackedOrder } from '../lib/api'
import { formatDateTime, formatPrice } from '../lib/format'
import { removeRecentOrders, trackingPath, useRecentOrders } from '../lib/recentOrders'
import { StatusBadge } from './OrderDetails'

type Row = { code: string; token: string; order?: TrackedOrder; failed?: boolean }

/**
 * Guest's recent orders in this browser, with their current status fetched through each tracking link. Links that
 * no longer work (expired, saved to an account) are dropped from the list.
 */
export default function RecentOrders() {
  const recent = useRecentOrders()
  const [loaded, setLoaded] = useState<Record<string, TrackedOrder | 'failed'>>({})

  useEffect(() => {
    const controller = new AbortController()
    for (const { code, token } of recent) {
      api.trackOrder(code, token, controller.signal).then(
        (order) => setLoaded((l) => ({ ...l, [code]: order })),
        (err: unknown) => {
          if (controller.signal.aborted) return
          if (err instanceof ApiError && err.status === 404) removeRecentOrders([code])
          else setLoaded((l) => ({ ...l, [code]: 'failed' }))
        },
      )
    }
    return () => controller.abort()
  }, [recent])

  if (recent.length === 0) return null
  const rows: Row[] = recent.map(({ code, token }) => {
    const value = loaded[code]
    return { code, token, order: value === 'failed' ? undefined : value, failed: value === 'failed' }
  })

  return (
    <section id="don-hang-gan-day" className="rounded-2xl border border-stone-200 bg-white p-5" aria-labelledby="recent-orders-title">
      <h2 id="recent-orders-title" className="font-bold text-stone-900">
        Đơn hàng gần đây trên trình duyệt này
      </h2>
      <ul className="mt-3 divide-y divide-stone-100">
        {rows.map((row) => (
          <li key={row.code}>
            <Link
              to={trackingPath(row.code, row.token)}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 hover:bg-stone-50"
            >
              <span>
                <span className="font-semibold tracking-wide text-brand-700 tabular-nums">{row.code}</span>
                {row.order && (
                  <span className="block text-sm text-muted">
                    {formatDateTime(row.order.createdAt)} · {formatPrice(row.order.total)}
                  </span>
                )}
              </span>
              {row.order ? (
                <StatusBadge status={row.order.status} label={row.order.statusLabel} />
              ) : (
                <span className="text-sm text-muted">{row.failed ? 'Không tải được trạng thái' : 'Đang tải...'}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
