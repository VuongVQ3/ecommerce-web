// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { api, type CartLineInput, type CartView } from '../lib/api'
import CardCartControl from './CardCartControl'
import { CartProvider, useCart } from './CartContext'
import { GUEST_CART_KEY } from './cartStorage'

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }))

function viewOf(items: CartLineInput[]): CartView {
  const lines = items.map((i) => ({
    productId: i.productId, name: 'Granola', slug: 'granola', imageUrl: null, categorySlug: null, weightGrams: 500,
    price: 100_000, regularPrice: null, priceAtAdd: null, quantity: i.quantity, requestedQuantity: i.quantity,
    maxPurchasable: 3, lineTotal: 100_000 * i.quantity, status: 'OK' as const,
  }))
  return {
    items: lines, totalQuantity: lines.reduce((s, l) => s + l.quantity, 0), subtotal: 0, discountTotal: 0, shippingFee: 0,
    amountToFreeShipping: 0, freeShippingThreshold: 0, total: 0, canCheckout: true,
  }
}

function Badge() {
  return <output data-testid="badge">{useCart().count}</output>
}

const granola = { id: 7, name: 'Granola', maxPurchasable: 3 }

function renderCard(product = granola) {
  return render(
    <ToastProvider>
      <CartProvider>
        <CardCartControl product={product} />
        <Badge />
      </CartProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(api, 'cartValidate').mockImplementation(async (items) => viewOf(items))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CardCartControl', () => {
  it('turns the add button into − n trong giỏ +, synced with the badge, capped at maxPurchasable', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào giỏ' }))
    expect(await screen.findByText('1 Granola trong giỏ hàng')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Thêm vào giỏ' })).toBeNull()

    const plus = screen.getByRole('button', { name: 'Thêm 1 Granola' }) as HTMLButtonElement
    fireEvent.click(plus)
    await screen.findByText('2 Granola trong giỏ hàng')
    fireEvent.click(plus)
    await screen.findByText('3 Granola trong giỏ hàng')
    expect(screen.getByTestId('badge').textContent).toBe('3')
    expect(plus.disabled).toBe(true)
    expect(plus.title).toBe('Tối đa 3 sản phẩm')
    // Only the first add announces itself
    expect(screen.getAllByText(/^Đã thêm Granola/)).toHaveLength(1)
  })

  it('removes at 0 and "Hoàn tác" restores the previous quantity', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào giỏ' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Bớt 1 Granola' }))

    expect(await screen.findByRole('button', { name: 'Thêm vào giỏ' })).toBeTruthy()
    expect(screen.getByText('Đã xoá Granola khỏi giỏ')).toBeTruthy()
    expect(screen.getByTestId('badge').textContent).toBe('0')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }))
    })
    await waitFor(() => expect(screen.getByTestId('badge').textContent).toBe('1'))
    expect(screen.getByText('1 Granola trong giỏ hàng')).toBeTruthy()
  })

  it('explains a disabled + for sold-out products', async () => {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify({ mergeKey: 'k', items: [{ productId: 7, quantity: 1 }] }))
    renderCard({ ...granola, maxPurchasable: 0 })
    const plus = (await screen.findByRole('button', { name: 'Thêm 1 Granola' })) as HTMLButtonElement
    expect(plus.disabled).toBe(true)
    expect(plus.title).toBe('Đã hết hàng')
  })
})
