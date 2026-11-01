import { describe, expect, it } from 'vitest'
import { axisTicks, chartSource, chartWindow, shortMoney } from './chartAxis'

describe('revenue chart axis', () => {
  it('shortens amounts to k and tr', () => {
    expect(shortMoney(0)).toBe('0')
    expect(shortMoney(500_000)).toBe('500k')
    expect(shortMoney(1_000_000)).toBe('1tr')
    expect(shortMoney(1_500_000)).toBe('1,5tr')
  })

  it('picks four round steps covering the highest day', () => {
    expect(axisTicks(2_310_000)).toEqual([0, 1_000_000, 2_000_000, 3_000_000, 4_000_000])
    expect(axisTicks(4_100_000)).toEqual([0, 2_000_000, 4_000_000, 6_000_000, 8_000_000])
    expect(axisTicks(9_000_000)).toEqual([0, 2_500_000, 5_000_000, 7_500_000, 10_000_000])
  })

  it('keeps a 1tr scale for a quiet week, even with no revenue at all', () => {
    expect(axisTicks(0)).toEqual([0, 250_000, 500_000, 750_000, 1_000_000])
    expect(axisTicks(120_000)).toEqual([0, 250_000, 500_000, 750_000, 1_000_000])
  })
})

describe('revenue chart window', () => {
  it('puts the selected day in the middle, three days on each side', () => {
    expect(chartWindow('2026-10-29', '2026-11-01').map((d) => `${d.date.slice(5)}${d.future ? '*' : ''}`)).toEqual([
      '10-26',
      '10-27',
      '10-28',
      '10-29',
      '10-30',
      '10-31',
      '11-01',
    ])
  })

  it('marks the days after today as not come yet', () => {
    expect(chartWindow('2026-11-01', '2026-11-01').filter((d) => d.future).map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
  })

  it('asks the API for the last day shown, never after today', () => {
    expect(chartSource('2026-10-20', '2026-11-01')).toBe('2026-10-23')
    expect(chartSource('2026-10-30', '2026-11-01')).toBe('2026-11-01')
    expect(chartSource('2026-11-01', '2026-11-01')).toBe('2026-11-01')
  })
})
