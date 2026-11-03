import { Check, Inbox } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { ErrorMessage } from '../components/Feedback'
import { StatusBadge } from '../components/OrderDetails'
import { adminApi, type DashboardDay, type DashboardNow } from '../lib/adminApi'
import { formatPrice } from '../lib/format'
import { ORDER_STATUS_DOT, ORDER_STATUS_LABEL } from '../lib/orderStatus'
import { useAsync } from '../lib/useAsync'
import { Skeleton } from './Skeleton'
import { axisTicks, chartSource, chartWindow } from './chartAxis'
import { compareDays, statusCounts } from './dayMetrics'
import { OVERDUE_PARAM } from './labels'
import { useOnNewOrder } from './newOrders'
import { DayPicker } from './DayPicker'
import { addDays, dayMonth, fromIso, shortDay, shortWeekday, vnTodayIso, WEEKDAY_NAMES } from './dates'
import { card } from './styles'
import { InfoTip } from './ui'

/** The day view goes back this far (the API refuses older days) */
const MAX_DAYS_BACK = 365
/** Rows in "Bán chạy" and "Đơn của ngày" */
const LIST_ROWS = 5
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
/** ?chiso=don: the chart draws new orders instead of delivered revenue */
const METRIC_PARAM = 'chiso'

type Metric = 'revenue' | 'orders'

/** Days already loaded in this session: switching back shows them at once while they refresh. */
const dayCache = new Map<string, DashboardDay>()
/**
 * Delivered revenue and orders per day from every answer loaded (each brings the 7 days ending on its day), so moving
 * along the chart rarely needs a request for the chart alone.
 */
const revenueCache = new Map<string, { revenue: number; delivered: number }>()
/** New orders per day: only an answer for that very day has it (ordersCreated) */
const createdCache = new Map<string, number>()

function remember(day: DashboardDay) {
  dayCache.set(day.date, day)
  createdCache.set(day.date, day.ordersCreated)
  for (const d of day.last7Days) revenueCache.set(d.date, { revenue: d.revenue, delivered: d.orders })
}

/** Requests for a day in flight, so the chart and the "Đơn mới" fill never ask for the same day twice at once */
const inFlight = new Map<string, Promise<DashboardDay>>()
function loadDay(date: string): Promise<DashboardDay> {
  let request = inFlight.get(date)
  if (!request) {
    request = adminApi.dashboardDay(date).then((value) => {
      remember(value)
      return value
    })
    request.finally(() => inFlight.delete(date)).catch(() => {})
    inFlight.set(date, request)
  }
  return request
}

const timeFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })
const daysBetween = (from: string, to: string) => Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86_400_000)
/** "Chủ Nhật, 01/11" */
const weekdayDay = (iso: string) => `${WEEKDAY_NAMES[(fromIso(iso).getUTCDay() + 6) % 7]}, ${dayMonth(iso)}`
const ordersOfDay = (date: string, status?: string) => `/admin/don-hang?from=${date}&to=${date}${status ? `&status=${status}` : ''}`

// ---- sticky page header --------------------------------------------------------------------------------------

/** "Tổng quan" and the only day picker of the page, sticking to the top (under the 56px top bar below 1024px). */
function DashboardHeader({ date, today, min, onSelect }: { date: string; today: string; min: string; onSelect: (iso: string) => void }) {
  return (
    <div className="sticky top-14 z-20 -mx-4 -mt-5 mb-6 border-b border-stone-200 bg-stone-50/85 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:top-0 lg:-mx-8 lg:-mt-8 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        {/* Phones already show "Tổng quan" in the top bar: kept for screen readers only */}
        <div className="min-w-0 max-sm:sr-only">
          <h1 className="text-2xl font-bold text-stone-900">Tổng quan</h1>
          <p className="text-sm text-muted max-[900px]:hidden">Mọi số liệu bên dưới theo ngày đang chọn</p>
        </div>
        <div className="ml-auto">
          <DayPicker date={date} today={today} min={min} onChange={onSelect} />
        </div>
      </div>
    </div>
  )
}

// ---- things to do now ------------------------------------------------------------------------------------------

