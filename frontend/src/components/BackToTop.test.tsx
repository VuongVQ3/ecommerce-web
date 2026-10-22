// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BackToTop from './BackToTop'

/** The parts of Layout that matter here: the logo in the header, then <main id="main" tabIndex={-1}> */
function renderPage() {
  render(
    <>
      <header>
        <a href="/">Hạt Lành</a>
      </header>
      <main id="main" tabIndex={-1}>
        <a href="/san-pham">Sản phẩm đầu tiên</a>
      </main>
      <BackToTop />
    </>,
  )
  // Hidden (aria-hidden) at the top of the page, so not found by role
  return document.querySelector<HTMLButtonElement>('button[aria-label="Lên đầu trang"]')!
}

function reducedMotion(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('BackToTop', () => {
  it('moves focus to the main content, not to the logo (iOS rings a focused link after a tap)', () => {
    reducedMotion(true)
    const button = renderPage()

    fireEvent.click(button)

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
    expect(document.activeElement).toBe(document.getElementById('main'))
    expect(document.activeElement).not.toBe(screen.getByRole('link', { name: 'Hạt Lành' }))
  })

  it('does the same once the glide reaches the top', async () => {
    reducedMotion(false)
    // Frames run at once, 1 s apart: the 450 ms glide finishes on its first frame
    let now = 0
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      now += 1000
      queueMicrotask(() => cb(now))
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const button = renderPage()

    await act(async () => {
      fireEvent.click(button)
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(document.activeElement).toBe(document.getElementById('main'))
  })
})
