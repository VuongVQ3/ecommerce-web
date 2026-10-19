// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type User } from '../lib/api'
import { readRecentOrders, saveRecentOrder } from '../lib/recentOrders'
import RecentOrdersSync from './RecentOrdersSync'
import { ToastProvider } from './Toast'

const auth = vi.hoisted(() => ({ current: { user: null as User | null, lastSignInAt: null as number | null } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth.current }))

const AN: User = { id: 'u1', email: 'an@example.com', fullName: 'Trần An', phone: '0912345678', role: 'CUSTOMER', emailVerified: true, passwordChangeRequired: false }
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'

function renderSync() {
  const router = createMemoryRouter([{ path: '*', element: <RecentOrdersSync /> }])
  return render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  auth.current = { user: null, lastSignInAt: null }
  saveRecentOrder('HL261019AAAA', TOKEN)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('RecentOrdersSync', () => {
  it('does not offer the recent orders to a session that was already open', async () => {
    auth.current = { user: AN, lastSignInAt: null }
    const claim = vi.spyOn(api, 'claimOrders')
    renderSync()
    await new Promise((r) => setTimeout(r, 20))
    expect(claim).not.toHaveBeenCalled()
  })

  it('offers them right after a sign-in in this tab', async () => {
    const claim = vi.spyOn(api, 'claimOrders').mockResolvedValue({ claimed: ['HL261019AAAA'], skipped: [] })
    const view = renderSync()
    expect(claim).not.toHaveBeenCalled()

    auth.current = { user: AN, lastSignInAt: Date.now() }
    view.rerender(
      <ToastProvider>
        <RouterProvider router={createMemoryRouter([{ path: '*', element: <RecentOrdersSync /> }])} />
      </ToastProvider>,
    )
    await waitFor(() => expect(claim).toHaveBeenCalledWith([{ code: 'HL261019AAAA', token: TOKEN }]))
    await waitFor(() => expect(readRecentOrders()).toEqual([]))
  })

  it('never for staff accounts', async () => {
    auth.current = { user: { ...AN, role: 'STAFF' }, lastSignInAt: Date.now() }
    const claim = vi.spyOn(api, 'claimOrders')
    renderSync()
    await new Promise((r) => setTimeout(r, 20))
    expect(claim).not.toHaveBeenCalled()
  })
})
