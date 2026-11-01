import { addDays } from './dates'

/* Money axis and day window of the dashboard's revenue chart. */

const decimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })

/** Axis labels: 500.000 -> "500k", 1.500.000 -> "1,5tr" */
export const shortMoney = (value: number) =>
  value === 0 ? '0' : value >= 1_000_000 ? `${decimal.format(value / 1_000_000)}tr` : `${decimal.format(value / 1000)}k`

/** 0 and four even steps of 1, 2, 2.5 or 5 x 10^n reaching at least `max` (at least 1tr, so a quiet week is not all axis). */
export function axisTicks(max: number): number[] {
  const raw = Math.max(max, 1_000_000) / 4
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((v) => v >= raw)!
  return [0, 1, 2, 3, 4].map((i) => i * step)
}

/** Days on each side of the selected day in the revenue chart (7 columns, the selected one in the middle) */
export const CHART_SIDE = 3

/** The 7 days shown around `date`; days after `today` have not come yet. */
export function chartWindow(date: string, today: string): { date: string; future: boolean }[] {
  return Array.from({ length: CHART_SIDE * 2 + 1 }, (_, i) => {
    const day = addDays(date, i - CHART_SIDE)
    return { date: day, future: day > today }
  })
}

/**
 * The day to ask the API for so its "7 days ending here" covers the right half of the window: the last day shown,
 * or today when the window reaches into the future (the API refuses future days).
 */
export function chartSource(date: string, today: string): string {
  const last = addDays(date, CHART_SIDE)
  return last < today ? last : today
}
