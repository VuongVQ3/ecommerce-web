import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Calendar } from './DateField'
import { addDays, longDay, shortDay, WEEKDAY_NAMES, WEEKDAYS } from './dates'

const roundBtn =
  'flex size-10 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white'

/**
 * Labels the picker could show at their widest, for sizing it: every weekday with every digit. The shop font has no
 * tabular figures (tabular-nums changes nothing), so "25/10" is wider than "01/11".
 */
const DIGITS = [...'0123456789']
const SIZER_LONG = WEEKDAY_NAMES.flatMap((name) => DIGITS.map((d) => `${name}, ${d}${d}/${d}${d}/${d}${d}${d}${d}`))
const SIZER_SHORT = WEEKDAYS.flatMap((day) => DIGITS.map((d) => `${day}, ${d}${d}/${d}${d}`))

/** Text of `current` in a box as wide as the widest of `sizes` (invisible copies stacked in the same grid cell) */
function FixedLabel({ current, sizes, className = '' }: { current: string; sizes: string[]; className?: string }) {
  return (
    <span className={`grid text-center ${className}`}>
      {sizes.map((s) => (
        <span key={s} aria-hidden className="invisible [grid-area:1/1]">
          {s}
        </span>
      ))}
      <span className="[grid-area:1/1]">{current}</span>
    </span>
  )
}

/**
 * ‹ [Thứ Bảy, 01/11/2026] › [Hôm nay] [calendar]. Nothing moves when the day changes: the label keeps the width of
 * the longest one and "Hôm nay" stays in place, disabled on today. ←/→ inside it move a day. Each button carries
 * data-part (prev / next / today / calendar) so focus can move to the same button of another copy.
 */
export function DayPicker({ date, today, min, onChange }: { date: string; today: string; min: string; onChange: (iso: string) => void }) {
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

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    if ((e.target as HTMLElement).closest('[role="dialog"]')) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const next = addDays(date, e.key === 'ArrowLeft' ? -1 : 1)
      if (next >= min && next <= today) onChange(next)
    }
  }

  return (
    <div ref={wrapper} onKeyDown={onKeyDown} className="relative flex shrink-0 items-center gap-2">
      <button type="button" data-part="prev" onClick={() => onChange(addDays(date, -1))} disabled={date <= min} aria-label="Ngày trước" className={roundBtn}>
        <ChevronLeft aria-hidden className="size-4" strokeWidth={2.25} />
      </button>
      <p aria-live="polite" className="text-sm font-semibold whitespace-nowrap text-stone-900 tabular-nums">
        <FixedLabel current={shortDay(date)} sizes={SIZER_SHORT} className="sm:hidden" />
        <FixedLabel current={longDay(date)} sizes={SIZER_LONG} className="max-sm:hidden" />
      </p>
      <button type="button" data-part="next" onClick={() => onChange(addDays(date, 1))} disabled={date >= today} aria-label="Ngày sau" className={roundBtn}>
        <ChevronRight aria-hidden className="size-4" strokeWidth={2.25} />
      </button>
      <button
        type="button"
        data-part="today"
        onClick={() => onChange(today)}
        disabled={date === today}
        aria-disabled={date === today || undefined}
        className="shrink-0 rounded-full border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:text-stone-400 disabled:opacity-60 disabled:hover:bg-white"
      >
        Hôm nay
      </button>
      <button
        ref={calendarButton}
        type="button"
        data-part="calendar"
        onClick={() => setCalendarOpen((o) => !o)}
        aria-label="Chọn ngày từ lịch"
        aria-expanded={calendarOpen}
        aria-haspopup="dialog"
        className={roundBtn}
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
