import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { StatusBadge } from '../components/OrderDetails'
import type { OrderStatus } from '../lib/api'
import { adminApi } from '../lib/adminApi'
import { formatDateTime, formatPrice } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { btn, input, table } from './styles'
import { EmptyState, PageHeader, Pagination } from './ui'

const STATUSES: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ xác nhận' },
  { value: 'CONFIRMED', label: 'Đã xác nhận' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'CANCELLED', label: 'Đã huỷ' },
]

/** Filters live in the URL, so a filtered list can be bookmarked and survives going back from an order. */
export default function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? '') as OrderStatus | ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 0)
  const [search, setSearch] = useState(q)

  const { data, error, loading, reload } = useAsync(
    (signal) => adminApi.orders({ status, from, to, q, page }, signal),
    [status, from, to, q, page],
  )

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    update({ q: search.trim() })
  }

  return (
    <>
      <PageHeader title="Đơn hàng">
        {data && data.pendingCount > 0 && (
          <button type="button" className={btn.secondary} onClick={() => update({ status: 'PENDING' })}>
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white tabular-nums">
              {data.pendingCount}
            </span>
            đơn chờ xác nhận
          </button>
        )}
      </PageHeader>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Lọc theo trạng thái">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={status === s.value}
            onClick={() => update({ status: s.value })}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${
              status === s.value ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <form onSubmit={onSearch} role="search" className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mã đơn (HL...) hoặc số điện thoại"
            aria-label="Tìm theo mã đơn hoặc số điện thoại"
            className={input}
          />
          <button type="submit" className={btn.primary}>
            Tìm
          </button>
        </form>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          Từ
          <input type="date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} className={input} />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          Đến
          <input type="date" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} className={input} />
        </label>
      </div>

      {error ? (
        <ErrorMessage message={error.message} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : data.page.items.length === 0 ? (
        <EmptyState title="Không có đơn hàng nào.">
          {(status || from || to || q) && (
            <button type="button" className={btn.link} onClick={() => setParams(new URLSearchParams())}>
              Xoá bộ lọc
            </button>
          )}
        </EmptyState>
      ) : (
        <div aria-busy={loading}>
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>Mã đơn</th>
                  <th className={table.th}>Ngày đặt</th>
                  <th className={table.th}>Khách hàng</th>
                  <th className={`${table.th} text-right`}>SL</th>
                  <th className={`${table.th} text-right`}>Tổng tiền</th>
                  <th className={table.th}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.page.items.map((o) => (
                  <tr key={o.code} className="hover:bg-stone-50">
                    <td className={table.td}>
                      <Link to={`/admin/don-hang/${o.code}`} className="font-mono font-semibold text-brand-700 hover:underline">
                        {o.code}
                      </Link>
                    </td>
                    <td className={`${table.td} whitespace-nowrap`}>{formatDateTime(o.createdAt)}</td>
                    <td className={table.td}>
                      <div className="font-medium text-stone-900">{o.customerName}</div>
                      <div className="text-stone-600 tabular-nums">{o.phone}</div>
                    </td>
                    <td className={`${table.td} text-right tabular-nums`}>{o.itemCount}</td>
                    <td className={`${table.td} text-right font-semibold tabular-nums`}>{formatPrice(o.total)}</td>
                    <td className={table.td}>
                      <StatusBadge status={o.status} label={o.statusLabel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page.page} totalPages={data.page.totalPages} onChange={(p) => update({ page: String(p) })} />
        </div>
      )}
    </>
  )
}