/** One cell of "Việc cần làm": orange with an action while something waits, a green ✓ and grey text otherwise. */
function TodoCell({ title, value, detail, action }: { title: string; value: number; detail: string; action: { label: string; to: string } }) {
  const waiting = value > 0
  return (
    <div className={`flex min-h-17 min-w-[260px] flex-1 items-center gap-3 border-t border-l border-stone-200 px-4 py-3 ${waiting ? 'bg-orange-50/70' : 'bg-white'}`}>
      <span
        aria-hidden={!waiting}
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-base font-bold tabular-nums ${
          waiting ? 'bg-orange-100 text-orange-800' : 'bg-brand-50 text-brand-700'
        }`}
      >
        {waiting ? value : <Check className="size-5" strokeWidth={2.5} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${waiting ? 'text-stone-900' : 'text-stone-600'}`}>
          {title}
          {!waiting && <span className="sr-only">: 0</span>}
        </p>
        <p className="truncate text-xs text-muted" title={waiting ? detail : undefined}>
          {waiting ? detail : 'Không có việc tồn'}
        </p>
      </div>
      {waiting && (
        <Link to={action.to} className="shrink-0 text-sm font-semibold whitespace-nowrap text-orange-700 hover:underline">
          {action.label} →
        </Link>
      )}
    </div>
  )
}

/** "VIỆC CẦN LÀM · HIỆN TẠI": does not depend on the selected day. Three cells side by side, stacked when narrow. */
function TodoStrip({ now }: { now: DashboardNow }) {
  return (
    // The cells draw their top/left borders; the frame hides those on its own edges, whatever the wrapping
    <div className={`${card} overflow-hidden`}>
      <div className="-mt-px -ml-px flex flex-wrap">
        <TodoCell
          title="Đơn chờ xác nhận"
          value={now.pendingCount}
          detail="Gọi khách rồi xác nhận đơn"
          action={{ label: 'Xử lý', to: '/admin/don-hang?status=PENDING' }}
        />
        <TodoCell
          title="Đơn chờ quá 24 giờ"
          value={now.pendingOver24h}
          detail="Cần gọi xác nhận sớm"
          action={{ label: 'Xem đơn', to: `/admin/don-hang?status=PENDING&${OVERDUE_PARAM}=1` }}
        />
        <TodoCell
          title="Sắp hết hàng"
          value={now.lowStockCount}
          detail={now.lowStock.map((p) => p.name).join(', ')}
          action={{ label: 'Nhập hàng', to: '/admin/kho?low=1' }}
        />
      </div>
    </div>
  )
}

// ---- day card: totals + chart --------------------------------------------------------------------------------

