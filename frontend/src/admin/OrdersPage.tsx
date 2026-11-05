import { RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { ErrorMessage } from '../components/Feedback'
import { StatusBadge } from '../components/OrderDetails'
import { useToast } from '../components/Toast'
import type { OrderStatus } from '../lib/api'
import { adminApi, type AdminOrderRow } from '../lib/adminApi'
import { formatAdminDateTime, formatPrice, formatRelative, formatShortDateTime } from '../lib/format'
import { CANCEL_REASON_LABEL, ORDER_STATUS_LABEL, ORDER_STATUSES, type CancelReasonCode } from '../lib/orderStatus'
import { useAsync } from '../lib/useAsync'
import { Skeleton } from './Skeleton'
import { DateRangeFilter } from './DateField'
import { DeleteOrdersDialog } from './DeleteOrdersDialog'
import { deleteResultMessage, isClosed, NOT_CLOSED_HINT } from './orderDeletion'
import { vnTodayIso } from './dates'
import { OVERDUE_PARAM } from './labels'
import { useNewOrders, useOnNewOrder } from './newOrders'
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

/** Orders ticked for deletion (ADMIN): code → status. Null where the current account cannot delete. */
interface Selection {
  selected: Map<string, OrderStatus>
  toggle: (o: AdminOrderRow) => void
  /** Ticks every closed order of the page, or unticks them when all are ticked */
  toggleAll: () => void
  all: boolean
  some: boolean
}

function RowCheckbox({ o, selection }: { o: AdminOrderRow; selection: Selection }) {
  const closed = isClosed(o.status)
  return (
    // The hint sits on the wrapper: a disabled box gets no hover
    <span title={closed ? undefined : NOT_CLOSED_HINT} className="inline-flex">
      <input
        type="checkbox"
        checked={selection.selected.has(o.code)}
        disabled={!closed}
        onChange={() => selection.toggle(o)}
        aria-label={closed ? `Chọn đơn ${o.code}` : `Đơn ${o.code}: ${NOT_CLOSED_HINT}`}
        className="size-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
      />
    </span>
  )
}

function SelectAll({ selection, className = '' }: { selection: Selection; className?: string }) {
  return (
    <input
      type="checkbox"
      checked={selection.all}
      ref={(el) => {
        if (el) el.indeterminate = selection.some && !selection.all
      }}
      onChange={selection.toggleAll}
      aria-label="Chọn tất cả đơn đã đóng trong trang"
      className={`size-4 cursor-pointer accent-brand-600 ${className}`}
    />
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
function OrderCards({ rows, selection }: { rows: AdminOrderRow[]; selection: Selection | null }) {
  return (
    <ul className="space-y-3 md:hidden">
      {selection && (
        <li>
          <label className="flex items-center gap-3 px-1 text-sm font-medium text-stone-700">
            <SelectAll selection={selection} />
            Chọn tất cả đơn đã đóng trong trang
          </label>
        </li>
      )}
      {rows.map((o) => (
        <li key={o.code} className="flex items-stretch gap-2">
          {selection && (
            // A wide tap target beside the card, which opens the order
            <label className="flex w-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-stone-200 bg-white has-disabled:cursor-not-allowed has-disabled:bg-stone-50">
              <RowCheckbox o={o} selection={selection} />
            </label>
          )}
          <Link
            to={`/admin/don-hang/${o.code}`}
            className="block min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white p-4 hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-brand-700"
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
function OrderTable({ rows, selection }: { rows: AdminOrderRow[]; selection: Selection | null }) {
  const navigate = useNavigate()
  return (
    <TableFrame className="hidden md:block">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {selection && (
              <th className={`${table.th} w-10`}>
                <SelectAll selection={selection} className="align-middle" />
              </th>
            )}
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
                // The link handles its own clicks (and middle/ctrl-click); the checkbox cell only ticks
                if (!(e.target as HTMLElement).closest('a, [data-select]')) navigate(`/admin/don-hang/${o.code}`)
              }}
            >
              {selection && (
                <td className={`${table.td} w-10`} data-select>
                  <RowCheckbox o={o} selection={selection} />
                </td>
              )}
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
  const isAdmin = useAuth().user?.role === 'ADMIN'
  const toast = useToast()
  const { refresh: refreshNewOrders } = useNewOrders()
  // Ticked orders belong to the filters and page they were ticked on: another view starts with none
  const [ticked, setTicked] = useState<{ view: string; orders: Map<string, OrderStatus> }>({ view: '', orders: new Map() })
  const [deleting, setDeleting] = useState(false)

  const { data, error, loading, reload } = useAsync(
    (signal) => adminApi.orders({ status, from, to: listTo, q, cancelReasonCode, page }, signal),
    [status, from, listTo, q, cancelReasonCode, page],
  )
  // Number of orders behind each status chip, for the same search and dates (one tiny request per status)
  const countsQuery = useAsync(
    (signal) =>
      Promise.all(STATUSES.map((s) => adminApi.orders({ status: s.value, from, to, q, size: 1 }, signal).then((r) => r.page.totalItems))),
    [from, to, q],
  )
  const counts = countsQuery.data
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

  const view = params.toString()
  const selected = ticked.view === view ? ticked.orders : new Map<string, OrderStatus>()
  const closedRows = rows.filter((o) => isClosed(o.status))
  const allTicked = closedRows.length > 0 && closedRows.every((o) => selected.has(o.code))
  const selection: Selection | null = isAdmin
    ? {
        selected,
        all: allTicked,
        some: selected.size > 0,
        toggle: (o) => {
          const next = new Map(selected)
          if (next.has(o.code)) next.delete(o.code)
          else next.set(o.code, o.status)
          setTicked({ view, orders: next })
        },
        toggleAll: () => setTicked({ view, orders: allTicked ? new Map() : new Map(closedRows.map((o) => [o.code, o.status])) }),
      }
    : null

  // A new order (the layout polls every 20 s): on the first page with no filter the list reloads by itself; anywhere
  // else a bar offers to reload, so the rows being looked at do not move. The bar belongs to the current filters.
  const filtered = Boolean(status || from || to || q || cancelReasonCode)
  const [staleFor, setStaleFor] = useState<string | null>(null)
  const stale = staleFor === params.toString()
  useOnNewOrder(() => {
    countsQuery.reload()
    if (!filtered && page === 0) reload()
    else setStaleFor(params.toString())
  })

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

      {stale && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-stone-800">
          <span className="font-medium">Có đơn mới</span>
          <button
            type="button"
            onClick={() => {
              setStaleFor(null)
              reload()
            }}
            className={`${btn.secondary} py-1.5`}
          >
            <RefreshCw aria-hidden className="size-4" />
            Tải lại
          </button>
        </div>
      )}

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
        <Skeleton variant="table" />
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
          <OrderCards rows={rows} selection={selection} />
          <OrderTable rows={rows} selection={selection} />
          <Pagination page={data.page.page} totalPages={data.page.totalPages} onChange={(p) => update({ page: String(p) })} />
        </div>
      )}

      {selected.size > 0 && (
        // Stays at the bottom of the screen while the list scrolls
        <div
          role="region"
          aria-label="Đơn đã chọn"
          className="sticky bottom-3 z-20 mt-4 flex items-center justify-between gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg"
        >
          <span className="font-medium">
            Đã chọn <span className="tabular-nums">{selected.size}</span> đơn
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-lg px-3 py-1.5 text-stone-300 hover:bg-white/10 hover:text-white" onClick={() => setTicked({ view, orders: new Map() })}>
              Bỏ chọn
            </button>
            <button type="button" className={`${btn.danger} py-1.5`} onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden className="size-4" />
              Xoá
            </button>
          </div>
        </div>
      )}
      {deleting && (
        <DeleteOrdersDialog
          orders={[...selected].map(([code, s]) => ({ code, status: s }))}
          onClose={() => setDeleting(false)}
          onDone={(result) => {
            setDeleting(false)
            setTicked({ view, orders: new Map() })
            toast({ message: deleteResultMessage(result), tone: result.deleted.length > 0 ? 'success' : 'error' })
            reload()
            countsQuery.reload()
            refreshNewOrders()
          }}
        />
      )}
    </>
  )
}
