// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, type User } from '../lib/api'
import { AUTH_CHANNEL, AuthProvider, REFOCUS_CHECK_MS, useAuth } from './AuthContext'

const AN: User = { id: 'u1', email: 'an@example.com', fullName: 'Trần An', phone: null, role: 'CUSTOMER', emailVerified: true, passwordChangeRequired: false }
const offline = () => new ApiError('Không kết nối được máy chủ. Vui lòng thử lại.', 0)
const signedOut = () => new ApiError('Vui lòng đăng nhập để tiếp tục', 401)

function Who() {
  const { user, loading } = useAuth()
  return <p data-testid="who">{loading ? 'loading' : (user?.email ?? 'guest')}</p>
}

function renderAuth() {
  const router = createMemoryRouter([{ path: '*', element: <AuthProvider><Who /></AuthProvider> }])
  render(<RouterProvider router={router} />)
}

const who = () => screen.getByTestId('who').textContent

function showTab() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AuthProvider', () => {
  it('a network error is not a sign-out: the user stays signed in', async () => {
    const me = vi.spyOn(api, 'me').mockResolvedValueOnce(AN).mockRejectedValueOnce(offline())
    renderAuth()
    await waitFor(() => expect(who()).toBe('an@example.com'))

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + REFOCUS_CHECK_MS + 1)
    act(() => showTab())
    await waitFor(() => expect(me).toHaveBeenCalledTimes(2))
    expect(who()).toBe('an@example.com')
  })

  it('a 401 is a sign-out', async () => {
    vi.spyOn(api, 'me').mockResolvedValueOnce(AN).mockRejectedValueOnce(signedOut())
    renderAuth()
    await waitFor(() => expect(who()).toBe('an@example.com'))

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + REFOCUS_CHECK_MS + 1)
    act(() => showTab())
    await waitFor(() => expect(who()).toBe('guest'))
  })

  it('stays undecided (not "guest") while the first check cannot reach the server', async () => {
    vi.spyOn(api, 'me').mockRejectedValue(offline())
    renderAuth()
    await waitFor(() => expect(api.me).toHaveBeenCalled())
    expect(who()).toBe('loading')
  })

  it('showing the tab again checks the session, at most every 30 seconds', async () => {
    const me = vi.spyOn(api, 'me').mockRejectedValueOnce(signedOut()).mockResolvedValue(AN)
    renderAuth()
    await waitFor(() => expect(who()).toBe('guest'))

    act(() => showTab())
    expect(me).toHaveBeenCalledTimes(1)

    // Signed in from another tab meanwhile
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + REFOCUS_CHECK_MS + 1)
    act(() => showTab())
    await waitFor(() => expect(who()).toBe('an@example.com'))
    expect(me).toHaveBeenCalledTimes(2)
  })

  it('another tab signing in makes this one ask again', async () => {
    const me = vi.spyOn(api, 'me').mockRejectedValueOnce(signedOut()).mockResolvedValue(AN)
    renderAuth()
    await waitFor(() => expect(who()).toBe('guest'))

    const otherTab = new BroadcastChannel(AUTH_CHANNEL)
    otherTab.postMessage('changed')
    otherTab.close()
    await waitFor(() => expect(who()).toBe('an@example.com'))
    expect(me).toHaveBeenCalledTimes(2)
  })
})
