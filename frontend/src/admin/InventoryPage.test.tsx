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
