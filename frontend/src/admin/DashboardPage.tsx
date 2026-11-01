import { CalendarDays, Check, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { ErrorMessage } from '../components/Feedback'
import { StatusBadge } from '../components/OrderDetails'
import { adminApi, type DashboardDay, type DashboardDayTotals } from '../lib/adminApi'
import { formatPrice } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { Skeleton } from './Skeleton'
import { axisTicks, chartSource, chartWindow, shortMoney } from './chartAxis'
import { Calendar } from './DateField'
import { OVERDUE_PARAM } from './labels'
import { addDays, fromIso, isoToDisplay, vnTodayIso, WEEKDAY_NAMES, WEEKDAYS } from './dates'
import { card, table } from './styles'
import { PageHeader } from './ui'

/** The day view goes back this far (the API refuses older days) */
const MAX_DAYS_BACK = 365
/** Rows in "Bán chạy" and "Đơn của ngày" */
const LIST_ROWS = 5
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Days already loaded in this session: switching back shows them at once while they refresh. */
const dayCache = new Map<string, DashboardDay>()
/**
 * Revenue per day from every answer loaded (each brings the 7 days ending on its day), so moving along the chart
 * rarely needs a request for the chart alone.
 */
const revenueCache = new Map<string, { revenue: number; orders: number }>()

function remember(day: DashboardDay) {
  dayCache.set(day.date, day)
  for (const d of day.last7Days) revenueCache.set(d.date, { revenue: d.revenue, orders: d.orders })
}

const timeFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })
const dayMonth = (iso: string) => isoToDisplay(iso).slice(0, 5)
const weekday = (iso: string) => (fromIso(iso).getUTCDay() + 6) % 7
const shortWeekday = (iso: string) => WEEKDAYS[weekday(iso)]
/** "Thứ Bảy, 18/10/2026" */
const longDay = (iso: string) => `${WEEKDAY_NAMES[weekday(iso)]}, ${isoToDisplay(iso)}`
/** "CN, 01/11" */
const shortDay = (iso: string) => `${shortWeekday(iso)}, ${dayMonth(iso)}`
const daysBetween = (from: string, to: string) => Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86_400_000)

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

const roundBtn =
  'flex size-10 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white'

