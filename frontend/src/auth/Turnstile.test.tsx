// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TurnstileHandle, TurnstileStatus } from './Turnstile'

// The site key is read when the module loads
vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA')
const { default: Turnstile } = await import('./Turnstile')

let options: TurnstileRenderOptions | null
const reset = vi.fn()

const cloudflareScript = () => document.head.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]')

/** Renders the widget; Cloudflare's script is loaded once for the whole file (like a page), by the first test */
async function show() {
  const statuses: TurnstileStatus[] = []
  const ref = createRef<TurnstileHandle>()
  render(<Turnstile ref={ref} action="register" onStatusChange={(s) => statuses.push(s)} />)
  const script = cloudflareScript()
  if (script?.onload) {
    await act(async () => script.onload!(new Event('load')))
    script.onload = null
  }
  await waitFor(() => expect(options).not.toBeNull())
  return { statuses, ref }
}

beforeEach(() => {
  options = null
  reset.mockReset()
  window.turnstile = {
    render: (_container, o) => {
      options = o
      return 'widget-1'
    },
    reset,
    remove: () => {},
  }
})

afterEach(() => {
  cleanup()
  delete window.turnstile
})

describe('Turnstile', () => {
  it('is always visible, in Vietnamese, for the given action', async () => {
    await show()

    expect(options).toMatchObject({ sitekey: '1x00000000000000000000AA', appearance: 'always', language: 'vi', action: 'register' })
  })

  it('reports ready once Cloudflare hands out a token, and pending again when it expires or is reset', async () => {
    const { statuses, ref } = await show()
    expect(statuses).toEqual(['pending'])

    act(() => options!.callback!('token-1'))
    expect(statuses.at(-1)).toBe('ready')
    await expect(ref.current!.getToken()).resolves.toBe('token-1')

    act(() => options!['expired-callback']!())
    expect(statuses.at(-1)).toBe('pending')

    act(() => options!.callback!('token-2'))
    act(() => ref.current!.reset())
    expect(statuses.at(-1)).toBe('pending')
    expect(reset).toHaveBeenCalledWith('widget-1')
  })

  it('shows the error under the widget as soon as Cloudflare reports one', async () => {
    const { statuses, ref } = await show()
    expect(screen.queryByRole('alert')).toBeNull()

    act(() => options!['error-callback']!('110200'))

    expect(screen.getByRole('alert').textContent).toBe('Xác minh chống spam gặp lỗi. Vui lòng tải lại trang và thử lại.')
    expect(statuses.at(-1)).toBe('error')
    await expect(ref.current!.getToken()).rejects.toThrow('Xác minh chống spam gặp lỗi')

    // A token afterwards (Cloudflare retried) clears it
    act(() => options!.callback!('token-3'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(statuses.at(-1)).toBe('ready')
  })
})
