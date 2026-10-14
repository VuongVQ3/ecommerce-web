import { describe, expect, it } from 'vitest'
import { ORDER_STATUS_LABEL } from './orderStatus'

// Every source file, as text: the old label must not come back anywhere
const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

describe('order status labels', () => {
  it('uses "Hoàn tất" for completed orders', () => {
    expect(ORDER_STATUS_LABEL.COMPLETED).toBe('Hoàn tất')
  })

  it('never writes the old "Hoàn thành" label', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    const offenders = Object.entries(sources)
      .filter(([, text]) => text.includes('Hoàn thành'))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})
