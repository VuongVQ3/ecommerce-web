// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminApi, type StockRow } from '../lib/adminApi'
import InventoryPage from './InventoryPage'

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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const STOCK: StockRow = {
  id: 7,
  name: 'Hạt điều',
  slug: 'hat-dieu',
  active: true,
  onHand: 50,
  reserved: 2,
  available: 48,
  lowStockThreshold: 10,
  lowStock: false,
}

async function openImport() {
  vi.spyOn(adminApi, 'inventory').mockResolvedValue({ items: [STOCK], page: 0, size: 100, totalItems: 1, totalPages: 1 })
  const router = createMemoryRouter([{ path: '/admin/kho', element: <InventoryPage /> }], { initialEntries: ['/admin/kho'] })
  render(<RouterProvider router={router} />)
  fireEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: 'Nhập hàng' }))
  return screen.getByRole('dialog')
}

describe('import dialog', () => {
  it('shows the stock after the import and the total cost while typing', async () => {
    const dialog = await openImport()
    expect(dialog.textContent).not.toContain('Tồn sau khi nhập')

    fireEvent.change(within(dialog).getByLabelText(/Số lượng nhập/), { target: { value: '20' } })
    expect(dialog.textContent).toContain('Tồn sau khi nhập: 50 → 70')
    expect(dialog.textContent).not.toContain('Thành tiền')

    fireEvent.change(within(dialog).getByLabelText(/Giá nhập/), { target: { value: '150000' } })
    expect(dialog.textContent).toContain('Thành tiền: 20 × 150.000₫ = 3.000.000₫')
  })

  it('sends with Enter when the quantity is valid, and not before', async () => {
    const importStock = vi.spyOn(adminApi, 'importStock').mockResolvedValue({} as never)
    const dialog = await openImport()
    const quantity = within(dialog).getByLabelText(/Số lượng nhập/)

    fireEvent.change(quantity, { target: { value: '0' } })
    fireEvent.submit(quantity.closest('form')!)
    expect(await within(dialog).findByText('Số lượng phải là số nguyên lớn hơn 0')).toBeTruthy()
    expect(importStock).not.toHaveBeenCalled()

    fireEvent.change(quantity, { target: { value: '20' } })
    fireEvent.submit(quantity.closest('form')!)
    await waitFor(() => expect(importStock).toHaveBeenCalledWith(7, { quantity: 20, unitCost: undefined, supplier: undefined, note: undefined }))
  })
})

describe('stock history', () => {
  it('names the order of a movement, or says it was deleted', async () => {
    vi.spyOn(adminApi, 'inventory').mockResolvedValue({ items: [STOCK], page: 0, size: 100, totalItems: 1, totalPages: 1 })
    const row = { quantity: -2, note: null, unitCost: null, supplier: null, actorName: null, createdAt: '2026-11-05T03:00:00Z' }
    vi.spyOn(adminApi, 'movements').mockResolvedValue({
      items: [
        { ...row, id: 'm1', type: 'ORDER_SHIP', orderCode: 'HL261105ABCD' },
        // The order was deleted: its movements stay, without an order
        { ...row, id: 'm2', type: 'ORDER_RESERVE', orderCode: null, quantity: 3 },
        { ...row, id: 'm3', type: 'ADJUST', orderCode: null, quantity: 3, note: 'Hoàn kho khi xoá đơn test #HL261104TEST' },
      ],
      page: 0,
      size: 20,
      totalItems: 3,
      totalPages: 1,
    })
    const router = createMemoryRouter([{ path: '/admin/kho', element: <InventoryPage /> }], { initialEntries: ['/admin/kho'] })
    render(<RouterProvider router={router} />)
    fireEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: 'Thao tác khác với Hạt điều' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lịch sử kho' }))

    const dialog = await screen.findByRole('dialog')
    const rows = await within(dialog).findAllByRole('row')
    const text = rows.map((r) => r.textContent)
    expect(text.find((t) => t?.includes('Xuất kho'))).toContain('Đơn HL261105ABCD')
    expect(text.find((t) => t?.includes('Giữ hàng'))).toContain('Đơn đã xoá')
    // An adjustment never belonged to an order
    expect(text.find((t) => t?.includes('Hoàn kho khi xoá'))).not.toContain('Đơn đã xoá')
  })
})
