import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { StatusBadge } from '../components/OrderDetails'
import type { OrderStatus } from '../lib/api'
import { adminApi, type AdminOrderRow } from '../lib/adminApi'
import { formatAdminDateTime, formatPrice, formatRelative, formatShortDateTime } from '../lib/format'
import { CANCEL_REASON_LABEL, ORDER_STATUS_LABEL, ORDER_STATUSES, type CancelReasonCode } from '../lib/orderStatus'
import { useAsync } from '../lib/useAsync'
import { DateRangeFilter } from './DateField'
import { vnTodayIso } from './dates'
import { OVERDUE_PARAM } from './labels'
import { FlagIcon } from './phoneFlags'
import { btn, filterInput, input, table } from './styles'
import { Dialog, EmptyState, FilterBar, PageHeader, Pagination, SearchFilter, TableFrame } from './ui'

const STATUSES: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] })),
]

/** Phones: search and dates in a bottom sheet, applied together. */
function FilterSheet({
  q,
  from,
  to,
  onApply,
  onClose,
}: {
  q: string
  from: string
  to: string
  onApply: (f: { q: string; from: string; to: string }) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState({ q, from, to })
  return (
    <Dialog title="Bộ lọc" variant="sheet" submitLabel="Áp dụng" onSubmit={() => onApply({ ...draft, q: draft.q.trim() })} onClose={onClose}>
      <div>
        <label htmlFor="sheet-search" className="mb-1 block text-sm font-medium text-stone-700">
          Mã đơn hoặc số điện thoại
        </label>
        <input
          id="sheet-search"
          type="search"
          value={draft.q}
          onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
          placeholder="HL... hoặc 09..."
          className={input}
        />
      </div>
      <DateRangeFilter from={draft.from} to={draft.to} onChange={(r) => setDraft((d) => ({ ...d, ...r }))} />
      <button type="button" className={`${btn.link} self-start`} onClick={() => setDraft({ q: '', from: '', to: '' })}>
        Xoá tất cả
      </button>
    </Dialog>
  )
}

function Customer({ o }: { o: AdminOrderRow }) {
  return (
    <>
      <div className="max-w-64 truncate font-medium text-stone-900" title={o.customerName}>
        {o.customerName}
      </div>
      <div className="flex items-center gap-1 text-stone-600 tabular-nums">
        {o.phone}
        {o.flagLevel && <FlagIcon level={o.flagLevel} reason={o.flagReason} />}
      </div>
    </>
  )
}

/** Below 768px: one card per order, the whole card opens it. */
function OrderCards({ rows }: { rows: AdminOrderRow[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {rows.map((o) => (
        <li key={o.code}>
          <Link
            to={`/admin/don-hang/${o.code}`}
            className="block rounded-2xl border border-stone-200 bg-white p-4 hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-brand-700"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-brand-700">{o.code}</span>
              <StatusBadge status={o.status} />
            </div>
            <div className="mt-2 text-sm">
              <Customer o={o} />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold tabular-nums">
                {formatPrice(o.total)} <span className="font-normal text-muted">· {o.itemCount} SP</span>
              </span>
              <time dateTime={o.createdAt} title={formatAdminDateTime(o.createdAt)} className="text-muted">
                {formatRelative(o.createdAt)}
              </time>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** 768px and up: a table; below 1280px without the quantity column and with short dates. */
function OrderTable({ rows }: { rows: AdminOrderRow[] }) {
  const navigate = useNavigate()
  return (
    <TableFrame className="hidden md:block">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className={table.th}>Mã đơn</th>
            <th className={table.th}>Ngày đặt</th>
            <th className={table.th}>Khách hàng</th>
            <th className={`${table.th} hidden text-right xl:table-cell`}>SL</th>
            <th className={`${table.th} text-right`}>Tổng tiền</th>
            <th className={table.th}>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr
              key={o.code}
              className="cursor-pointer transition-colors hover:bg-brand-50/60 focus-within:bg-brand-50/60"
              onClick={(e) => {
                // The link handles its own clicks (and middle/ctrl-click)
                if (!(e.target as HTMLElement).closest('a')) navigate(`/admin/don-hang/${o.code}`)
              }}
            >
              <td className={table.td}>
                <Link to={`/admin/don-hang/${o.code}`} className="font-mono font-semibold text-brand-700 hover:underline">
                  {o.code}
                </Link>
              </td>
              <td className={`${table.td} whitespace-nowrap tabular-nums`}>
                <span className="xl:hidden" title={formatAdminDateTime(o.createdAt)}>
                  {formatShortDateTime(o.createdAt)}
                </span>
                <span className="hidden xl:inline">{formatAdminDateTime(o.createdAt)}</span>
              </td>
              <td className={table.td}>
                <Customer o={o} />
              </td>
              <td className={`${table.td} hidden text-right tabular-nums xl:table-cell`}>{o.itemCount}</td>
              <td className={`${table.td} text-right font-semibold whitespace-nowrap tabular-nums`}>{formatPrice(o.total)}</td>
              <td className={table.td}>
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  )
}

/** Filters live in the URL, so a filtered list can be bookmarked and survives going back from an order. */
export default function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? '') as OrderStatus | ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const q = params.get('q') ?? ''
  const cancelReasonCode = (params.get('cancelReasonCode') ?? '') as CancelReasonCode | ''
  const page = Number(params.get('page') ?? 0)
  // From the dashboard: pending orders older than 24 hours. The API filters by day, so it is asked for the days up
  // to the cutoff and the few later orders of the cutoff day are left out here.
  const overdue = status === 'PENDING' && params.get(OVERDUE_PARAM) === '1'
  const [cutoff] = useState(() => Date.now() - 24 * 3600_000)
  const cutoffDay = vnTodayIso(new Date(cutoff))
  const listTo = overdue && (!to || to > cutoffDay) ? cutoffDay : to
  const [sheetOpen, setSheetOpen] = useState(false)
  const chips = useRef<HTMLDivElement>(null)

  const { data, error, loading, reload } = useAsync(
    (signal) => adminApi.orders({ status, from, to: listTo, q, cancelReasonCode, page }, signal),
    [status, from, listTo, q, cancelReasonCode, page],
  )
  // Number of orders behind each status chip, for the same search and dates (one tiny request per status)
  const counts = useAsync(
    (signal) =>
      Promise.all(STATUSES.map((s) => adminApi.orders({ status: s.value, from, to, q, size: 1 }, signal).then((r) => r.page.totalItems))),
    [from, to, q],
  ).data
  const rows = data ? (overdue ? data.page.items.filter((o) => new Date(o.createdAt).getTime() <= cutoff) : data.page.items) : []

  // Keep the selected status chip visible when the row scrolls sideways
  useEffect(() => {
    chips.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [status])

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in changes)) next.delete('page')
    // The cancel reason filter only exists next to "Đã huỷ"
    if ('status' in changes && changes.status !== 'CANCELLED') next.delete('cancelReasonCode')
    if ('status' in changes) next.delete(OVERDUE_PARAM)
    setParams(next)
  }

  const activeFilters = (q ? 1 : 0) + (from || to ? 1 : 0)

  return (
    <>
      <PageHeader title="Đơn hàng">
        {data && data.pendingCount > 0 && (
          <button type="button" className={btn.secondary} onClick={() => update({ status: 'PENDING' })}>
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white tabular-nums">
              {data.pendingCount}
            </span>
            đơn chờ xác nhận
          </button>
        )}
      </PageHeader>

      <div ref={chips} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="group" aria-label="Lọc theo trạng thái">
        {STATUSES.map((s, i) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={status === s.value}
            onClick={() => update({ status: s.value })}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${
              status === s.value ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            {s.label}
            {counts && <span className={`ml-1 tabular-nums ${status === s.value ? 'text-stone-300' : 'text-stone-500'}`}>({counts[i]})</span>}
          </button>
        ))}
      </div>
      {overdue && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-stone-700">
          Đang xem đơn chờ xác nhận đặt cách đây hơn 24 giờ
          <button
            type="button"
            onClick={() => update({ [OVERDUE_PARAM]: '' })}
            className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-900 hover:bg-orange-200"
          >
            Chờ quá 24 giờ
            <X aria-hidden className="size-3.5" />
            <span className="sr-only">: bỏ lọc</span>
          </button>
        </p>
      )}

      <div className="mb-4 md:hidden">
        <button type="button" className={`${btn.secondary} w-full`} onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          Bộ lọc{activeFilters > 0 && ` (${activeFilters})`}
        </button>
      </div>
      <div className="max-md:hidden">
        <FilterBar>
          <SearchFilter
            key={q}
            initial={q}
            placeholder="Mã đơn (HL...) hoặc số điện thoại"
            label="Tìm theo mã đơn hoặc số điện thoại"
            onSearch={(text) => update({ q: text })}
          />
          <DateRangeFilter variant="bar" from={from} to={to} onChange={(r) => update(r)} />
        </FilterBar>
      </div>
      {status === 'CANCELLED' && (
        <div className="mb-4 md:max-w-xs">
          <select
            aria-label="Lý do huỷ"
            value={cancelReasonCode}
            onChange={(e) => update({ cancelReasonCode: e.target.value })}
            className={filterInput}
          >
            <option value="">Mọi lý do huỷ</option>
            {(Object.keys(CANCEL_REASON_LABEL) as CancelReasonCode[]).map((c) => (
              <option key={c} value={c}>
                {CANCEL_REASON_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
      )}
      {sheetOpen && (
        <FilterSheet
          q={q}
          from={from}
          to={to}
          onClose={() => setSheetOpen(false)}
          onApply={(f) => {
            setSheetOpen(false)
            update(f)
          }}
        />
      )}

      {error ? (
        <ErrorMessage message={error.message} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title={overdue ? 'Không có đơn nào chờ quá 24 giờ.' : 'Không có đơn hàng nào.'}>
          {(status || from || to || q || cancelReasonCode) && (
            <button type="button" className={btn.link} onClick={() => setParams(new URLSearchParams())}>
              Xoá bộ lọc
            </button>
          )}
        </EmptyState>
      ) : (
        <div aria-busy={loading}>
          <OrderCards rows={rows} />
          <OrderTable rows={rows} />
          <Pagination page={data.page.page} totalPages={data.page.totalPages} onChange={(p) => update({ page: String(p) })} />
        </div>
      )}
    </>
  )
}
