// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CartLine, CartView } from '../lib/api'
import QuickCart from './QuickCart'
import { announceAdded } from './quickCartEvents'

const line = (id: number, name: string, extra: Partial<CartLine> = {}): CartLine => ({
  productId: id,
  name,
  slug: `sp-${id}`,
  imageUrl: null,
  categorySlug: 'hat-dinh-duong',
  weightGrams: 500,
  price: 132_000,
  regularPrice: null,
  priceAtAdd: null,
  quantity: 1,
  requestedQuantity: 1,
  maxPurchasable: 10,
  lineTotal: 132_000,
  status: 'OK',
  ...extra,
})

const view = (items: CartLine[]): CartView => ({
  items,
  totalQuantity: items.reduce((s, l) => s + l.quantity, 0),
  subtotal: 189_000,
  discountTotal: 57_000,
  shippingFee: 30_000,
  amountToFreeShipping: 311_000,
  freeShippingThreshold: 500_000,
  total: 219_000,
  canCheckout: true,
})

const cart = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('./CartContext', () => ({ useCart: () => cart.current }))
vi.mock('../components/Toast', () => ({ useToast: () => vi.fn() }))

function setFinePointer(fine: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: fine,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

const renderCart = () =>
  render(
    <MemoryRouter>
      <QuickCart />
    </MemoryRouter>,
  )

const panel = () => screen.getByRole('region', { hidden: true, name: 'Xem nhanh giỏ hàng' })
const isOpen = () => !panel().className.includes('invisible')

beforeEach(() => {
  setFinePointer(true)
  cart.current = {
    view: view([
      line(1, 'Hạnh nhân rang mộc', { regularPrice: 189_000 }),
      line(2, 'Óc chó'),
      line(3, 'Hạt điều'),
      line(4, 'Hạt chia'),
      line(5, 'Granola mới thêm'),
    ]),
    loading: false,
    count: 5,
    removeItem: vi.fn().mockResolvedValue(undefined),
    addItem: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('QuickCart', () => {
  it('opens 150ms after hovering, stays while moving onto the panel, closes 300ms after leaving', () => {
    vi.useFakeTimers()
    const { container } = renderCart()
    const wrapper = container.firstElementChild as HTMLElement
    expect(screen.getByRole('link', { name: 'Giỏ hàng, 5 sản phẩm' }).getAttribute('href')).toBe('/gio-hang')

    fireEvent.mouseEnter(wrapper)
    act(() => vi.advanceTimersByTime(100))
    expect(isOpen()).toBe(false)
    act(() => vi.advanceTimersByTime(60))
    expect(isOpen()).toBe(true)

    // The panel is inside the hover area: leaving the icon for the panel never fires mouseleave on the wrapper
    fireEvent.mouseLeave(wrapper)
    act(() => vi.advanceTimersByTime(200))
    fireEvent.mouseEnter(wrapper)
    act(() => vi.advanceTimersByTime(400))
    expect(isOpen()).toBe(true)

    fireEvent.mouseLeave(wrapper)
    act(() => vi.advanceTimersByTime(310))
    expect(isOpen()).toBe(false)
  })

  it('shows the 4 newest lines, the rest as a count, discounts, subtotal and free-shipping progress', () => {
    renderCart()
    fireEvent.click(screen.getByRole('button', { name: 'Xem nhanh giỏ hàng' }))
    const region = panel()
    expect(within(region).getByText('Giỏ hàng (5 sản phẩm)')).toBeTruthy()
    expect(within(region).getByText('Granola mới thêm')).toBeTruthy()
    expect(within(region).queryByText('Hạnh nhân rang mộc')).toBeNull()
    expect(within(region).getByText('và 1 sản phẩm khác')).toBeTruthy()
    expect(within(region).getByText(/311\.000₫/)).toBeTruthy()
    expect(within(region).getByRole('link', { name: 'Thanh toán' }).getAttribute('href')).toBe('/thanh-toan')
  })

  it('opens and closes from the keyboard, Esc returns focus to the toggle', () => {
    renderCart()
    const toggle = screen.getByRole('button', { name: 'Xem nhanh giỏ hàng' })
    expect(toggle.getAttribute('aria-controls')).toBe(panel().id)
    toggle.focus()
    fireEvent.click(toggle) // Enter/Space on a button
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    within(panel()).getByRole('link', { name: 'Xem giỏ hàng' }).focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle)
  })

  it('closes when focus leaves it', () => {
    render(
      <MemoryRouter>
        <QuickCart />
        <button type="button">Ngoài</button>
      </MemoryRouter>,
    )
    const toggle = screen.getByRole('button', { name: 'Xem nhanh giỏ hàng' })
    fireEvent.click(toggle)
    fireEvent.blur(toggle, { relatedTarget: screen.getByRole('button', { name: 'Ngoài' }) })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens on its own after an add-to-cart, for 3 seconds', () => {
    vi.useFakeTimers()
    renderCart()
    let shown = false
    act(() => {
      shown = announceAdded()
    })
    expect(shown).toBe(true)
    expect(isOpen()).toBe(true)
    act(() => vi.advanceTimersByTime(3100))
    expect(isOpen()).toBe(false)
  })

  it('does not take over add-to-cart feedback on touch screens', () => {
    setFinePointer(false)
    renderCart()
    expect(announceAdded()).toBe(false)
  })

  it('shows a placeholder while loading and an empty state', () => {
    cart.current = { ...cart.current, view: null, loading: true, count: 0 }
    const { unmount } = renderCart()
    expect(within(panel()).getByLabelText('Đang tải giỏ hàng')).toBeTruthy()
    unmount()
    cart.current = { ...cart.current, view: view([]), loading: false }
    renderCart()
    expect(within(panel()).getByText('Giỏ hàng đang trống')).toBeTruthy()
  })
})
