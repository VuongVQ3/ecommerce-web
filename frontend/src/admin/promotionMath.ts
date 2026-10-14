/** Same rules as the server (PricingService / PromotionService), for previews only: the server decides. */

/** floor(price × (100 − percent) / 100 / 1000) × 1000 */
export const salePriceFor = (price: number, percentOff: number) => Math.floor((price * (100 - percentOff)) / 100 / 1000) * 1000

export const discountPercent = (regular: number, sale: number) => Math.round(((regular - sale) * 100) / regular)

/** "2026-11-01" (a Vietnam calendar day) → the instant it starts, as ISO */
export const vnDayStart = (day: string) => new Date(`${day}T00:00:00+07:00`).toISOString()

/** Inclusive last day "2026-11-30" → exclusive end instant (start of the next day in Vietnam) */
export const vnDayEndExclusive = (day: string) => new Date(Date.parse(`${day}T00:00:00+07:00`) + 86_400_000).toISOString()

/** Today in Vietnam as yyyy-MM-dd */
export const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

/** Calendar day of an instant in Vietnam as yyyy-MM-dd; with exclusive=true, the last day before it. */
export const vnDay = (iso: string, exclusive = false) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.parse(iso) - (exclusive ? 1 : 0)))

/** Days of [first, last] (inclusive yyyy-MM-dd) falling in `year`. */
export function daysInYear(first: string, last: string, year: number): number {
  const from = first < `${year}-01-01` ? `${year}-01-01` : first
  const to = last > `${year}-12-31` ? `${year}-12-31` : last
  if (to < from) return 0
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
}
