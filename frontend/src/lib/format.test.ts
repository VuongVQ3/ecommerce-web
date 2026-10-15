import { describe, expect, it } from 'vitest'
import { formatPromotionEnd } from './format'

describe('formatPromotionEnd', () => {
  it('shows the last day of a promotion ending at midnight Vietnam time', () => {
    // 17/10 00:00 in Vietnam: the promotion runs "đến hết 16/10"
    expect(formatPromotionEnd('2026-10-16T17:00:00Z')).toBe('Đến hết 16/10/2026')
    expect(formatPromotionEnd('2026-10-16T17:00:00Z', { year: false })).toBe('Đến hết 16/10')
    expect(formatPromotionEnd('2026-10-16T17:00:00Z', { prefix: false })).toBe('16/10/2026')
    // New year: 1/1 00:00 ends on 31/12 of the previous year
    expect(formatPromotionEnd('2026-12-31T17:00:00Z')).toBe('Đến hết 31/12/2026')
  })

  it('shows the moment when it ended in the middle of a day (ended early)', () => {
    expect(formatPromotionEnd('2026-10-16T08:30:00Z')).toBe('16/10/2026 15:30')
  })
})
