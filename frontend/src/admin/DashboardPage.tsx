import { Check, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { StatusBadge } from '../components/OrderDetails'
import { adminApi, type DashboardDay, type DashboardDayTotals } from '../lib/adminApi'
import { formatPrice } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { axisTicks, shortMoney } from './chartAxis'
import { Calendar } from './DateField'
import { OVERDUE_PARAM } from './labels'
import { addDays, fromIso, isoToDisplay, vnTodayIso, WEEKDAY_NAMES, WEEKDAYS } from './dates'
import { card, table } from './styles'
import { PageHeader } from './ui'

/** The day view goes back this far (the API refuses older days) */
const MAX_DAYS_BACK = 365
const DAY_ORDERS = 20
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Days already loaded in this session: switching back shows them at once while they refresh. */
const dayCache = new Map<string, DashboardDay>()

const timeFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })
const dayMonth = (iso: string) => isoToDisplay(iso).slice(0, 5)
const weekday = (iso: string) => (fromIso(iso).getUTCDay() + 6) % 7
const shortWeekday = (iso: string) => WEEKDAYS[weekday(iso)]
/** "Thứ Bảy, 18/10/2026" */
const longDay = (iso: string) => `${WEEKDAY_NAMES[weekday(iso)]}, ${isoToDisplay(iso)}`

/** "Hôm nay", "Hôm qua", or the weekday and date. */
function dayName(iso: string, today: string): string | null {
  if (iso === today) return 'Hôm nay'
  if (iso === addDays(today, -1)) return 'Hôm qua'
  return null
}