/** ‹ [Thứ Bảy, 01/11/2026] › + "Hôm nay" (only away from today) + calendar */
function DayControls({ date, today, min, onChange }: { date: string; today: string; min: string; onChange: (iso: string) => void }) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const calendarButton = useRef<HTMLButtonElement>(null)

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
        <ChevronLeft aria-hidden className="size-4" strokeWidth={2.25} />
      </button>
      <p aria-live="polite" className="min-w-0 text-center text-sm font-semibold whitespace-nowrap text-stone-900 tabular-nums sm:min-w-44">
        <span className="sm:hidden">{shortDay(date)}</span>
        <span className="max-sm:hidden">{longDay(date)}</span>
      </p>
      <button type="button" onClick={() => onChange(addDays(date, 1))} disabled={date >= today} aria-label="Ngày sau" className={roundBtn}>
        <ChevronRight aria-hidden className="size-4" strokeWidth={2.25} />
      </button>
      {date !== today && (
        <button
          type="button"
          onClick={() => onChange(today)}
          className="shrink-0 rounded-full border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          Hôm nay
        </button>
      )}
      <button
        ref={calendarButton}
        type="button"
        onClick={() => setCalendarOpen((o) => !o)}
        aria-label="Chọn ngày từ lịch"
        aria-expanded={calendarOpen}
        aria-haspopup="dialog"
        className={`${roundBtn} ml-auto sm:ml-0`}
      >
        <CalendarDays aria-hidden className="size-4.5" strokeWidth={1.75} />
      </button>
      {calendarOpen && (
        <div className="absolute top-full right-0 z-40">
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

type ChartPoint = { date: string; future: boolean; revenue?: number; orders?: number }

/**
 * "Doanh thu theo ngày" with the day picker in its header: 7 columns, the selected day always in the middle (3 days
 * before, 3 after; days not come yet are dashed and cannot be picked). Each column is a button picking its day; ←/→
 * while the chart has focus move a day. On a change the columns slide (250ms) to bring the new day to the middle.
 */
function DayChart({ points, date, today, min, onSelect }: { points: ChartPoint[]; date: string; today: string; min: string; onSelect: (iso: string) => void }) {
  const known = points.filter((p) => !p.future && p.revenue !== undefined)
  const ticks = axisTicks(Math.max(0, ...known.map((p) => p.revenue!)))
  const top = ticks[ticks.length - 1]
  const total = known.reduce((sum, p) => sum + p.revenue!, 0)
  const orders = known.reduce((sum, p) => sum + p.orders!, 0)
  const loading = points.some((p) => !p.future && p.revenue === undefined)
  // Hover details are for a mouse: a tap selects the day, which shows its amount anyway. Tied to the selected day it
  // was set under, so a change of day drops it
  const [hover, setHover] = useState<{ day: string; under: string } | null>(null)
  const pointed = hover?.under === date ? hover.day : null
  const setPointed = (day: string | null) => setHover(day ? { day, under: date } : null)
  const pct = (v: number) => `${(v / top) * 100}%`

  // Slide the columns from where the new middle day was, unless motion is reduced; keep focus on the middle column
  const track = useRef<HTMLOListElement>(null)
  const previous = useRef(date)
  useLayoutEffect(() => {
    const el = track.current
    const delta = daysBetween(previous.current, date)
    previous.current = date
    if (!el || delta === 0) return
    if (el.contains(document.activeElement)) el.children[3]?.querySelector('button')?.focus({ preventScroll: true })
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || Math.abs(delta) > 6 || !el.animate) return
    const columns = el.children
    const step = columns.length > 1 ? (columns[1] as HTMLElement).offsetLeft - (columns[0] as HTMLElement).offsetLeft : 0
    el.animate([{ transform: `translateX(${delta * step}px)` }, { transform: 'translateX(0)' }], { duration: 250, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' })
  }, [date])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    onSelect(addDays(date, e.key === 'ArrowLeft' ? -1 : 1))
  }

  const first = points[0].date
  const last = points[points.length - 1].date
  return (
    <section className={`${card} p-5`} aria-labelledby="day-title">
      {/* Phones: title, then the picker on its own line */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2 id="day-title" className="font-semibold text-stone-900">
            Doanh thu theo ngày
          </h2>
          <p className="mt-0.5 text-sm text-stone-700 tabular-nums">
            {dayMonth(first)} – {dayMonth(last)}:{' '}
            {loading ? <span className="text-muted">đang tải…</span> : <><strong className="text-stone-900">{formatPrice(total)}</strong> · {orders} đơn</>}
          </p>
          <p className="text-xs text-muted">Chỉ tính đơn đã giao thành công, theo ngày hoàn tất.</p>
        </div>
        <DayControls date={date} today={today} min={min} onChange={onSelect} />
      </div>

      <div className="mt-4 flex gap-1.5 sm:gap-2" onKeyDown={onKeyDown}>
        {/* The axis lines up with the bar area: below the 2.5rem kept for the amount over the selected column */}
        <div aria-hidden className="relative mt-10 h-44 w-9 shrink-0 text-right text-xs text-muted tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: pct(t) }}>
              {shortMoney(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 h-44">
            {ticks.map((t) => (
              <span
                key={t}
                className={`absolute inset-x-0 border-t ${t === 0 ? 'border-stone-300' : 'border-dashed border-stone-200'}`}
                style={{ bottom: pct(t) }}
              />
            ))}
          </div>
          <ol ref={track} className="relative flex gap-1 sm:gap-2" aria-label={`Doanh thu 7 ngày quanh ${shortDay(date)}`} onPointerLeave={() => setPointed(null)}>
            {points.map((p, i) => {
              const active = p.date === date
              const blocked = p.future || p.date < min
              const amount = p.revenue !== undefined ? formatPrice(p.revenue) : null
              const label = `${shortWeekday(p.date)} ${dayMonth(p.date)}`
              // Columns are keyed by position: the DOM stays put and the whole row slides
              return (
                <li key={i} className="flex min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onSelect(p.date)}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setPointed(p.date)}
                    onFocus={(e) => e.currentTarget.matches(':focus-visible') && setPointed(p.date)}
                    onBlur={() => setPointed(null)}
                    disabled={blocked}
                    aria-pressed={active}
                    aria-label={p.future ? `${label}, chưa tới` : `Chọn ${label}, doanh thu ${amount ?? 'đang tải'}`}
                    className="group relative flex w-full flex-col items-center rounded-xl pb-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-default"
                  >
                    {/* Pale band behind the selected day, the full height of the chart */}
                    {active && <span aria-hidden className="absolute inset-0 rounded-xl bg-brand-50" />}
                    <span aria-hidden className="relative mt-10 flex h-44 w-full max-w-12 items-end px-1 sm:px-0">
                      {p.future ? (
                        <span className="h-full w-full rounded-t-lg border border-b-0 border-dashed border-stone-300" />
                      ) : p.revenue === undefined ? (
                        <span className="h-1/3 w-full animate-pulse rounded-t-lg bg-stone-200" />
                      ) : p.revenue === 0 ? (
                        // Short, hatched and faint: "nothing" at a glance, never mistaken for a value
                        <span
                          className={`h-[12%] w-full rounded-t-lg border border-b-0 border-dashed bg-[repeating-linear-gradient(135deg,var(--color-stone-200)_0_3px,transparent_3px_7px)] ${
                            active ? 'border-stone-500' : 'border-stone-300 group-hover:border-stone-400'
                          }`}
                        />
                      ) : (
                        <span
                          className={`w-full rounded-t-lg transition-colors ${active ? 'bg-brand-700' : 'bg-brand-500/40 group-hover:bg-brand-500/70'}`}
                          style={{ height: pct(p.revenue) }}
                        />
                      )}
                      {/* The selected day always shows its amount; the others on hover / focus */}
                      {amount !== null && !p.future && (active || pointed === p.date) && (
                        <span
                          className={`absolute z-10 mb-1 text-xs whitespace-nowrap tabular-nums ${
                            active ? 'left-1/2 -translate-x-1/2 font-bold text-brand-800 max-sm:text-[0.6875rem]' : `rounded-lg bg-stone-900 px-2.5 py-1.5 text-left text-white shadow-lg ${
                              i === 0 ? 'left-0' : i === points.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                            }`
                          }`}
                          style={{ bottom: p.revenue === 0 ? '12%' : pct(p.revenue!) }}
                        >
                          {active ? (
                            amount
                          ) : (
                            <>
                              <span className="block font-semibold">{amount}</span>
                              <span className="block text-stone-300">{p.revenue === 0 ? 'Không có đơn giao xong' : `${p.orders} đơn`}</span>
                            </>
                          )}
                        </span>
                      )}
                    </span>
                    {/* Weekday over the date on phones, side by side from 640px; a dot under the selected day */}
                    <span
                      aria-hidden
                      className={`relative mt-1 flex flex-col items-center text-xs leading-tight whitespace-nowrap tabular-nums sm:flex-row sm:gap-1 ${
                        active ? 'font-bold text-stone-900' : p.future ? 'text-stone-400' : 'text-stone-600'
                      }`}
                    >
                      <span>{shortWeekday(p.date)}</span>
                      <span>{dayMonth(p.date)}</span>
                    </span>
                    <span aria-hidden className="relative flex h-4 items-center text-[0.6875rem] leading-none text-stone-400">
                      {p.future ? 'chưa tới' : active ? <span className="size-1.5 rounded-full bg-brand-700" /> : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}

const NO_ORDERS = 'Không có đơn nào trong ngày này'

/** Shared frame of "Bán chạy trong ngày" and "Đơn của ngày": header with the day and a link, same rows, same empty state. */
function DayListCard({
  id,
  title,
  date,
  link,
  empty,
  children,
}: {
  id: string
  title: string
  date: string
  link?: { to: string; label: string }
  empty: boolean
  children: ReactNode
}) {
  return (
    <section className={`${card} flex h-full min-w-0 flex-col`} aria-labelledby={id}>
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div className="min-w-0">
          <h2 id={id} className="font-semibold text-stone-900">
            {title}
          </h2>
          <p className="text-xs text-muted tabular-nums">{shortDay(date)}</p>
        </div>
        {link && !empty && (
          <Link to={link.to} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
            {link.label} →
          </Link>
        )}
      </div>
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-center text-sm text-muted">
          <Inbox aria-hidden className="size-8 text-stone-300" strokeWidth={1.5} />
          {NO_ORDERS}
        </div>
      ) : (
        <div className="min-w-0 flex-1">{children}</div>
      )}
    </section>
  )
}

const ordersLink = (date: string) => `/admin/don-hang?from=${date}&to=${date}`

function TopProducts({ day }: { day: DashboardDay }) {
  return (
    <DayListCard id="top-title" title="Bán chạy trong ngày" date={day.date} link={{ to: ordersLink(day.date), label: 'Xem đơn' }} empty={day.topProducts.length === 0}>
      <ol>
        {day.topProducts.slice(0, LIST_ROWS).map((p, i) => (
          <li key={p.productId} className="flex h-12 items-center gap-3 border-b border-stone-100 px-5 text-sm last:border-0">
            <span className="w-4 shrink-0 text-muted tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-stone-900" title={p.name}>
              {p.name}
            </span>
            <span className="shrink-0 text-stone-600 tabular-nums">×{p.quantity}</span>
            <span className="w-24 shrink-0 text-right font-semibold text-stone-900 tabular-nums">{formatPrice(p.amount)}</span>
          </li>
        ))}
      </ol>
    </DayListCard>
  )
}

function DayOrders({ day }: { day: DashboardDay }) {
  const rows = day.orders.slice(0, LIST_ROWS)
  return (
    <DayListCard
      id="day-orders-title"
      title="Đơn của ngày"
      date={day.date}
      link={{ to: ordersLink(day.date), label: day.ordersCreated > LIST_ROWS ? `Xem tất cả (${day.ordersCreated})` : 'Xem tất cả' }}
      empty={rows.length === 0}
    >
      {/* Below 768px: one card per order (like the order list), the whole card opens it */}
      <ul className="space-y-3 p-4 md:hidden">
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
              <p className="mt-2 truncate text-sm font-medium text-stone-900" title={o.customerName}>
                {o.customerName}
              </p>
              <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold tabular-nums">{formatPrice(o.total)}</span>
                <time dateTime={o.createdAt} className="text-muted tabular-nums">
                  {timeFormat.format(new Date(o.createdAt))}
                </time>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {/* 7/12 of a 1024px screen is narrow: the table scrolls sideways inside the card rather than widening the page */}
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className={table.thStatic}>Mã đơn</th>
            <th className={table.thStatic}>Giờ</th>
            <th className={table.thStatic}>Khách</th>
            <th className={`${table.thStatic} text-right`}>Tổng tiền</th>
            <th className={table.thStatic}>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.code} className="h-12">
              <td className="border-b border-stone-100 px-4">
                <Link to={`/admin/don-hang/${o.code}`} className="font-semibold text-brand-700 hover:underline">
                  {o.code}
                </Link>
              </td>
              <td className="border-b border-stone-100 px-4 tabular-nums">{timeFormat.format(new Date(o.createdAt))}</td>
              <td className="max-w-32 truncate border-b border-stone-100 px-4 xl:max-w-48" title={o.customerName}>
                {o.customerName}
              </td>
              <td className="border-b border-stone-100 px-4 text-right whitespace-nowrap tabular-nums">{formatPrice(o.total)}</td>
              <td className="border-b border-stone-100 px-4">
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </DayListCard>
  )
}

/**
 * Back-office home. "Cần xử lý ngay" (pending orders, low stock) does not depend on the day; below it everything
 * follows one Vietnam day, kept in the URL (?ngay=yyyy-MM-dd, none for today): the revenue chart with the day picker,
 * the day's totals, best sellers and orders.
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
  // The selected day: its totals and lists, and the 7 days up to it (the left half of the chart)
  const day = useAsync(
    async (signal) => {
      const value = await adminApi.dashboardDay(date, signal)
      remember(value)
      return value
    },
    [date],
  )
  // The right half of the chart (the days after the selected one, up to today), unless already known
  const shownDays = chartWindow(date, today)
  const chart = useAsync(
    async (signal) => {
      const source = chartSource(date, today)
      if (source === date || shownDays.every((d) => d.future || d.date > source || revenueCache.has(d.date))) return source
      remember(await adminApi.dashboardDay(source, signal))
      return source
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date],
  )
  // While a new day loads: that day from the cache, else the previous day's numbers (dimmed)
  const shown = dayCache.get(date) ?? day.data
  // Re-read on every render: day.data / chart.data changing re-renders once the cache has the new days
  void chart.data
  const points: ChartPoint[] = shownDays.map((d) => ({ ...d, ...(d.future ? {} : revenueCache.get(d.date)) }))

  const select = (iso: string) => {
    if (iso < min || iso > today) return
    const next = new URLSearchParams(params)
    if (iso === today) next.delete('ngay')
    else next.set('ngay', iso)
    setParams(next, { preventScrollReset: true })
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
          <Skeleton variant="now-cards" />
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

      <div className="mt-8 space-y-6">
        <DayChart points={points} date={date} today={today} min={min} onSelect={select} />
        {day.error && !shown ? (
          <ErrorMessage message={day.error.message} onRetry={day.reload} />
        ) : !shown ? (
          <Skeleton variant="day" slowNote={Boolean(now.data || now.error)} />
        ) : (
          <div aria-busy={day.loading} className={`space-y-6 transition-opacity ${day.loading && !dayCache.has(date) ? 'opacity-60' : ''}`}>
            <DayStats day={shown} versus={versus} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="min-w-0 lg:col-span-5">
                <TopProducts day={shown} />
              </div>
              <div className="min-w-0 lg:col-span-7">
                <DayOrders day={shown} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
