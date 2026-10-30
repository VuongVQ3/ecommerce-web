// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type Page } from '../lib/api'
import { adminApi, type AdminProductRow } from '../lib/adminApi'
import ProductsPage from './ProductsPage'
import { arrayMove, dropAnchor, dropIndex, shiftOf } from './reorder'

const toast = vi.hoisted(() => vi.fn())
vi.mock('../components/Toast', () => ({ useToast: () => toast }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
  // jsdom has no PointerEvent: a MouseEvent with a pointerId is all the hook reads
  if (typeof window.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      readonly pointerId: number
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
      }
    }
    window.PointerEvent = PointerEventPolyfill as typeof PointerEvent
  }
})

beforeEach(() => toast.mockReset())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('reorder helpers', () => {
  const slots = [0, 60, 120, 180].map((top) => ({ top, height: 60 }))

  it('moves an item to a new index without touching the original', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(arrayMove(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(arrayMove(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops past every row whose middle is above the dragged row’s middle', () => {
    expect(dropIndex(slots, 0, 0)).toBe(0)
    // The next row's middle is 60px further down
    expect(dropIndex(slots, 0, 59)).toBe(0)
    expect(dropIndex(slots, 0, 61)).toBe(1)
    expect(dropIndex(slots, 0, 500)).toBe(3)
    expect(dropIndex(slots, 3, -500)).toBe(0)
    expect(dropIndex(slots, 2, -61)).toBe(1)
  })

  it('slides the rows the dragged one passes by its height plus the gap', () => {
    // Dragging the first row to the third place: rows 2 and 3 move up, the last one stays
    expect([0, 1, 2, 3].map((i) => shiftOf(slots, 0, 2, i))).toEqual([0, -60, -60, 0])
    expect([0, 1, 2, 3].map((i) => shiftOf(slots, 3, 1, i))).toEqual([0, 60, 60, 0])
    expect([0, 1, 2, 3].map((i) => shiftOf(slots, 1, 1, i))).toEqual([0, 0, 0, 0])
    // Cards 100px tall with a 12px gap
    const cards = [0, 112, 224].map((top) => ({ top, height: 100 }))
    expect(shiftOf(cards, 0, 2, 2)).toBe(-112)
  })

  it('anchors on the next row, or on the previous one at the end', () => {
    expect(dropAnchor([2, 1, 3], 1)).toEqual({ beforeId: 3 })
    expect(dropAnchor([2, 3, 1], 1)).toEqual({ afterId: 3 })
    expect(dropAnchor([1, 2, 3], 1)).toEqual({ beforeId: 2 })
    expect(dropAnchor([1], 1)).toBeNull()
  })
})

const row = (id: number, name: string, extra: Partial<AdminProductRow> = {}): AdminProductRow => ({
  id,
  name,
  slug: `san-pham-${id}`,
  categoryName: 'Hạt dinh dưỡng',
  categorySlug: 'hat-dinh-duong',
  price: 150_000,
  active: true,
  onHand: 0,
  reserved: 0,
  available: 0,
  lowStockThreshold: 10,
  lowStock: false,
  imageUrl: null,
  sortOrder: id,
  ...extra,
})

const page = (items: AdminProductRow[]): Page<AdminProductRow> => ({
  items,
  page: 0,
  size: 100,
  totalItems: items.length,
  totalPages: 1,
})

const PRODUCTS = [row(1, 'Mắc ca', { onHand: 5 }), row(2, 'Hạt điều'), row(3, 'Óc chó')]

function renderPage() {
  // A fresh page object on every load, as the network would give
  const products = vi.spyOn(adminApi, 'products').mockImplementation(async () => page(PRODUCTS))
  const router = createMemoryRouter([{ path: '/admin/san-pham', element: <ProductsPage /> }], {
    initialEntries: ['/admin/san-pham'],
  })
  render(<RouterProvider router={router} />)
  return { products }
}

/** Product names in the desktop table, top to bottom */
const tableOrder = () =>
  within(screen.getByRole('table'))
    .getAllByRole('link')
    .map((a) => a.textContent)
    .filter((t) => t !== 'Sửa')

const handle = (name: string) => within(screen.getByRole('table')).getByRole('button', { name: `Đổi thứ tự: ${name}` })

describe('products page', () => {
  it('loads the whole catalogue on one page', async () => {
    const { products } = renderPage()
    await screen.findByRole('table')
    expect(products).toHaveBeenCalledWith('', '', 0, expect.anything(), false, 100)
    expect(handle('Mắc ca').getAttribute('aria-describedby')).toBe('reorder-help')
    expect(screen.queryByText(/Chỉ kéo được trong trang đang xem/)).toBeNull()
  })

  it('moves a product one step down with the arrow key and keeps the focus on its handle', async () => {
    const move = vi.spyOn(adminApi, 'moveProduct').mockResolvedValue(PRODUCTS[0])
    renderPage()
    await screen.findByRole('table')

    handle('Mắc ca').focus()
    fireEvent.keyDown(handle('Mắc ca'), { key: 'ArrowDown' })

    expect(tableOrder()).toEqual(['Hạt điều', 'Mắc ca', 'Óc chó'])
    await waitFor(() => expect(move).toHaveBeenCalledWith(1, { beforeId: 3 }))
    expect(document.activeElement).toBe(handle('Mắc ca'))
    expect(screen.getByText('Đã chuyển "Mắc ca" tới vị trí 2 trên 3')).toBeTruthy()
  })

  it('drags a product to the end with the pointer', async () => {
    const move = vi.spyOn(adminApi, 'moveProduct').mockResolvedValue(PRODUCTS[0])
    renderPage()
    await screen.findByRole('table')
    // Rows 60px tall, one under the other
    within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1)
      .forEach((tr, i) => {
        tr.getBoundingClientRect = () => ({ top: i * 60, height: 60, bottom: i * 60 + 60, left: 0, right: 0, width: 0, x: 0, y: i * 60, toJSON: () => ({}) })
      })

    fireEvent.pointerDown(handle('Mắc ca'), { button: 0, clientY: 30, pointerId: 1 })
    fireEvent.pointerMove(handle('Mắc ca'), { clientY: 230, pointerId: 1 })
    // Preview while dragging, rows kept in place in the DOM: the dragged one follows the pointer, the others make room
    const transforms = within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1)
      .map((tr) => tr.style.transform)
    expect(transforms).toEqual(['translateY(200px)', 'translateY(-60px)', 'translateY(-60px)'])
    expect(tableOrder()).toEqual(['Mắc ca', 'Hạt điều', 'Óc chó'])
    expect(move).not.toHaveBeenCalled()
    fireEvent.pointerUp(handle('Mắc ca'), { clientY: 230, pointerId: 1 })
    fireEvent.lostPointerCapture(handle('Mắc ca'), { pointerId: 1 })

    await waitFor(() => expect(move).toHaveBeenCalledWith(1, { afterId: 3 }))
    expect(move).toHaveBeenCalledTimes(1)
    expect(tableOrder()).toEqual(['Hạt điều', 'Óc chó', 'Mắc ca'])
  })

  it('cancels a drag with Esc', async () => {
    const move = vi.spyOn(adminApi, 'moveProduct').mockResolvedValue(PRODUCTS[0])
    renderPage()
    await screen.findByRole('table')

    fireEvent.pointerDown(handle('Mắc ca'), { button: 0, clientY: 30, pointerId: 1 })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(handle('Mắc ca'), { clientY: 230, pointerId: 1 })

    expect(move).not.toHaveBeenCalled()
    expect(tableOrder()).toEqual(['Mắc ca', 'Hạt điều', 'Óc chó'])
  })

  it('puts the order back when the server refuses the move', async () => {
    vi.spyOn(adminApi, 'moveProduct').mockRejectedValue(new ApiError('Sản phẩm dùng làm mốc không còn nữa', 409, {}, 'MOVE_TARGET_GONE'))
    const { products } = renderPage()
    await screen.findByRole('table')

    fireEvent.keyDown(handle('Mắc ca'), { key: 'ArrowDown' })
    expect(tableOrder()).toEqual(['Hạt điều', 'Mắc ca', 'Óc chó'])

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ message: 'Sản phẩm dùng làm mốc không còn nữa', tone: 'error' }))
    await waitFor(() => expect(products).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(tableOrder()).toEqual(['Mắc ca', 'Hạt điều', 'Óc chó']))
  })

  it('deletes after a warning about the stock left', async () => {
    const remove = vi.spyOn(adminApi, 'deleteProduct').mockResolvedValue(undefined)
    const { products } = renderPage()
    await screen.findByRole('table')

    fireEvent.click(within(screen.getByRole('table')).getAllByRole('button', { name: 'Xoá' })[0])
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Trong kho vẫn còn 5 sản phẩm')
    expect(dialog.textContent).toContain('Chỉ muốn ngừng bán? Hãy ẩn')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' }))

    await waitFor(() => expect(remove).toHaveBeenCalledWith(1))
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ message: 'Đã xoá "Mắc ca"', tone: 'success' }))
    await waitFor(() => expect(products).toHaveBeenCalledTimes(2))
  })

  it('offers to hide a product that was ordered instead of deleting it', async () => {
    vi.spyOn(adminApi, 'deleteProduct').mockRejectedValue(
      new ApiError('Sản phẩm đã có trong 2 đơn hàng nên không xoá được. Hãy ẩn sản phẩm để ngừng bán.', 409, {}, 'PRODUCT_HAS_ORDERS'),
    )
    renderPage()
    await screen.findByRole('table')

    fireEvent.click(within(screen.getByRole('table')).getAllByRole('button', { name: 'Xoá' })[1])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xoá vĩnh viễn' }))

    const hide = await screen.findByRole('button', { name: 'Ẩn sản phẩm thay vì xoá' })
    expect(screen.getByRole('alert').textContent).toContain('2 đơn hàng')
    expect(screen.queryByRole('button', { name: 'Xoá vĩnh viễn' })).toBeNull()
    fireEvent.click(hide)
    expect(screen.getByRole('dialog').textContent).toContain('Ẩn "Hạt điều"?')
  })
})
