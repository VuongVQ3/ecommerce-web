import { describe, expect, it } from 'vitest'
import { compareDays, statusCounts } from './dayMetrics'

describe('day totals compared with the day before', () => {
  it('says how much it went up or down, green when good', () => {
    expect(compareDays(8, 6)).toEqual({ text: '▲ 33%', good: true })
    expect(compareDays(560_000, 1_120_000)).toEqual({ text: '▼ 50%', good: false })
    expect(compareDays(0, 1_720_000)).toEqual({ text: '▼ 100%', good: false })
  })

  it('turns red when more is worse (cancelled orders)', () => {
    expect(compareDays(2, 1, true)).toEqual({ text: '▲ 100%', good: false })
    expect(compareDays(1, 2, true)).toEqual({ text: '▼ 50%', good: true })
  })

  it('shows no change in grey, and "mới" when the day before had nothing', () => {
    expect(compareDays(0, 0)).toEqual({ text: '— 0%', good: null })
    expect(compareDays(5, 5)).toEqual({ text: '— 0%', good: null })
    expect(compareDays(3, 0)).toEqual({ text: '▲ mới', good: true })
    expect(compareDays(1, 0, true)).toEqual({ text: '▲ mới', good: false })
  })
})

describe('orders of the day per status', () => {
  it('counts in lifecycle order and leaves out the empty ones', () => {
    const orders = (['COMPLETED', 'PENDING', 'PENDING', 'CANCELLED', 'PENDING', 'COMPLETED'] as const).map((status) => ({ status }))
    expect(statusCounts(orders)).toEqual([
      { status: 'PENDING', count: 3 },
      { status: 'COMPLETED', count: 2 },
      { status: 'CANCELLED', count: 1 },
    ])
    expect(statusCounts([])).toEqual([])
  })
})
