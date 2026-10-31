/** Money axis of the dashboard's revenue chart. */
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
