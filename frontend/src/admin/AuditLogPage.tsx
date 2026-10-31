import {
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  PackagePlus,
  Pencil,
  Plus,
  Trash2,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorMessage } from '../components/Feedback'
import { adminApi, userApi, type AuditRow } from '../lib/adminApi'
import { formatAdminDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { Skeleton } from './Skeleton'
import {
  ACTION_LABEL,
  actionIcon,
  actionLabel,
  actorText,
  changeRows,
  dayHeading,
  ENTITY_LABEL,
  entityLink,
  fieldLabel,
  formatAuditValue,
  rowReason,
  snapshot,
  type AuditIcon,
  type AuditTone,
  type ValueContext,
} from './auditLabels'
import { DateRangeFilter } from './DateField'
import { vnTodayIso } from './dates'
import { btn, filterInput } from './styles'
import { EmptyState, FilterBar, PageHeader } from './ui'

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

const ICONS: Record<AuditIcon, LucideIcon> = {
  trash: Trash2,
  eyeOff: EyeOff,
  eye: Eye,
  xCircle: CircleX,
  lock: Lock,
  unlock: LockOpen,
  checkCircle: CircleCheck,
  truck: Truck,
  packagePlus: PackagePlus,
  clipboardCheck: ClipboardCheck,
  plus: Plus,
  pencil: Pencil,
}

const TONES: Record<AuditTone, string> = {
  red: 'bg-red-100 text-red-700',
  gray: 'bg-stone-200 text-stone-700',
  green: 'bg-brand-100 text-brand-800',
  blue: 'bg-blue-100 text-blue-800',
}

/**
 * What was done to what, who did it and when. Phones: two lines. From 1024px: one line with who, the changes link and
 * the time in columns, plus a second line only for a reason. The changes fold out underneath.
 */
export function AuditEntry({ row, categories }: { row: AuditRow; categories: Map<number, string> }) {
  const [open, setOpen] = useState(false)
  const link = entityLink(row)
  const reason = rowReason(row)
  const hasChanges = changeRows(row).length > 0
  const { icon, tone } = actionIcon(row.action)
  const Icon = ICONS[icon]
  const full = formatAdminDateTime(row.createdAt)
  const actor = actorText(row)
  const toggle = (className: string) =>
    hasChanges && (
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`text-xs font-semibold text-brand-700 hover:underline ${className}`}>
        {open ? 'Ẩn thay đổi' : 'Xem thay đổi'}
      </button>
    )
  return (
    <li className="flex min-w-0 gap-3 px-3 py-1.5 text-sm sm:px-4">
      <span aria-hidden className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>
        <Icon className="size-3.5" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <p className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-stone-900">{actionLabel(row.action)}</span>{' '}
            {row.entityLabel ? (
              <>
                {/* An order code alone says little: "Đơn hàng HL…"; names, emails and numbers speak for themselves */}
                {row.entityType === 'ORDER' && <span className="text-muted">Đơn hàng </span>}
                {link ? (
                  <Link to={link} className="font-medium text-brand-700 hover:underline" title={row.entityLabel}>
                    {row.entityLabel}
                  </Link>
                ) : (
                  <span className="font-medium text-stone-800" title={row.entityLabel}>
                    {row.entityLabel}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted">
                {ENTITY_LABEL[row.entityType] ?? row.entityType} #{row.entityId}
              </span>
            )}
          </p>
          <span className="hidden w-48 shrink-0 truncate text-xs text-stone-600 lg:block" title={actor}>
            {actor}
          </span>
          <span className="hidden w-24 shrink-0 lg:block">{toggle('')}</span>
          <time dateTime={row.createdAt} title={full} className="w-10 shrink-0 text-right text-xs text-muted tabular-nums">
            {full.slice(-5)}
          </time>
        </div>
        <p className={`mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-stone-600 ${reason ? '' : 'lg:hidden'}`}>
          <span className="min-w-0 break-words lg:hidden">{actor}</span>
          {reason && (
            <>
              <span aria-hidden className="lg:hidden">
                ·
              </span>
              <span className="min-w-0 break-words text-stone-800">Lý do: {reason}</span>
            </>
          )}
          {hasChanges && (
            <span aria-hidden className="lg:hidden">
              ·
            </span>
          )}
          {toggle('lg:hidden')}
        </p>
        {open && <ChangesTable row={row} categories={categories} />}
      </div>
    </li>
  )
}

/** Rows (newest first) cut into Vietnam days */
function byDay(rows: AuditRow[]): { day: string; rows: AuditRow[] }[] {
  const groups: { day: string; rows: AuditRow[] }[] = []
  for (const row of rows) {
    const day = vnTodayIso(new Date(row.createdAt))
    if (groups.at(-1)?.day === day) groups.at(-1)!.rows.push(row)
    else groups.push({ day, rows: [row] })
  }
  return groups
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

  const today = vnTodayIso()
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
      <PageHeader title="Nhật ký thao tác">
        {total !== null && (
          <p className="text-sm text-muted" aria-live="polite">
            {total.toLocaleString('vi-VN')} bản ghi{rows.length < total ? ` · đang hiện ${rows.length.toLocaleString('vi-VN')}` : ''}
          </p>
        )}
      </PageHeader>
      <FilterBar>
        <select aria-label="Người thao tác" value={actorId} onChange={(e) => update({ actor: e.target.value })} className={`${filterInput} md:w-48`}>
          <option value="">Mọi người thao tác</option>
          {actors.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.email})
            </option>
          ))}
        </select>
        <select aria-label="Loại đối tượng" value={entityType} onChange={(e) => update({ entityType: e.target.value })} className={`${filterInput} md:w-44`}>
          <option value="">Mọi đối tượng</option>
          {Object.entries(ENTITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Loại thao tác" value={action} onChange={(e) => update({ action: e.target.value })} className={`${filterInput} md:w-52`}>
          <option value="">Mọi thao tác</option>
          {Object.entries(ACTION_LABEL)
            .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </select>
        <DateRangeFilter variant="bar" from={from} to={to} onChange={(r) => update(r)} />
      </FilterBar>

      {error && rows.length === 0 ? (
        <ErrorMessage message={error.message} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : total === null ? (
        <Skeleton variant="list" />
      ) : rows.length === 0 ? (
        <EmptyState title="Không có thao tác nào khớp bộ lọc." />
      ) : (
        <div aria-busy={loading}>
          <div className="space-y-3">
            {byDay(rows).map((group) => (
              <section key={group.day} aria-labelledby={`audit-day-${group.day}`}>
                <h2 id={`audit-day-${group.day}`} className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
                  {dayHeading(group.day, today)}
                </h2>
                <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
                  {group.rows.map((row) => (
                    <AuditEntry key={row.id} row={row} categories={categories} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
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