/** Orange while something waits (value > 0), faded with a ✓ when there is nothing to do. The whole card opens the list. */
function NowCard({ label, value, to, hint }: { label: string; value: number; to: string; hint?: string }) {
  const waiting = value > 0
  return (
    <Link
      to={to}
      className={`group block rounded-2xl border p-5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
        waiting ? 'border-orange-300 bg-orange-50 hover:border-orange-400 hover:shadow-sm' : 'border-stone-200 bg-white hover:border-brand-300'
      }`}
    >
      <p className="flex items-center justify-between gap-2 text-sm text-stone-600">
        {label}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-stone-600" />
      </p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${waiting ? 'text-orange-700' : 'text-stone-400'}`}>{value}</p>
      {waiting ? (
        hint && (
          <p className="mt-1 truncate text-xs text-stone-700" title={hint}>
            {hint}
          </p>
        )
      ) : (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-700">
          <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
          Không có việc tồn
        </p>
      )}
    </Link>
  )
}

/**
 * "▲ 2 so với hôm qua (+50%)" / "▼ 150.000₫" / "Không đổi". Green when the change is good, red when bad (more
 * cancellations is bad); no percentage when the day before was 0.
 */
function Change({ now, before, money = false, upIsBad = false, versus }: { now: number; before: number; money?: boolean; upIsBad?: boolean; versus: string }) {
  const diff = now - before
  if (diff === 0) return <p className="mt-1 text-xs text-stone-500">Không đổi {versus}</p>
  const amount = money ? formatPrice(Math.abs(diff)) : String(Math.abs(diff))
  const percent = before > 0 ? ` (${diff > 0 ? '+' : '−'}${Math.round((Math.abs(diff) / before) * 100)}%)` : ''
  const good = diff > 0 !== upIsBad
  return (
    <p className={`mt-1 text-xs font-medium tabular-nums ${good ? 'text-brand-700' : 'text-red-700'}`}>
      <span aria-hidden>{diff > 0 ? '▲' : '▼'}</span>
      <span className="sr-only">{diff > 0 ? 'Tăng' : 'Giảm'}</span> {amount} {versus}
      {percent}
    </p>
  )
}

function DayStat({ label, children, change, extra }: { label: string; children: string; change: ReactNode; extra?: string | null }) {
  return (
    <div className={`${card} min-w-0 p-4 sm:p-5`}>
      <p className="text-sm text-stone-600">{label}</p>
      <p className="mt-1 truncate text-xl font-bold text-stone-900 tabular-nums sm:text-2xl">{children}</p>
      {change}
      {extra && <p className="mt-1 truncate text-xs text-muted">{extra}</p>}
    </div>
  )
}

function DayStats({ day, versus }: { day: DashboardDayTotals & { previous: DashboardDayTotals }; versus: string }) {
  const p = day.previous
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <DayStat label="Đơn mới" change={<Change now={day.ordersCreated} before={p.ordersCreated} versus={versus} />}>
        {String(day.ordersCreated)}
      </DayStat>
      <DayStat label="Giá trị đơn đặt" change={<Change now={day.grossValue} before={p.grossValue} money versus={versus} />}>
        {formatPrice(day.grossValue)}
      </DayStat>
      <DayStat
        label="Đơn huỷ"
        change={<Change now={day.cancelled} before={p.cancelled} upIsBad versus={versus} />}
        extra={day.topCancelReason && `Lý do nhiều nhất: ${day.topCancelReason}`}
      >
        {String(day.cancelled)}
      </DayStat>
      <DayStat label="Doanh thu (đã giao)" change={<Change now={day.revenue} before={p.revenue} money versus={versus} />}>
        {formatPrice(day.revenue)}
      </DayStat>
    </div>
  )
}

function ChevronIcon({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path d={dir === 'prev' ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const roundBtn =
  'flex size-10 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white'
const quickBtn = (active: boolean) =>
  `shrink-0 rounded-full px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
    active ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
  }`

/** ‹ "Hôm nay · Thứ Bảy, 18/10/2026" › + Hôm nay / Hôm qua + calendar. Phones: one row, short label, no "Hôm qua". */
function DayPicker({ date, today, min, onChange }: { date: string; today: string; min: string; onChange: (iso: string) => void }) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const calendarButton = useRef<HTMLButtonElement>(null)
  const yesterday = addDays(today, -1)
  const name = dayName(date, today)

  useEffect(() => {
    if (!calendarOpen) return
    const onPointer = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setCalendarOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [calendarOpen])

  return (
    <div ref={wrapper} className="relative flex items-center gap-2">
      <button type="button" onClick={() => onChange(addDays(date, -1))} disabled={date <= min} aria-label="Ngày trước" className={roundBtn}>
        <ChevronIcon dir="prev" />
      </button>
      <p aria-live="polite" className="min-w-0 text-center text-sm font-semibold whitespace-nowrap text-stone-900 tabular-nums sm:min-w-64 sm:text-base">
        <span className="sm:hidden">{name ?? `${shortWeekday(date)}, ${dayMonth(date)}`}</span>
        <span className="max-sm:hidden">
          {name && `${name} · `}
          {longDay(date)}
        </span>
      </p>
      <button type="button" onClick={() => onChange(addDays(date, 1))} disabled={date >= today} aria-label="Ngày sau" className={roundBtn}>
        <ChevronIcon dir="next" />
      </button>
      <button type="button" onClick={() => onChange(today)} aria-pressed={date === today} className={`${quickBtn(date === today)} ml-auto sm:ml-2`}>
        Hôm nay
      </button>
      <button type="button" onClick={() => onChange(yesterday)} aria-pressed={date === yesterday} className={`${quickBtn(date === yesterday)} max-sm:hidden`}>
        Hôm qua
      </button>
      <button
        ref={calendarButton}
        type="button"
        onClick={() => setCalendarOpen((o) => !o)}
        aria-label="Chọn ngày từ lịch"
        aria-expanded={calendarOpen}
        aria-haspopup="dialog"
        className={roundBtn}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="4.5" width="14" height="12" rx="2" />
          <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
        </svg>
      </button>
      {calendarOpen && (
        <div className="absolute top-full left-0 z-40">
          <Calendar
            label="ngày"
            value={date}
            min={min}
            max={today}
            onPick={(iso) => {
              setCalendarOpen(false)
              onChange(iso)
              calendarButton.current?.focus()
            }}
            onClose={() => {
              setCalendarOpen(false)
              calendarButton.current?.focus()
            }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * 7 columns ending on the selected day (drawn darker), over a money axis. Each column is a button that selects its
 * day; pointing at it (or focusing it) shows the amount and the number of orders. A day without revenue keeps a faint
 * hatched stub, so it reads as "0" rather than as missing data.
 */
function RevenueChart({ days, selected, min, onSelect }: { days: DashboardDay['last7Days']; selected: string; min: string; onSelect: (iso: string) => void }) {
  const ticks = axisTicks(Math.max(...days.map((d) => d.revenue)))
  const top = ticks[ticks.length - 1]
  const total = days.reduce((sum, d) => sum + d.revenue, 0)
  const orders = days.reduce((sum, d) => sum + d.orders, 0)
  const [pointed, setPointed] = useState<string | null>(null)
  // Narrow screens scroll the chart: keep the selected day (the last column) in view
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth
  }, [selected])
  const pct = (v: number) => `${(v / top) * 100}%`
  return (
    <section className={`${card} p-5`} aria-labelledby="revenue-title">
      <h2 id="revenue-title" className="font-semibold text-stone-900">
        Doanh thu theo ngày
      </h2>
      <p className="text-sm text-muted">Chỉ tính đơn đã giao thành công, theo ngày hoàn tất.</p>
      <p className="mt-2 text-sm text-stone-700 tabular-nums">
        7 ngày đến {dayMonth(selected)}: <strong className="text-stone-900">{formatPrice(total)}</strong> · {orders} đơn
      </p>
      <div ref={scroller} className="-mx-1 mt-1 overflow-x-auto px-1 pb-1">
        {/* pt-12 leaves room for the tooltip of the tallest column */}
        <div className="flex min-w-[18rem] gap-1.5 pt-12 sm:gap-2">
          <div aria-hidden className="relative h-44 w-9 shrink-0 text-right text-xs text-muted tabular-nums">
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: pct(t) }}>
                {shortMoney(t)}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-44">
              {ticks.map((t) => (
                <span
                  key={t}
                  className={`absolute inset-x-0 border-t ${t === 0 ? 'border-stone-300' : 'border-dashed border-stone-200'}`}
                  style={{ bottom: pct(t) }}
                />
              ))}
            </div>
            <ol className="relative flex gap-1 sm:gap-2" aria-label="Biểu đồ doanh thu 7 ngày" onPointerLeave={() => setPointed(null)}>
              {days.map((d, i) => {
                const active = d.date === selected
                return (
                  <li key={d.date} className="flex min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onSelect(d.date)}
                      onPointerEnter={() => setPointed(d.date)}
                      onFocus={() => setPointed(d.date)}
                      onBlur={() => setPointed(null)}
                      disabled={d.date < min}
                      aria-pressed={active}
                      aria-label={`Xem ngày ${dayMonth(d.date)}: ${formatPrice(d.revenue)}, ${d.orders} đơn`}
                      className="group flex w-full flex-col items-center gap-1 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed"
                    >
                      <span aria-hidden className="relative flex h-44 w-full max-w-12 items-end">
                        {d.revenue === 0 ? (
                          // Short, hatched and faint: "nothing" at a glance, never mistaken for a value
                          <span
                            className={`h-[12%] w-full rounded-t-lg border border-b-0 border-dashed bg-[repeating-linear-gradient(135deg,var(--color-stone-200)_0_3px,transparent_3px_7px)] ${
                              active ? 'border-stone-500' : 'border-stone-300 group-hover:border-stone-400'
                            }`}
                          />
                        ) : (
                          <span
                            className={`w-full rounded-t-lg transition-colors ${active ? 'bg-brand-700' : 'bg-brand-500/45 group-hover:bg-brand-500'}`}
                            style={{ height: pct(d.revenue) }}
                          />
                        )}
                        {pointed === d.date && (
                          <span
                            className={`absolute z-10 mb-1.5 rounded-lg bg-stone-900 px-2.5 py-1.5 text-left text-xs whitespace-nowrap text-white shadow-lg ${
                              i === 0 ? 'left-0' : i === days.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                            }`}
                            style={{ bottom: d.revenue === 0 ? '12%' : pct(d.revenue) }}
                          >
                            <span className="block font-semibold tabular-nums">{formatPrice(d.revenue)}</span>
                            <span className="block text-stone-300">{d.revenue === 0 ? 'Không có đơn giao xong' : `${d.orders} đơn`}</span>
                          </span>
                        )}
                      </span>
                      {/* Weekday over the date on phones, side by side from 640px */}
                      <span
                        aria-hidden
                        className={`flex flex-col items-center text-xs leading-tight whitespace-nowrap tabular-nums sm:flex-row sm:gap-1 ${
                          active ? 'font-bold text-stone-900' : 'text-stone-600'
                        }`}
                      >
                        <span>{shortWeekday(d.date)}</span>
                        <span>{dayMonth(d.date)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

const NO_ORDERS = 'Không có đơn nào trong ngày này'

function TopProducts({ items }: { items: DashboardDay['topProducts'] }) {
  return (
    <section className={`${card} p-5`} aria-labelledby="top-title">
      <h2 id="top-title" className="font-semibold text-stone-900">
        Bán chạy trong ngày
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{NO_ORDERS}</p>
      ) : (
        <ol className="mt-3 divide-y divide-stone-100">
          {items.map((p, i) => (
            <li key={p.productId} className="flex items-baseline gap-3 py-2 text-sm">
              <span className="w-4 shrink-0 text-muted tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-stone-900">{p.name}</span>
              <span className="shrink-0 text-stone-600 tabular-nums">×{p.quantity}</span>
              <span className="w-24 shrink-0 text-right font-semibold text-stone-900 tabular-nums">{formatPrice(p.amount)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function DayOrders({ day }: { day: DashboardDay }) {
  return (
    <section aria-labelledby="day-orders-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="day-orders-title" className="font-semibold text-stone-900">
          Đơn của ngày
        </h2>
        {day.ordersCreated > 0 && (
          <Link to={`/admin/don-hang?from=${day.date}&to=${day.date}`} className="text-sm font-semibold text-brand-700 hover:underline">
            Xem tất cả{day.ordersCreated > DAY_ORDERS ? ` (${day.ordersCreated})` : ''} →
          </Link>
        )}
      </div>
      {day.orders.length === 0 ? (
        <p className={`${card} px-5 py-8 text-center text-sm text-muted`}>{NO_ORDERS}</p>
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th className={table.th}>Mã đơn</th>
                <th className={table.th}>Giờ</th>
                <th className={table.th}>Khách</th>
                <th className={`${table.th} text-right`}>Tổng tiền</th>
                <th className={table.th}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {day.orders.map((o) => (
                <tr key={o.code}>
                  <td className={table.td}>
                    <Link to={`/admin/don-hang/${o.code}`} className="font-semibold text-brand-700 hover:underline">
                      {o.code}
                    </Link>
                  </td>
                  <td className={`${table.td} tabular-nums`}>{timeFormat.format(new Date(o.createdAt))}</td>
                  <td className={table.td}>{o.customerName}</td>
                  <td className={`${table.td} text-right tabular-nums`}>{formatPrice(o.total)}</td>
                  <td className={table.td}>
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/**
 * Back-office home. "Cần xử lý ngay" (pending orders, low stock) does not depend on the day; "Tổng quan ngày" shows
 * one Vietnam day, kept in the URL (?ngay=yyyy-MM-dd, none for today). ← / → inside it move a day.
 */
export default function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const today = vnTodayIso()
  const min = addDays(today, -MAX_DAYS_BACK)
  const raw = params.get('ngay')
  const valid =
    raw === null || (ISO_DAY.test(raw) && !Number.isNaN(fromIso(raw).getTime()) && addDays(raw, 0) === raw && raw >= min && raw < today)
  const date = valid && raw ? raw : today

  const now = useAsync((signal) => adminApi.dashboardNow(signal), [])
  const day = useAsync(
    async (signal) => {
      const value = await adminApi.dashboardDay(date, signal)
      dayCache.set(date, value)
      return value
    },
    [date],
  )
  // While a new day loads: that day from the cache, else the previous day's numbers (dimmed)
  const shown = dayCache.get(date) ?? day.data

  const select = (iso: string) => {
    if (iso < min || iso > today) return
    const next = new URLSearchParams(params)
    if (iso === today) next.delete('ngay')
    else next.set('ngay', iso)
    setParams(next, { preventScrollReset: true })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    if ((e.target as HTMLElement).closest('input, textarea, select, [role="dialog"]')) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      select(addDays(date, e.key === 'ArrowLeft' ? -1 : 1))
    }
  }

  if (!valid || raw === today) {
    const next = new URLSearchParams(params)
    next.delete('ngay')
    return <Navigate to={{ search: next.size ? `?${next}` : '' }} replace />
  }

  const versus = date === today ? 'so với hôm qua' : 'so với ngày trước'
  return (
    <>
      <PageHeader title="Tổng quan" />

      <section aria-labelledby="now-title">
        <h2 id="now-title" className="mb-3 font-semibold text-stone-900">
          Cần xử lý ngay
        </h2>
        {now.error && !now.data ? (
          <ErrorMessage message={now.error.message} onRetry={now.reload} />
        ) : !now.data ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <NowCard label="Đơn chờ xác nhận" value={now.data.pendingCount} to="/admin/don-hang?status=PENDING" hint="Gọi khách rồi xác nhận đơn" />
            <NowCard
              label="Đơn chờ quá 24 giờ"
              value={now.data.pendingOver24h}
              to={`/admin/don-hang?status=PENDING&${OVERDUE_PARAM}=1`}
              hint="Cần gọi xác nhận sớm"
            />
            <NowCard
              label="Sản phẩm sắp hết hàng"
              value={now.data.lowStockCount}
              to="/admin/kho?low=1"
              hint={now.data.lowStock.slice(0, 3).map((p) => p.name).join(', ') || undefined}
            />
          </div>
        )}
      </section>

      {/* Arrow keys anywhere in here (outside text fields and the calendar) move a day */}
      <section aria-labelledby="day-title" onKeyDown={onKeyDown} className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="day-title" className="font-semibold text-stone-900">
            Tổng quan ngày
          </h2>
          <div className="w-full sm:w-auto">
            <DayPicker date={date} today={today} min={min} onChange={select} />
          </div>
        </div>

        {day.error && !shown ? (
          <ErrorMessage message={day.error.message} onRetry={day.reload} />
        ) : !shown ? (
          <Spinner />
        ) : (
          <div aria-busy={day.loading} className={`space-y-6 transition-opacity ${day.loading && !dayCache.has(date) ? 'opacity-60' : ''}`}>
            <DayStats day={shown} versus={versus} />
            <RevenueChart days={shown.last7Days} selected={date} min={min} onSelect={select} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <TopProducts items={shown.topProducts} />
              <DayOrders day={shown} />
            </div>
          </div>
        )}
      </section>
    </>
  )
}
