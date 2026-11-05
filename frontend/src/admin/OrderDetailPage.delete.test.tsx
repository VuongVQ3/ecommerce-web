// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order, OrderStatus } from '../lib/api'
import { adminApi, type AdminOrderDetail, type OrderAction } from '../lib/adminApi'
import OrderDetailPage from './OrderDetailPage'

const auth = vi.hoisted(() => ({ role: 'ADMIN' as 'ADMIN' | 'STAFF' }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { role: auth.role } }) }))
const toast = vi.hoisted(() => vi.fn())
vi.mock('../components/Toast', () => ({ useToast: () => toast }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  auth.role = 'ADMIN'
  toast.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const ALLOWED: Record<OrderStatus, OrderAction[]> = {
  PENDING: ['CONFIRM', 'CANCEL'],
  CONFIRMED: ['SHIP', 'CANCEL'],
  SHIPPING: ['COMPLETE', 'CANCEL'],
  COMPLETED: [],
  CANCELLED: [],
}

function detail(status: OrderStatus): AdminOrderDetail {
  const order: Order = {
    code: 'HL261105TEST',
    status,
    statusLabel: status,
    canCancel: false,
    createdAt: '2026-11-05T03:00:00Z',
    customerName: 'Chủ shop',
    phone: '0909123456',
    email: null,
    province: 'Thành phố Hồ Chí Minh',
    ward: 'Phường An Đông',
    addressLine: '1 Đường Test',
    note: null,
    paymentMethod: 'COD',
    items: [{ productId: 1, productName: 'Mắc ca size 22-25', quantity: 2, unitPrice: 285_000, lineTotal: 570_000, weightGrams: 500 } as Order['items'][number]],
    subtotal: 570_000,
    shippingFee: 0,
    total: 570_000,
    history: [{ status, label: status, at: '2026-11-05T03:00:00Z', reason: null }],
    cancelReasonCode: null,
    cancelReasonLabel: null,
    cancelReason: null,
    cancelledByType: null,
  }
  return { order, guest: true, account: null, carrier: null, trackingNumber: null, notes: [], allowedActions: ALLOWED[status], cancelReasonCode: null }
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderAt(status: OrderStatus) {
  vi.spyOn(adminApi, 'order').mockResolvedValue(detail(status))
  vi.spyOn(adminApi, 'customerStats').mockResolvedValue({
    phone: '0909123456',
    totalOrders: 1,
    previousOrders: 0,
    completed: 0,
    cancelled: 0,
    refusedDelivery: 0,
    firstOrderAt: null,
    flag: null,
  })
  const router = createMemoryRouter(
    [
      { path: '/admin/don-hang/:code', element: <OrderDetailPage /> },
      { path: '/admin/don-hang', element: <Where /> },
    ],
    { initialEntries: ['/admin/don-hang/HL261105TEST'] },
  )
  render(<RouterProvider router={router} />)
}

const menuButton = () => screen.queryByRole('button', { name: 'Thao tác khác' })

describe('OrderDetailPage: "Xoá đơn"', () => {
  it.each(['CANCELLED', 'COMPLETED'] as const)('ADMIN sees it on a %s order', async (status) => {
    renderAt(status)
    await screen.findByRole('heading', { name: 'HL261105TEST' })
    fireEvent.click(menuButton()!)
    expect(screen.getByRole('menuitem', { name: 'Xoá đơn' })).toBeTruthy()
  })

  it.each(['PENDING', 'CONFIRMED', 'SHIPPING'] as const)('ADMIN does not see it on a %s order', async (status) => {
    renderAt(status)
    await screen.findByRole('heading', { name: 'HL261105TEST' })
    expect(menuButton()).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Xoá đơn' })).toBeNull()
  })

  it('STAFF never sees it, even on a closed order', async () => {
    auth.role = 'STAFF'
    renderAt('COMPLETED')
    await screen.findByRole('heading', { name: 'HL261105TEST' })
    expect(menuButton()).toBeNull()
  })

  it('needs XOÁ, deletes with the single DELETE and goes back to the order list', async () => {
    renderAt('COMPLETED')
    const remove = vi.spyOn(adminApi, 'deleteOrder').mockResolvedValue(undefined)
    await screen.findByRole('heading', { name: 'HL261105TEST' })
    fireEvent.click(menuButton()!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Xoá đơn' }))

    const dialog = screen.getByRole('dialog', { name: 'Xoá đơn HL261105TEST?' })
    expect(within(dialog).getByRole('checkbox', { name: /Cộng lại hàng/ })).toBeTruthy()
    const submit = within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText(/để xác nhận/), { target: { value: 'XOÁ' } })
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)

    await waitFor(() => expect(remove).toHaveBeenCalledWith('HL261105TEST', false))
    expect((await screen.findByTestId('where')).textContent).toBe('/admin/don-hang')
    expect(toast).toHaveBeenCalledWith({ message: 'Đã xoá đơn HL261105TEST', tone: 'success' })
  })
})
