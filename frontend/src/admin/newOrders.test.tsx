// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi, type OrderSummary } from '../lib/adminApi'
import { newOrderToast, playNewOrderSound, POLL_MS, useNewOrderPolling, useOrderSoundSetting } from './newOrders'

const summary = (latestOrderCode: string | null, pendingCount = 1): OrderSummary => ({
  pendingCount,
  latestOrderId: latestOrderCode && `id-${latestOrderCode}`,
  latestOrderCode,
  latestCreatedAt: latestOrderCode && '2026-11-03T08:00:00Z',
})

let visibility: DocumentVisibilityState = 'visible'
function setVisibility(value: DocumentVisibilityState) {
  visibility = value
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Lets the pending promise of a poll settle */
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('useNewOrderPolling', () => {
  it('asks at once, then every 20 s; only a change of the newest order counts as new (not the first answer)', async () => {
    const poll = vi
      .spyOn(adminApi, 'orderSummary')
      .mockResolvedValueOnce(summary('HL1', 2))
      .mockResolvedValueOnce(summary('HL1', 2))
      .mockResolvedValueOnce(summary('HL2', 3))
    const onNew = vi.fn()
    const { result } = renderHook(() => useNewOrderPolling(onNew))

    await tick()
    expect(poll).toHaveBeenCalledTimes(1)
    expect(result.current.summary?.pendingCount).toBe(2)
    expect(onNew).not.toHaveBeenCalled()

    await tick(POLL_MS)
    expect(poll).toHaveBeenCalledTimes(2)
    expect(onNew).not.toHaveBeenCalled()

    await tick(POLL_MS)
    expect(poll).toHaveBeenCalledTimes(3)
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onNew.mock.calls[0][0].latestOrderCode).toBe('HL2')
    // with the previous answer, to tell how many came in
    expect(onNew.mock.calls[0][1].latestOrderCode).toBe('HL1')
    expect(result.current.summary?.pendingCount).toBe(3)
  })

  it('does not ask while the tab is hidden, and asks as soon as it is shown again', async () => {
    const poll = vi.spyOn(adminApi, 'orderSummary').mockResolvedValue(summary('HL1'))
    renderHook(() => useNewOrderPolling(vi.fn()))
    await tick()
    expect(poll).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    await tick(POLL_MS * 3)
    expect(poll).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    await tick()
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('stays quiet on errors and tries again at the next tick', async () => {
    const poll = vi.spyOn(adminApi, 'orderSummary').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(summary('HL1'))
    const { result } = renderHook(() => useNewOrderPolling(vi.fn()))
    await tick()
    expect(result.current.summary).toBeNull()
    await tick(POLL_MS)
    expect(poll).toHaveBeenCalledTimes(2)
    expect(result.current.summary?.latestOrderCode).toBe('HL1')
  })

  it('stops when the back office is left (unmount)', async () => {
    const poll = vi.spyOn(adminApi, 'orderSummary').mockResolvedValue(summary('HL1'))
    const { unmount } = renderHook(() => useNewOrderPolling(vi.fn()))
    await tick()
    unmount()
    await tick(POLL_MS * 3)
    expect(poll).toHaveBeenCalledTimes(1)
  })
})

describe('newOrderToast', () => {
  it('names and opens the order when one came in', () => {
    expect(newOrderToast(summary('HL2', 3), summary('HL1', 2))).toEqual({ message: 'Có đơn mới HL2', label: 'Mở đơn', to: '/admin/don-hang/HL2' })
    // One in, one confirmed meanwhile: the count did not grow, still one new order
    expect(newOrderToast(summary('HL2', 2), summary('HL1', 2)).message).toBe('Có đơn mới HL2')
  })

  it('gives the count and opens the list when several came in between two polls', () => {
    expect(newOrderToast(summary('HL5', 6), summary('HL1', 3))).toEqual({ message: 'Có 3 đơn mới', label: 'Xem đơn', to: '/admin/don-hang' })
  })
})

describe('sound', () => {
  it('is on by default and remembers the choice', () => {
    localStorage.clear()
    const { result } = renderHook(() => useOrderSoundSetting())
    expect(result.current[0]).toBe(true)
    act(() => result.current[1](false))
    expect(result.current[0]).toBe(false)
    expect(renderHook(() => useOrderSoundSetting()).result.current[0]).toBe(false)
  })

  it('still works when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useOrderSoundSetting())
    expect(result.current[0]).toBe(true)
    act(() => result.current[1](false))
    expect(result.current[0]).toBe(false)
  })

  it('never throws, with no audio or when the browser refuses to play', () => {
    expect(() => playNewOrderSound()).not.toThrow()
    window.AudioContext = vi.fn(() => {
      throw new Error('NotAllowedError')
    }) as unknown as typeof AudioContext
    expect(() => playNewOrderSound()).not.toThrow()
  })
})