/** A day total: label, the amount (never cut), and how it compares with the day before. */
function MetricCell({ label, value, now, before, upIsBad = false, versus, tip }: { label: string; value: string; now: number; before: number; upIsBad?: boolean; versus: string; tip?: string | null }) {
  const change = compareDays(now, before, upIsBad)
  return (
    <div className="min-w-0 bg-white px-5 py-4">
      {/* Fixed height: the ⓘ button (only on days with a cancel reason) must not change the row */}
      <p className="flex h-6 items-center gap-1 text-sm text-stone-600">
        {label}
        {tip && <InfoTip label={`Chi tiết ${label.toLowerCase()}`}>{tip}</InfoTip>}
      </p>
      <p className="mt-1 text-[clamp(1.125rem,5vw,1.5rem)] leading-tight font-bold whitespace-nowrap text-stone-900 tabular-nums">{value}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
        <span
          className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${
            change.good === null ? 'bg-stone-100 text-stone-600' : change.good ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {change.text}
        </span>
        <span className="tabular-nums">so với {versus}</span>
      </p>
    </div>
  )
}

type ChartPoint = { date: string; future: boolean; value?: number }

/**
 * 7 columns, the selected day always in the middle (3 days before, 3 after; days not come yet are dashed and cannot
 * be picked). Each column is a button picking its day; ←/→ while the chart has focus move a day. On a change the
 * columns slide (250ms) to bring the new day to the middle; focus stays on the middle column.
 */
function DayChart({ points, metric, date, min, onSelect }: { points: ChartPoint[]; metric: Metric; date: string; min: string; onSelect: (iso: string) => void }) {
  const known = points.filter((p) => !p.future && p.value !== undefined)
  const ticks = axisTicks(metric === 'revenue' ? Math.max(0, ...known.map((p) => p.value!)) : 0)
  // New orders: a plain count scale with a little headroom
  const top = metric === 'revenue' ? ticks[ticks.length - 1] : Math.max(4, Math.ceil(Math.max(0, ...known.map((p) => p.value!)) * 1.15))
  const pct = (v: number) => `${(v / top) * 100}%`
  const show = (v: number) => (metric === 'revenue' ? formatPrice(v) : `${v} đơn`)
  // Hover details are for a mouse; tied to the selected day they were set under, so a change of day drops them
  const [hover, setHover] = useState<{ day: string; under: string } | null>(null)
  const pointed = hover?.under === date ? hover.day : null
  const setPointed = (day: string | null) => setHover(day ? { day, under: date } : null)

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

  return (
    // No axis: faint grid lines only; the amounts are on the columns (selected) and on hover / focus
    <div className="relative overflow-hidden px-3 pt-3 pb-2 sm:px-5" onKeyDown={onKeyDown}>
      <div aria-hidden className="pointer-events-none absolute inset-x-3 top-11 h-40 sm:inset-x-5">
        {(metric === 'revenue' ? ticks : [0, 0.25, 0.5, 0.75, 1].map((f) => f * top)).map((t) => (
          <span key={t} className={`absolute inset-x-0 border-t ${t === 0 ? 'border-stone-300' : 'border-dashed border-stone-200/80'}`} style={{ bottom: pct(t) }} />
        ))}
      </div>
      <ol
        ref={track}
        className="relative flex gap-1 sm:gap-2"
        aria-label={`${metric === 'revenue' ? 'Doanh thu' : 'Đơn mới'} 7 ngày quanh ${shortDay(date)}`}
        onPointerLeave={() => setPointed(null)}
      >
        {points.map((p, i) => {
          const active = p.date === date
          const blocked = p.future || p.date < min
          const label = `${shortWeekday(p.date)} ${dayMonth(p.date)}`
          const amount = p.value !== undefined ? show(p.value) : null
          // Keyed by position: the DOM stays put and the whole row slides
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
                aria-label={
                  p.future
                    ? `${label}, chưa tới`
                    : `Chọn ${label}, ${metric === 'revenue' ? `doanh thu ${amount ?? 'đang tải'}` : amount ? `${p.value} đơn mới` : 'đang tải'}`
                }
                className="group relative flex w-full flex-col items-center rounded-xl pb-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-default"
              >
                {/* Pale band behind the selected day, the full height of the chart */}
                {active && <span aria-hidden className="absolute inset-0 rounded-xl bg-brand-50" />}
                <span aria-hidden className="relative mt-8 flex h-40 w-full max-w-12 items-end px-1 sm:px-0">
                  {p.future ? (
                    <span className="h-full w-full rounded-t-lg border border-b-0 border-dashed border-stone-300" />
                  ) : p.value === undefined ? (
                    <span className="h-1/3 w-full animate-pulse rounded-t-lg bg-stone-200" />
                  ) : p.value === 0 ? (
                    // Short, hatched and faint: "nothing" at a glance, never mistaken for a value
                    <span
                      className={`h-[12%] w-full rounded-t-lg border border-b-0 border-dashed bg-[repeating-linear-gradient(135deg,var(--color-stone-200)_0_3px,transparent_3px_7px)] ${
                        active ? 'border-stone-500' : 'border-stone-300 group-hover:border-stone-400'
                      }`}
                    />
                  ) : (
                    <span
                      className={`w-full rounded-t-lg transition-colors ${active ? 'bg-brand-700' : 'bg-brand-500/40 group-hover:bg-brand-500/70'}`}
                      style={{ height: pct(p.value) }}
                    />
                  )}
                  {/* The selected day always shows its value; the others on hover / focus */}
                  {amount !== null && !p.future && (active || pointed === p.date) && (
                    <span
                      className={`absolute z-10 mb-1 text-xs whitespace-nowrap tabular-nums ${
                        active
                          ? 'left-1/2 -translate-x-1/2 font-bold text-brand-800 max-sm:text-[0.6875rem]'
                          : `rounded-lg bg-stone-900 px-2.5 py-1.5 font-semibold text-white shadow-lg ${
                              i === 0 ? 'left-0' : i === points.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                            }`
                      }`}
                      style={{ bottom: p.value === 0 ? '12%' : pct(p.value!) }}
                    >
                      {amount}
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
  )
}

/** Header with the day and the metric switch, the 4 totals, the 7-day chart and its summary. */
function DayCard({
  day,
  date,
  today,
  min,
  metric,
  onMetric,
  points,
  onSelect,
}: {
  day: DashboardDay
  date: string
  today: string
  min: string
  metric: Metric
  onMetric: (m: Metric) => void
  points: { date: string; future: boolean; revenue?: number; delivered?: number; created?: number }[]
  onSelect: (iso: string) => void
}) {
  const p = day.previous
  const versus = `${shortWeekday(addDays(date, -1))} ${dayMonth(addDays(date, -1))}`
  const shown = points.filter((pt) => !pt.future)
  const revenue = shown.reduce((sum, pt) => sum + (pt.revenue ?? 0), 0)
  const delivered = shown.reduce((sum, pt) => sum + (pt.delivered ?? 0), 0)
  const created = shown.reduce((sum, pt) => sum + (pt.created ?? 0), 0)
  const loading = shown.some((pt) => pt.revenue === undefined || (metric === 'orders' && pt.created === undefined && pt.date >= min))
  const segment = (m: Metric, label: string) => (
    <button
      type="button"
      aria-pressed={metric === m}
      onClick={() => onMetric(m)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700 ${
        metric === m ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
      }`}
    >
      {label}
    </button>
  )
  return (
    <section className={`${card} @container overflow-hidden`} aria-labelledby="day-title">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h2 id="day-title" className="font-semibold text-stone-900">
          {date === today && <span className="text-brand-700">Hôm nay · </span>}
          {weekdayDay(date)}
        </h2>
        <div role="group" aria-label="Chỉ số trên biểu đồ" className="flex rounded-xl bg-stone-100 p-1">
          {segment('revenue', 'Doanh thu đã giao')}
          {segment('orders', 'Đơn mới')}
        </div>
      </div>
      {/*
        The 1px gaps over a grey background draw the lines between the totals. 4 across only when the card itself is
        768px wide (the sidebar takes 240px of a 1024px screen): an amount is never cut
      */}
      <div className="grid grid-cols-2 gap-px border-y border-stone-200 bg-stone-200 @min-[48rem]:grid-cols-4">
        <MetricCell label="Doanh thu (đã giao)" value={formatPrice(day.revenue)} now={day.revenue} before={p.revenue} versus={versus} />
        <MetricCell label="Đơn mới" value={String(day.ordersCreated)} now={day.ordersCreated} before={p.ordersCreated} versus={versus} />
        <MetricCell label="Giá trị đơn đặt" value={formatPrice(day.grossValue)} now={day.grossValue} before={p.grossValue} versus={versus} />
        <MetricCell
          label="Đơn huỷ"
          value={String(day.cancelled)}
          now={day.cancelled}
          before={p.cancelled}
          upIsBad
          versus={versus}
          tip={day.topCancelReason && `Lý do nhiều nhất: ${day.topCancelReason}`}
        />
      </div>
      <DayChart
        points={points.map((pt) => ({ date: pt.date, future: pt.future, value: metric === 'revenue' ? pt.revenue : pt.created }))}
        metric={metric}
        date={date}
        min={min}
        onSelect={onSelect}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-stone-100 px-5 py-3 text-sm">
        <p className="text-stone-700 tabular-nums">
          {dayMonth(points[0].date)} – {dayMonth(points[points.length - 1].date)}:{' '}
          {loading ? (
            <span className="text-muted">đang tải…</span>
          ) : (
            <>
              <strong className="text-stone-900">{formatPrice(revenue)}</strong> doanh thu ·{' '}
              {/* Delivered orders come with the revenue; new orders per day need the "Đơn mới" view (one request per day) */}
              {metric === 'orders' ? `${created} đơn mới` : `${delivered} đơn đã giao`}
            </>
          )}
        </p>
        <p className="text-xs text-muted max-sm:hidden">Bấm vào cột hoặc dùng ‹ › để đổi ngày</p>
      </div>
    </section>
  )
}

// ---- lists of the day ------------------------------------------------------------------------------------------

const NO_ORDERS = 'Không có đơn nào trong ngày này'

/** Header row and rows shared by both lists: 36px header, 40px rows, 20px at the outer edges like the card header */
const listTh = 'h-9 border-b border-stone-200 bg-stone-50 px-3 text-xs font-semibold whitespace-nowrap text-stone-600 first:pl-5 last:pr-5'
const listTd = 'h-10 border-b border-stone-100 px-3 first:pl-5 last:pr-5'

/**
 * Shared frame of "Bán chạy trong ngày" and "Đơn của ngày": "Title · CN, 01/11" and a link in the header, an optional
 * bar under it, then the rows (as many as there are, up to 5), or a 160px empty state without column headers.
 */
function DayListCard({
  id,
  title,
  date,
  link,
  empty,
  bar,
  children,
}: {
  id: string
  title: string
  date: string
  link?: { to: string; label: string }
  empty: boolean
  bar?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`${card} min-w-0`} aria-labelledby={id}>
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
        {/* Title and day on one line; the day wraps under it on a narrow phone */}
        <h2 id={id} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 font-semibold text-stone-900">
          {title}
          <span className="text-xs font-normal text-muted tabular-nums">
            <span aria-hidden>· </span>
            {shortDay(date)}
          </span>
        </h2>
        {link && !empty && (
          <Link to={link.to} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
            {link.label} →
          </Link>
        )}
      </div>
      {empty ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 px-5 text-center text-sm text-muted">
          <Inbox aria-hidden className="size-8 text-stone-300" strokeWidth={1.5} />
          {NO_ORDERS}
        </div>
      ) : (
        <>
          {bar}
          {children}
        </>
      )}
    </section>
  )
}

function TopProducts({ day }: { day: DashboardDay }) {
  const items = day.topProducts.slice(0, LIST_ROWS)
  const best = Math.max(1, ...items.map((p) => p.amount))
  return (
    <DayListCard id="top-title" title="Bán chạy trong ngày" date={day.date} link={{ to: ordersOfDay(day.date), label: 'Xem đơn' }} empty={items.length === 0}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className={listTh}>#</th>
            <th className={`${listTh} w-full`}>Sản phẩm</th>
            <th className={`${listTh} text-right`}>SL</th>
            <th className={`${listTh} text-right`}>Doanh thu</th>
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-0">
          {items.map((p, i) => (
            <tr key={p.productId}>
              <td className={`${listTd} h-12 text-muted tabular-nums`}>{i + 1}</td>
              {/* Takes the room left (w-full + max-w-0) and cuts a long name; the bar is its share of the best seller */}
              <td className={`${listTd} h-12 w-full max-w-0`}>
                <span className="block truncate text-stone-900" title={p.name}>
                  {p.name}
                </span>
                <span aria-hidden className="mt-1 block h-1 rounded-full bg-brand-200" style={{ width: `${(p.amount / best) * 100}%` }} />
              </td>
              <td className={`${listTd} h-12 text-right text-stone-600 tabular-nums`}>{p.quantity}</td>
              <td className={`${listTd} h-12 text-right font-semibold whitespace-nowrap text-stone-900 tabular-nums`}>{formatPrice(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DayListCard>
  )
}

/** "Chờ xác nhận 3 · Hoàn tất 2 …" from the orders of the day the API sends (the 20 newest), each a filtered link. */
function StatusBar({ day }: { day: DashboardDay }) {
  const counts = statusCounts(day.orders)
  const partial = day.ordersCreated > day.orders.length
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-100 px-5 py-2.5 text-xs">
      {counts.map(({ status, count }) => (
        <Link
          key={status}
          to={ordersOfDay(day.date, status)}
          className="inline-flex items-center gap-1.5 rounded-md py-0.5 text-stone-700 hover:text-stone-900 hover:underline"
        >
          <span aria-hidden className={`size-2 rounded-full ${ORDER_STATUS_DOT[status]}`} />
          {ORDER_STATUS_LABEL[status]} <strong className="tabular-nums">{count}</strong>
        </Link>
      ))}
      {/* Counted from the orders received: say so when the day has more */}
      {partial && <span className="text-muted">trong {day.orders.length} đơn mới nhất</span>}
    </div>
  )
}

function DayOrders({ day }: { day: DashboardDay }) {
  const navigate = useNavigate()
  const rows = day.orders.slice(0, LIST_ROWS)
  return (
    <DayListCard
      id="day-orders-title"
      title="Đơn của ngày"
      date={day.date}
      link={{ to: ordersOfDay(day.date), label: day.ordersCreated > LIST_ROWS ? `Xem tất cả (${day.ordersCreated})` : 'Xem tất cả' }}
      empty={rows.length === 0}
      bar={<StatusBar day={day} />}
    >
      {/* Below 768px: one card per order (like the order list), the whole card opens it */}
      <ul className="space-y-2 p-3 md:hidden">
        {rows.map((o) => (
          <li key={o.code}>
            <Link
              to={`/admin/don-hang/${o.code}`}
              className="block rounded-xl border border-stone-200 bg-white p-3 hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-brand-700">{o.code}</span>
                <StatusBadge status={o.status} />
              </div>
              <p className="mt-1.5 truncate text-sm font-medium text-stone-900" title={o.customerName}>
                {o.customerName}
              </p>
              <div className="mt-0.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold tabular-nums">{formatPrice(o.total)}</span>
                <time dateTime={o.createdAt} className="text-muted tabular-nums">
                  {timeFormat.format(new Date(o.createdAt))}
                </time>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {/* Full width below 1280px, 7/12 from there: the frame only scrolls sideways if the table ever overflows */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className={listTh}>Mã đơn</th>
              <th className={listTh}>Giờ</th>
              {/* Takes what the other columns leave (w-full + max-w-0) and cuts the name, so the table always fits */}
              <th className={`${listTh} w-full`}>Khách</th>
              <th className={`${listTh} text-right`}>Tổng tiền</th>
              <th className={listTh}>Trạng thái</th>
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-0">
            {rows.map((o) => (
              // The whole row opens the order; the code stays a real link for the keyboard and middle-click
              <tr
                key={o.code}
                className="cursor-pointer transition-colors hover:bg-brand-50/60 focus-within:bg-brand-50/60"
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('a')) navigate(`/admin/don-hang/${o.code}`)
                }}
              >
                <td className={listTd}>
                  <Link to={`/admin/don-hang/${o.code}`} className="font-semibold whitespace-nowrap text-brand-700 hover:underline">
                    {o.code}
                  </Link>
                </td>
                <td className={`${listTd} tabular-nums`}>{timeFormat.format(new Date(o.createdAt))}</td>
                <td className={`${listTd} w-full max-w-0 truncate`} title={o.customerName}>
                  {o.customerName}
                </td>
                <td className={`${listTd} text-right whitespace-nowrap tabular-nums`}>{formatPrice(o.total)}</td>
                <td className={listTd}>
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

// ---- page ------------------------------------------------------------------------------------------------------

/**
 * Back-office home: a sticky header with the only day picker, what needs doing now (whatever the day), then one Vietnam
 * day kept in the URL (?ngay=yyyy-MM-dd, none for today): its totals and 7-day chart (?chiso=don draws new orders),
 * best sellers and orders.
 */
export default function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const today = vnTodayIso()
  const min = addDays(today, -MAX_DAYS_BACK)
  const raw = params.get('ngay')
  const valid =
    raw === null || (ISO_DAY.test(raw) && !Number.isNaN(fromIso(raw).getTime()) && addDays(raw, 0) === raw && raw >= min && raw < today)
  const date = valid && raw ? raw : today
  const metric: Metric = params.get(METRIC_PARAM) === 'don' ? 'orders' : 'revenue'

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
  const shownDays = chartWindow(date, today)
  // The right half (the days after the selected one, up to today), unless already known
  const chart = useAsync(
    async () => {
      const source = chartSource(date, today)
      if (source === date || shownDays.every((d) => d.future || d.date > source || revenueCache.has(d.date))) return source
      await loadDay(source)
      return source
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date],
  )
  // "Đơn mới": new orders exist only in the answer for each day, so fetch the missing days of the window (cached)
  const created = useAsync(
    async () => {
      if (metric !== 'orders') return 0
      const missing = shownDays.filter((d) => !d.future && d.date >= min && d.date !== date && !createdCache.has(d.date))
      await Promise.all(missing.map((d) => loadDay(d.date)))
      return missing.length
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, metric],
  )
  // A new order (the layout polls every 20 s): the to-do counts change; today's numbers too
  useOnNewOrder(() => {
    now.reload()
    if (date === today) day.reload()
  })
  // While a new day loads: that day from the cache, else the previous day's numbers (dimmed)
  const shown = dayCache.get(date) ?? day.data
  // Re-read on every render: these answers changing re-render once the caches have the new days
  void chart.data
  void created.data
  const points = shownDays.map((d) => ({
    ...d,
    ...(d.future ? {} : { ...revenueCache.get(d.date), created: createdCache.get(d.date) }),
  }))

  // Changing the day must not move the page: a shorter day (fewer rows) would shrink it and the browser would pull the
  // scroll up. The day section keeps the tallest height it had until the page is back at the top.
  const daySection = useRef<HTMLDivElement>(null)
  const [heldHeight, setHeldHeight] = useState<number | undefined>()
  useEffect(() => {
    if (heldHeight === undefined) return
    const release = () => {
      if (window.scrollY <= 0) setHeldHeight(undefined)
    }
    window.addEventListener('scroll', release, { passive: true })
    return () => window.removeEventListener('scroll', release)
  }, [heldHeight])

  const select = (iso: string) => {
    if (iso < min || iso > today) return
    if (window.scrollY > 0) setHeldHeight((h) => Math.max(h ?? 0, daySection.current?.offsetHeight ?? 0))
    const next = new URLSearchParams(params)
    if (iso === today) next.delete('ngay')
    else next.set('ngay', iso)
    setParams(next, { preventScrollReset: true })
  }
  const setMetric = (m: Metric) => {
    const next = new URLSearchParams(params)
    if (m === 'orders') next.set(METRIC_PARAM, 'don')
    else next.delete(METRIC_PARAM)
    setParams(next, { preventScrollReset: true, replace: true })
  }

  if (!valid || raw === today) {
    const next = new URLSearchParams(params)
    next.delete('ngay')
    return <Navigate to={{ search: next.size ? `?${next}` : '' }} replace />
  }

  return (
    <>
      <DashboardHeader date={date} today={today} min={min} onSelect={select} />

      <section aria-labelledby="todo-title">
        <h2 id="todo-title" className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">
          Việc cần làm · hiện tại
        </h2>
        {now.error && !now.data ? (
          <ErrorMessage message={now.error.message} onRetry={now.reload} />
        ) : !now.data ? (
          <Skeleton variant="now-cards" />
        ) : (
          <TodoStrip now={now.data} />
        )}
      </section>

      <div ref={daySection} className="mt-6" style={heldHeight ? { minHeight: heldHeight } : undefined}>
        {day.error && !shown ? (
          <ErrorMessage message={day.error.message} onRetry={day.reload} />
        ) : !shown ? (
          <Skeleton variant="day" slowNote={Boolean(now.data || now.error)} />
        ) : (
          <div aria-busy={day.loading} className={`space-y-6 transition-opacity ${day.loading && !dayCache.has(date) ? 'opacity-60' : ''}`}>
            <DayCard day={shown} date={date} today={today} min={min} metric={metric} onMetric={setMetric} points={points} onSelect={select} />
            {/* From 1280px side by side (5/12, 7/12), each as tall as its own rows; stacked below */}
            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-5">
                <TopProducts day={shown} />
              </div>
              <div className="min-w-0 xl:col-span-7">
                <DayOrders day={shown} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
