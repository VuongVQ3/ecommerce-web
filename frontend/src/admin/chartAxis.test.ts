import { describe, expect, it } from 'vitest'
import { axisTicks, shortMoney } from './chartAxis'

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
