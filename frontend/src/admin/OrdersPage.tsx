import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { StatusBadge } from '../components/OrderDetails'
import type { OrderStatus } from '../lib/api'
import { adminApi, type AdminOrderRow } from '../lib/adminApi'
import { formatAdminDateTime, formatPrice, formatRelative, formatShortDateTime } from '../lib/format'
import { ORDER_STATUS_LABEL, ORDER_STATUSES } from '../lib/orderStatus'
import { useAsync } from '../lib/useAsync'
import { DateRangeFilter } from './DateField'
import { FlagIcon } from './phoneFlags'
import { btn, input, table } from './styles'
import { Dialog, EmptyState, PageHeader, Pagination } from './ui'

const STATUSES: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] })),
]

function SearchForm({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const [search, setSearch] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSearch(search.trim())
  }
  return (
    <form onSubmit={submit} role="search" className="flex gap-2">
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
  )
}

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
      <div className="font-medium break-words text-stone-900">{o.customerName}</div>
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
    <div className={`${table.wrap} hidden md:block`}>
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
              className="cursor-pointer hover:bg-stone-50"
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
    </div>
  )
}

/** Filters live in the URL, so a filtered list can be bookmarked and survives going back from an order. */
export default function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? '') as OrderStatus | ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const chips = useRef<HTMLDivElement>(null)

  const { data, error, loading, reload } = useAsync(
    (signal) => adminApi.orders({ status, from, to, q, page }, signal),
    [status, from, to, q, page],
  )

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
    setParams(next)
  }

  const activeFilters = (q ? 1 : 0) + (from || to ? 1 : 0)

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

      <div ref={chips} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="group" aria-label="Lọc theo trạng thái">
        {STATUSES.map((s) => (
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
          </button>
        ))}
      </div>

      <div className="mb-4 md:hidden">
        <button type="button" className={`${btn.secondary} w-full`} onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          Bộ lọc{activeFilters > 0 && ` (${activeFilters})`}
        </button>
      </div>
      <div className="mb-4 hidden gap-4 md:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <SearchForm key={q} initial={q} onSearch={(text) => update({ q: text })} />
        <DateRangeFilter from={from} to={to} onChange={(r) => update(r)} />
      </div>
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
          <OrderCards rows={data.page.items} />
          <OrderTable rows={data.page.items} />
          <Pagination page={data.page.page} totalPages={data.page.totalPages} onChange={(p) => update({ page: String(p) })} />
        </div>
      )}
    </>
  )
}
