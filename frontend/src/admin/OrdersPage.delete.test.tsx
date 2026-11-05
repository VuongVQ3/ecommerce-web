// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderStatus } from '../lib/api'
import { adminApi, type AdminOrderDetail, type AdminOrderRow } from '../lib/adminApi'
import OrdersPage from './OrdersPage'

const auth = vi.hoisted(() => ({ role: 'ADMIN' as 'ADMIN' | 'STAFF' }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { role: auth.role } }) }))
const toast = vi.hoisted(() => vi.fn())
vi.mock('../components/Toast', () => ({ useToast: () => toast }))

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
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

const row = (code: string, status: OrderStatus): AdminOrderRow => ({
  code,
  status,
  statusLabel: status,
  createdAt: '2026-11-05T03:00:00Z',
  customerName: 'Khách Test',
  phone: '0900000000',
  itemCount: 1,
  total: 100_000,
  flagLevel: null,
  flagReason: null,
})

const ROWS = [row('HL1PENDING', 'PENDING'), row('HL2DONE', 'COMPLETED'), row('HL3CANCEL', 'CANCELLED'), row('HL4SHIP', 'SHIPPING')]

function renderPage(rows = ROWS) {
  const list = vi.spyOn(adminApi, 'orders').mockResolvedValue({
    page: { items: rows, page: 0, size: 20, totalItems: rows.length, totalPages: 1 },
    pendingCount: 1,
  })
  const router = createMemoryRouter([{ path: '/admin/don-hang', element: <OrdersPage /> }], { initialEntries: ['/admin/don-hang'] })
  render(<RouterProvider router={router} />)
  return list
}

/** The desktop table (the phone cards carry the same boxes) */
const table = async () => within(await screen.findByRole('table'))

describe('OrdersPage: deleting orders', () => {
  it('shows no boxes to STAFF', async () => {
    auth.role = 'STAFF'
    renderPage()
    expect(await screen.findAllByText('HL2DONE')).toBeTruthy()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('ADMIN ticks closed orders only; open ones are disabled with the reason', async () => {
    renderPage()
    const t = await table()
    const pending = t.getByRole('checkbox', { name: 'Đơn HL1PENDING: Huỷ đơn trước rồi mới xoá' }) as HTMLInputElement
    expect(pending.disabled).toBe(true)
    expect(pending.parentElement?.getAttribute('title')).toBe('Huỷ đơn trước rồi mới xoá')
    expect((t.getByRole('checkbox', { name: 'Đơn HL4SHIP: Huỷ đơn trước rồi mới xoá' }) as HTMLInputElement).disabled).toBe(true)

    fireEvent.click(t.getByRole('checkbox', { name: 'Chọn tất cả đơn đã đóng trong trang' }))
    expect((t.getByRole('checkbox', { name: 'Chọn đơn HL2DONE' }) as HTMLInputElement).checked).toBe(true)
    expect((t.getByRole('checkbox', { name: 'Chọn đơn HL3CANCEL' }) as HTMLInputElement).checked).toBe(true)
    expect(pending.checked).toBe(false)
    const bar = screen.getByRole('region', { name: 'Đơn đã chọn' })
    expect(bar.textContent).toContain('Đã chọn 2 đơn')

    fireEvent.click(t.getByRole('checkbox', { name: 'Chọn đơn HL2DONE' }))
    expect(bar.textContent).toContain('Đã chọn 1 đơn')
  })

  it('needs XOÁ typed, offers the restock box for completed orders (off by default) and sends it', async () => {
    const list = renderPage()
    vi.spyOn(adminApi, 'order').mockResolvedValue({
      order: { code: 'HL2DONE', items: [{ productId: 5, productName: 'Mắc ca', quantity: 3 }] },
    } as unknown as AdminOrderDetail)
    const remove = vi
      .spyOn(adminApi, 'deleteOrders')
      .mockResolvedValue({ deleted: ['HL2DONE'], skipped: [{ code: 'HL3CANCEL', reason: 'Không tìm thấy đơn hàng' }] })
    const t = await table()
    fireEvent.click(t.getByRole('checkbox', { name: 'Chọn tất cả đơn đã đóng trong trang' }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Đơn đã chọn' })).getByRole('button', { name: 'Xoá' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('HL2DONE')
    expect(dialog.textContent).toContain('không khôi phục được')
    const restock = within(dialog).getByRole('checkbox', { name: /Cộng lại hàng của các đơn đã giao vào kho/ }) as HTMLInputElement
    expect(restock.checked).toBe(false)
    expect(await within(dialog).findByText('Mắc ca:', { exact: false })).toBeTruthy()
    expect(dialog.textContent).toContain('+3 gói')

    const submit = within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    const word = within(dialog).getByLabelText(/để xác nhận/)
    fireEvent.change(word, { target: { value: 'xoa' } })
    expect(submit.disabled).toBe(true)
    fireEvent.change(word, { target: { value: 'XOÁ' } })
    expect(submit.disabled).toBe(false)

    fireEvent.click(restock)
    fireEvent.click(submit)
    await waitFor(() => expect(remove).toHaveBeenCalledWith(['HL2DONE', 'HL3CANCEL'], true))
    // Done: the skips are named, the list reloads, nothing stays ticked
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        message: 'Đã xoá 1 đơn · bỏ qua 1 đơn: HL3CANCEL (Không tìm thấy đơn hàng)',
        tone: 'success',
      }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Đơn đã chọn' })).toBeNull()
    expect(list.mock.calls.filter(([f]) => f.size !== 1).length).toBeGreaterThan(1)
  })

  it('has no restock box when no completed order is ticked, and sends restock false', async () => {
    renderPage()
    const remove = vi.spyOn(adminApi, 'deleteOrders').mockResolvedValue({ deleted: ['HL3CANCEL'], skipped: [] })
    const deleteOne = vi.spyOn(adminApi, 'deleteOrder').mockResolvedValue(undefined)
    const t = await table()
    fireEvent.click(t.getByRole('checkbox', { name: 'Chọn đơn HL3CANCEL' }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Đơn đã chọn' })).getByRole('button', { name: 'Xoá' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    fireEvent.change(within(dialog).getByLabelText(/để xác nhận/), { target: { value: 'XÓA' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' }))
    // One order: the single DELETE
    await waitFor(() => expect(deleteOne).toHaveBeenCalledWith('HL3CANCEL', false))
    expect(remove).not.toHaveBeenCalled()
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ message: 'Đã xoá 1 đơn', tone: 'success' }))
  })
})
