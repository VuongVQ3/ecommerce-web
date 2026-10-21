// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Marquee } from './Motion'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Marquee', () => {
  it('paints the text in place first and starts moving on a later frame', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})

    const { container } = render(<Marquee items={['Mắc ca', 'Hạt điều']} />)
    const track = container.querySelector('.marquee-track')!
    expect(track.classList.contains('is-running')).toBe(false)

    act(() => frames.shift()!(0))
    expect(track.classList.contains('is-running')).toBe(false)
    act(() => frames.shift()!(16))
    expect(track.classList.contains('is-running')).toBe(true)
  })

  it('has the items once for screen readers (the copy is aria-hidden) and no background on the moving parts', () => {
    const { container } = render(<Marquee items={['Mắc ca', 'Hạt điều']} />)

    const rows = container.querySelectorAll('ul')
    expect(rows).toHaveLength(2)
    expect(rows[0].getAttribute('aria-hidden')).toBeNull()
    expect(rows[1].getAttribute('aria-hidden')).toBe('true')
    expect(rows[0].textContent).toBe('Mắc ca✦Hạt điều✦')
    expect(container.querySelectorAll('.bg-inherit')).toHaveLength(0)
  })
})
