// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_RECENT_ORDERS,
  RECENT_ORDERS_KEY,
  readRecentOrders,
  removeRecentOrders,
  saveRecentOrder,
  trackingPath,
} from './recentOrders'

const token = (n: number) => `tok_${String(n).padStart(2, '0')}_abcdefghijklmnopqrstuvwxyz0123456789`

afterEach(() => localStorage.clear())

describe('recent orders', () => {
  it('keeps at most 10, newest first', () => {
    for (let i = 0; i < 12; i++) saveRecentOrder(`HL26101300${String(i).padStart(2, '0')}`, token(i))
    const list = readRecentOrders()
    expect(list).toHaveLength(MAX_RECENT_ORDERS)
    expect(list[0].code).toBe('HL2610130011')
    expect(list.map((o) => o.code)).not.toContain('HL2610130000')
  })

  it('drops entries older than 180 days and anything malformed', () => {
    const old = new Date(Date.now() - 181 * 24 * 3600 * 1000).toISOString()
    localStorage.setItem(
      RECENT_ORDERS_KEY,
      JSON.stringify([
        { code: 'HL2610130001', token: token(1), createdAt: new Date().toISOString() },
        { code: 'HL2604010002', token: token(2), createdAt: old },
        { code: 'bad code!', token: token(3), createdAt: new Date().toISOString() },
        'garbage',
      ]),
    )
    expect(readRecentOrders().map((o) => o.code)).toEqual(['HL2610130001'])
  })

  it('stores only code, token and date — never personal data', () => {
    saveRecentOrder('HL2610130001', token(1))
    localStorage.setItem(
      RECENT_ORDERS_KEY,
      JSON.stringify([{ ...readRecentOrders()[0], customerName: 'Nguyễn A', phone: '0912345678', address: 'x' }]),
    )
    saveRecentOrder('HL2610130002', token(2))
    const stored = JSON.parse(localStorage.getItem(RECENT_ORDERS_KEY)!) as Record<string, unknown>[]
    for (const entry of stored) expect(Object.keys(entry).sort()).toEqual(['code', 'createdAt', 'token'])
    expect(localStorage.getItem(RECENT_ORDERS_KEY)).not.toMatch(/Nguyễn|0912345678/)
  })

  it('removes claimed orders and survives broken storage', () => {
    saveRecentOrder('HL2610130001', token(1))
    saveRecentOrder('HL2610130002', token(2))
    removeRecentOrders(['HL2610130001'])
    expect(readRecentOrders().map((o) => o.code)).toEqual(['HL2610130002'])
    localStorage.setItem(RECENT_ORDERS_KEY, '{not json')
    expect(readRecentOrders()).toEqual([])
  })

  it('builds the in-app tracking path', () => {
    expect(trackingPath('HL2610130001', 'a-b_c')).toBe('/don-hang/HL2610130001?t=a-b_c')
  })
})
