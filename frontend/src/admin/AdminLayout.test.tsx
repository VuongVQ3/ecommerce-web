// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { adminApi, type OrderSummary } from '../lib/adminApi'
import AdminLayout from './AdminLayout'
import * as newOrders from './newOrders'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', fullName: 'Quản trị', email: 'a@b.vn', role: 'ADMIN', passwordChangeRequired: false },
    logout: vi.fn(),
  }),
}))

const summary = (latestOrderCode: string, pendingCount: number): OrderSummary => ({
  pendingCount,
  latestOrderId: `id-${latestOrderCode}`,
  latestOrderCode,
  latestCreatedAt: '2026-11-03T08:00:00Z',
})

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderAdmin() {
  const router = createMemoryRouter(
    [{ path: '/admin', element: <AdminLayout />, children: [{ index: true, element: <Where /> }, { path: '*', element: <Where /> }] }],
    { initialEntries: ['/admin'] },
  )
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  )
}

const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('AdminLayout and new orders', () => {
  it('shows the pending count on "Đơn hàng" and in the tab title', async () => {
    vi.spyOn(adminApi, 'orderSummary').mockResolvedValue(summary('HL1', 3))
    renderAdmin()
    await tick()
    const link = screen.getAllByRole('link', { name: /Đơn hàng/ })[0]
    expect(within(link).getByText('3')).toBeTruthy()
    expect(document.title).toBe('(3) Tổng quan | Quản trị | Hạt Lành')
  })

  it('no badge and no "(n)" with nothing pending', async () => {
    vi.spyOn(adminApi, 'orderSummary').mockResolvedValue(summary('HL1', 0))
    renderAdmin()
    await tick()
    expect(within(screen.getAllByRole('link', { name: /Đơn hàng/ })[0]).queryByText('0')).toBeNull()
    expect(document.title).toBe('Tổng quan | Quản trị | Hạt Lành')
  })

  it('a new order brings a toast (and the sound, while on) that opens it', async () => {
    const sound = vi.spyOn(newOrders, 'playNewOrderSound').mockImplementation(() => {})
    vi.spyOn(adminApi, 'orderSummary').mockResolvedValueOnce(summary('HL1', 1)).mockResolvedValue(summary('HL2', 2))
    renderAdmin()
    await tick()
    expect(screen.queryByText(/Có đơn mới/)).toBeNull()

    await tick(newOrders.POLL_MS)
    expect(screen.getByText('Có đơn mới HL2')).toBeTruthy()
    expect(sound).toHaveBeenCalledTimes(1)
    expect(document.title).toBe('(2) Tổng quan | Quản trị | Hạt Lành')

    fireEvent.click(screen.getByRole('button', { name: 'Mở đơn' }))
    expect(screen.getByTestId('where').textContent).toBe('/admin/don-hang/HL2')
  })

  it('several new orders between two polls: one toast with the count, opening the order list', async () => {
    vi.spyOn(newOrders, 'playNewOrderSound').mockImplementation(() => {})
    vi.spyOn(adminApi, 'orderSummary').mockResolvedValueOnce(summary('HL1', 1)).mockResolvedValue(summary('HL4', 4))
    renderAdmin()
    await tick()
    await tick(newOrders.POLL_MS)
    expect(screen.getByText('Có 3 đơn mới')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Xem đơn' }))
    expect(screen.getByTestId('where').textContent).toBe('/admin/don-hang')
  })

  it('stays silent once the sound is switched off', async () => {
    const sound = vi.spyOn(newOrders, 'playNewOrderSound').mockImplementation(() => {})
    vi.spyOn(adminApi, 'orderSummary').mockResolvedValueOnce(summary('HL1', 1)).mockResolvedValue(summary('HL2', 2))
    renderAdmin()
    await tick()
    const toggle = screen.getAllByRole('button', { name: /Âm báo đơn mới/ })[0]
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    await tick(newOrders.POLL_MS)
    expect(screen.getByText('Có đơn mới HL2')).toBeTruthy()
    expect(sound).not.toHaveBeenCalled()
  })
})
