import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { adminApi, userApi, type AuditRow } from '../lib/adminApi'
import { formatAdminDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import {
  ACTION_LABEL,
  actionLabel,
  actorText,
  changeRows,
  ENTITY_LABEL,
  entityLink,
  fieldLabel,
  formatAuditValue,
  rowReason,
  snapshot,
  type ValueContext,
} from './auditLabels'
import { DateRangeFilter } from './DateField'
import { btn, input } from './styles'
import { EmptyState, PageHeader } from './ui'

const PAGE_SIZE = 50

function ChangesTable({ row, categories }: { row: AuditRow; categories: Map<number, string> }) {
  const rows = changeRows(row)
  const ctx: ValueContext = { entityType: row.entityType, action: row.action, categories }
  const created = snapshot(row.before) === null
  if (rows.length === 0) return <p className="mt-2 text-sm text-muted">Không có trường nào thay đổi.</p>
  const cell = 'border-t border-stone-200 px-3 py-2 align-top'
  return (
    // Scrolls inside the card on narrow screens instead of widening the page
    <div className="mt-2 max-w-full overflow-x-auto rounded-xl border border-stone-200">
      <table className="w-full min-w-[22rem] text-left text-sm">
        <thead className="bg-stone-50 text-xs text-muted uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Trường</th>
            {created ? (
              <th scope="col" className="px-3 py-2 font-semibold">Giá trị</th>
            ) : (
              <>
                <th scope="col" className="px-3 py-2 font-semibold">Trước</th>
                <th scope="col" className="px-3 py-2 font-semibold">Sau</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.field}>
              <th scope="row" className={`${cell} font-medium whitespace-nowrap text-stone-700`}>
                {fieldLabel(r.field)}
              </th>
              {created ? (
                <td className={`${cell} break-words text-stone-900`}>{formatAuditValue(r.field, r.after, ctx)}</td>
              ) : (
                <>
                  <td className={`${cell} break-words text-stone-600`}>{formatAuditValue(r.field, r.before, ctx)}</td>
                  <td className={`${cell} break-words text-stone-900`}>{formatAuditValue(r.field, r.after, ctx)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AuditEntry({ row, categories }: { row: AuditRow; categories: Map<number, string> }) {
  const [open, setOpen] = useState(false)
  const link = entityLink(row)
  const reason = rowReason(row)
  const hasChanges = changeRows(row).length > 0
  return (
    <li className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-bold text-stone-900">{actionLabel(row.action)}</span>
        <span className="text-muted" aria-hidden="true">·</span>
        <time dateTime={row.createdAt} className="text-muted tabular-nums">
          {formatAdminDateTime(row.createdAt)}
        </time>
      </p>
      <p className="mt-1 break-words text-stone-700">{actorText(row)}</p>
      <p className="mt-1 break-words text-stone-700">
        {row.entityLabel ? (
          <>
            {/* An order code alone says little: "Đơn hàng HL…"; names, emails and numbers speak for themselves */}
            {row.entityType === 'ORDER' && <span className="text-muted">Đơn hàng </span>}
            {link ? (
              <Link to={link} className="font-medium text-brand-700 hover:underline">
                {row.entityLabel}
              </Link>
            ) : (
              <span className="font-medium">{row.entityLabel}</span>
            )}
          </>
        ) : (
          <span className="text-muted">
            {ENTITY_LABEL[row.entityType] ?? row.entityType} #{row.entityId}
          </span>
        )}
      </p>
      {reason && <p className="mt-1 break-words text-stone-800">Lý do: {reason}</p>}
      {hasChanges && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="mt-2 text-sm font-semibold text-brand-700 hover:underline"
          >
            {open ? 'Ẩn thay đổi' : 'Xem thay đổi'}
          </button>
          {open && <ChangesTable row={row} categories={categories} />}
        </>
      )}
    </li>
  )
}

/** Admin only: who changed what, newest first, 50 at a time. */
export default function AuditLogPage() {
  const [params, setParams] = useSearchParams()
  const actorId = params.get('actor') ?? ''
  const entityType = params.get('entityType') ?? ''
  const action = params.get('action') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const actors = useAsync((signal) => userApi.auditActors(signal), [])
  const categoryList = useAsync((signal) => adminApi.categories(signal), [])
  const categories = useMemo(() => new Map((categoryList.data ?? []).map((c) => [c.id, c.name])), [categoryList.data])

  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [nextPage, setNextPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const filters = useMemo(() => ({ actorId, entityType, action, from, to }), [actorId, entityType, action, from, to])

  const load = async (page: number, signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const result = await userApi.auditLogs({ ...filters, page, size: PAGE_SIZE }, signal)
      setRows((current) => (page === 0 ? result.items : [...current, ...result.items]))
      setTotal(result.totalItems)
      setNextPage(page + 1)
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  // New filters: start again from the first page
  useEffect(() => {
    const controller = new AbortController()
    setRows([])
    setTotal(null)
    void load(0, controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, reloadKey])

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next)
  }

  return (
    <>
      <PageHeader title="Nhật ký thao tác" />
      <div className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
        <select aria-label="Người thao tác" value={actorId} onChange={(e) => update({ actor: e.target.value })} className={input}>
          <option value="">Mọi người thao tác</option>
          {actors.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.email})
            </option>
          ))}
        </select>
        <select aria-label="Loại đối tượng" value={entityType} onChange={(e) => update({ entityType: e.target.value })} className={input}>
          <option value="">Mọi đối tượng</option>
          {Object.entries(ENTITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Loại thao tác" value={action} onChange={(e) => update({ action: e.target.value })} className={input}>
          <option value="">Mọi thao tác</option>
          {Object.entries(ACTION_LABEL)
            .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </select>
        <div className="md:col-span-3 xl:col-span-1">
          <DateRangeFilter from={from} to={to} onChange={(r) => update(r)} />
        </div>
      </div>

      {total !== null && (
        <p className="mb-3 text-sm text-muted" aria-live="polite">
          {total.toLocaleString('vi-VN')} bản ghi{rows.length < total ? ` · đang hiện ${rows.length.toLocaleString('vi-VN')}` : ''}
        </p>
      )}

      {error && rows.length === 0 ? (
        <ErrorMessage message={error.message} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : total === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="Không có thao tác nào khớp bộ lọc." />
      ) : (
        <div aria-busy={loading}>
          <ul className="space-y-3">
            {rows.map((row) => (
              <AuditEntry key={row.id} row={row} categories={categories} />
            ))}
          </ul>
          {error && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error.message}
            </p>
          )}
          {rows.length < total && (
            <div className="mt-4 flex justify-center">
              <button type="button" className={btn.secondary} disabled={loading} onClick={() => void load(nextPage)}>
                {loading ? 'Đang tải...' : 'Tải thêm'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
