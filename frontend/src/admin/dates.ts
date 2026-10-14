/**
 * Calendar dates for the back office. Values are ISO "yyyy-MM-dd" days in Vietnam time (what the API expects);
 * people see and type "dd/MM/yyyy". Arithmetic uses UTC midnight so the browser's own time zone never shifts a day.
 */

const vnDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

/** Today in Vietnam, "yyyy-MM-dd". */
export const vnTodayIso = (now: Date = new Date()) => vnDayFormatter.format(now)

/** "2026-10-14" → "14/10/2026" ('' stays ''). */
export function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** "14/10/2026" (also "4/1/2026", "14-10-2026", "14.10.2026") → "2026-10-14", or null when not a real date. */
export function displayToIso(text: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(text)
  if (!m) return null
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return toIso(date)
}

export const toIso = (d: Date) => d.toISOString().slice(0, 10)

export const fromIso = (iso: string) => new Date(`${iso}T00:00:00Z`)

export const addDays = (iso: string, days: number) => toIso(new Date(fromIso(iso).getTime() + days * 86_400_000))

/** Monday-first grid of 6 weeks covering the month of `iso`. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1))
  const mondayOffset = (first.getUTCDay() + 6) % 7
  const start = new Date(first.getTime() - mondayOffset * 86_400_000)
  return Array.from({ length: 42 }, (_, i) => toIso(new Date(start.getTime() + i * 86_400_000)))
}

export const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
export const WEEKDAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật']

export const monthTitle = (year: number, month: number) => `Tháng ${month + 1} năm ${year}`

/** Quick ranges for filters, in Vietnam time. */
export function quickRange(kind: 'today' | 'last7' | 'thisMonth', now: Date = new Date()): { from: string; to: string } {
  const today = vnTodayIso(now)
  switch (kind) {
    case 'today':
      return { from: today, to: today }
    case 'last7':
      return { from: addDays(today, -6), to: today }
    case 'thisMonth':
      return { from: `${today.slice(0, 8)}01`, to: today }
  }
}
