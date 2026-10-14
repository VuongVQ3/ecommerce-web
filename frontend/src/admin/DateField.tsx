import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import {
  addDays,
  displayToIso,
  fromIso,
  isoToDisplay,
  monthGrid,
  monthTitle,
  quickRange,
  vnTodayIso,
  WEEKDAY_NAMES,
  WEEKDAYS,
} from './dates'
import { btn, input } from './styles'

interface DateFieldProps {
  label: string
  /** "yyyy-MM-dd" or '' */
  value: string
  onChange: (iso: string) => void
  min?: string
  max?: string
  error?: string
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean
}

/**
 * Date input showing and accepting "dd/MM/yyyy" (typed or picked from a Monday-first Vietnamese calendar). The value
 * is the ISO day "yyyy-MM-dd" in Vietnam time. Keyboard: arrows move in the calendar, Enter picks, Esc closes.
 */
export function DateField({ label, value, onChange, min, max, error, hideLabel = false }: DateFieldProps) {
  const id = useId()
  const [text, setText] = useState(isoToDisplay(value))
  const [shownFor, setShownFor] = useState(value)
  const [open, setOpen] = useState(false)
  const [typingError, setTypingError] = useState<string | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  // Follow outside changes (quick ranges, reset) without fighting what the user is typing
  if (value !== shownFor) {
    setShownFor(value)
    setText(isoToDisplay(value))
  }

  const commit = (raw: string) => {
    if (raw.trim() === '') {
      setTypingError(null)
      onChange('')
      return
    }
    const iso = displayToIso(raw)
    if (!iso) {
      setTypingError('Ngày không hợp lệ, nhập theo dạng dd/MM/yyyy')
      return
    }
    if ((min && iso < min) || (max && iso > max)) {
      setTypingError(`Chọn ngày ${min ? `từ ${isoToDisplay(min)}` : ''}${min && max ? ' ' : ''}${max ? `đến ${isoToDisplay(max)}` : ''}`)
      return
    }
    setTypingError(null)
    setText(isoToDisplay(iso))
    onChange(iso)
  }

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const shownError = typingError ?? error
  return (
    <div ref={wrapper} className="relative">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1 block text-sm font-medium text-stone-700'}>
        {label}
      </label>
      <div className="flex">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="dd/MM/yyyy"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(text)
            }
          }}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? `${id}-error` : undefined}
          className={`${input} rounded-r-none`}
        />
        <button
          ref={toggle}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Chọn ${label.toLowerCase()} từ lịch`}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex shrink-0 items-center rounded-r-xl border border-l-0 border-stone-300 bg-white px-3 text-stone-700 hover:bg-stone-50"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="4.5" width="14" height="12" rx="2" />
            <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {shownError && (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">
          {shownError}
        </p>
      )}
      {open && (
        <Calendar
          label={label}
          value={value}
          min={min}
          max={max}
          onPick={(iso) => {
            setOpen(false)
            setTypingError(null)
            onChange(iso)
            toggle.current?.focus()
          }}
          onClose={() => {
            setOpen(false)
            toggle.current?.focus()
          }}
        />
      )}
    </div>
  )
}

function Calendar({
  label,
  value,
  min,
  max,
  onPick,
  onClose,
}: {
  label: string
  value: string
  min?: string
  max?: string
  onPick: (iso: string) => void
  onClose: () => void
}) {
  const today = vnTodayIso()
  const [focused, setFocused] = useState(value || today)
  const focusedDate = fromIso(focused)
  const year = focusedDate.getUTCFullYear()
  const month = focusedDate.getUTCMonth()
  const days = monthGrid(year, month)
  const grid = useRef<HTMLDivElement>(null)

  // Keep keyboard focus on the focused day
  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus()
  }, [focused])

  const disabled = (iso: string) => Boolean((min && iso < min) || (max && iso > max))
  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1))
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    setFocused(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(focusedDate.getUTCDate(), lastDay))).toISOString().slice(0, 10))
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in moves) {
      e.preventDefault()
      setFocused(addDays(focused, moves[e.key]))
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      shiftMonth(e.key === 'PageUp' ? -1 : 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`Lịch chọn ${label.toLowerCase()}`}
      onKeyDown={onKeyDown}
      className="absolute left-0 z-40 mt-1 w-[18.5rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-stone-200 bg-white p-3 shadow-xl"
    >
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Tháng trước" className="flex size-9 items-center justify-center rounded-full hover:bg-stone-100">
          ‹
        </button>
        <p className="text-sm font-semibold text-stone-900" aria-live="polite">
          {monthTitle(year, month)}
        </p>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Tháng sau" className="flex size-9 items-center justify-center rounded-full hover:bg-stone-100">
          ›
        </button>
      </div>
      <div ref={grid} role="grid" aria-label={monthTitle(year, month)} className="mt-2">
        <div role="row" className="grid grid-cols-7 text-center text-xs font-semibold text-muted">
          {WEEKDAYS.map((d, i) => (
            <span key={d} role="columnheader" aria-label={WEEKDAY_NAMES[i]} className="py-1">
              {d}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div role="row" key={week} className="grid grid-cols-7">
            {days.slice(week * 7, week * 7 + 7).map((iso) => {
              const inMonth = fromIso(iso).getUTCMonth() === month
              const selected = iso === value
              return (
                <span role="gridcell" key={iso} aria-selected={selected}>
                  <button
                    type="button"
                    data-day={iso}
                    tabIndex={iso === focused ? 0 : -1}
                    disabled={disabled(iso)}
                    onClick={() => onPick(iso)}
                    aria-label={`${isoDayLabel(iso)}${iso === today ? ' (hôm nay)' : ''}`}
                    className={`m-0.5 flex size-9 items-center justify-center rounded-full text-sm tabular-nums disabled:cursor-not-allowed disabled:opacity-30 ${
                      selected
                        ? 'bg-brand-600 font-semibold text-white'
                        : iso === today
                          ? 'font-semibold text-brand-700 ring-1 ring-brand-300'
                          : inMonth
                            ? 'text-stone-800 hover:bg-brand-50'
                            : 'text-stone-400 hover:bg-stone-50'
                    }`}
                  >
                    {fromIso(iso).getUTCDate()}
                  </button>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function isoDayLabel(iso: string) {
  const d = fromIso(iso)
  return `${WEEKDAY_NAMES[(d.getUTCDay() + 6) % 7]}, ${isoToDisplay(iso)}`
}

/** From/to filter with quick ranges (today, last 7 days, this month). */
export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
}) {
  const quick: { kind: 'today' | 'last7' | 'thisMonth'; label: string }[] = [
    { kind: 'today', label: 'Hôm nay' },
    { kind: 'last7', label: '7 ngày qua' },
    { kind: 'thisMonth', label: 'Tháng này' },
  ]
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <DateField label="Từ ngày" value={from} max={to || undefined} onChange={(v) => onChange({ from: v, to })} />
        <DateField label="Đến ngày" value={to} min={from || undefined} onChange={(v) => onChange({ from, to: v })} />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn nhanh khoảng ngày">
        {quick.map((q) => {
          const range = quickRange(q.kind)
          const active = range.from === from && range.to === to
          return (
            <button
              key={q.kind}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(range)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${active ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}
            >
              {q.label}
            </button>
          )
        })}
        {(from || to) && (
          <button type="button" onClick={() => onChange({ from: '', to: '' })} className={`${btn.link} px-1`}>
            Xoá ngày
          </button>
        )}
      </div>
    </div>
  )
}
