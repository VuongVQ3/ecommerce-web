import { describe, expect, it } from 'vitest'
import { daysInYear, discountPercent, salePriceFor, vnDayEndExclusive, vnDayStart } from './promotionMath'

describe('promotion math (mirrors the server)', () => {
  it('rounds the sale price down to whole thousands', () => {
    expect(salePriceFor(189_000, 30)).toBe(132_000)
    expect(salePriceFor(249_000, 15)).toBe(211_000)
    expect(discountPercent(189_000, 132_000)).toBe(30)
  })

  it('maps Vietnam calendar days to instants', () => {
    expect(vnDayStart('2026-11-01')).toBe('2026-10-31T17:00:00.000Z')
    expect(vnDayEndExclusive('2026-11-30')).toBe('2026-11-30T17:00:00.000Z')
  })

  it('counts days per calendar year', () => {
    expect(daysInYear('2026-10-01', '2026-10-31', 2026)).toBe(31)
    expect(daysInYear('2026-12-25', '2027-01-05', 2026)).toBe(7)
    expect(daysInYear('2026-12-25', '2027-01-05', 2027)).toBe(5)
  })
})
