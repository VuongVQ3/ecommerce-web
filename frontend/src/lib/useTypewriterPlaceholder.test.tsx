// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE_MS, HOLD_MS, NEXT_MS, TYPE_MS, useTypewriterPlaceholder } from './useTypewriterPlaceholder'

const PHRASES = ['Ab', 'Xyz'] as const

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms))

describe('useTypewriterPlaceholder', () => {
  it('types, holds, deletes, then goes to the next phrase, and loops', () => {
    const { result } = renderHook(() => useTypewriterPlaceholder(PHRASES, { active: true }))
    expect(result.current).toBe('')
    tick(TYPE_MS)
    expect(result.current).toBe('A')
    tick(TYPE_MS)
    expect(result.current).toBe('Ab')
    tick(HOLD_MS - 1)
    expect(result.current).toBe('Ab')
    tick(1)
    expect(result.current).toBe('A')
    tick(DELETE_MS)
    expect(result.current).toBe('')
    tick(NEXT_MS)
    expect(result.current).toBe('X')
    tick(TYPE_MS * 2 + HOLD_MS + DELETE_MS * 2 + NEXT_MS)
    // Back to the first phrase
    expect(result.current).toBe('A')
  })

  it('stops (and clears the text) when inactive, restarting from the first phrase', () => {
    const { result, rerender } = renderHook(({ active }) => useTypewriterPlaceholder(PHRASES, { active }), {
      initialProps: { active: true },
    })
    tick(TYPE_MS * 2 + HOLD_MS + DELETE_MS + NEXT_MS)
    expect(result.current).toBe('X')
    rerender({ active: false })
    expect(result.current).toBe('')
    expect(vi.getTimerCount()).toBe(0)
    tick(5000)
    expect(result.current).toBe('')
    rerender({ active: true })
    tick(TYPE_MS)
    expect(result.current).toBe('A')
  })

  it('leaves no timer behind when unmounted', () => {
    const { unmount } = renderHook(() => useTypewriterPlaceholder(PHRASES, { active: true }))
    tick(TYPE_MS)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
