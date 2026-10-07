// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { api, type CartLineInput, type CartView, type User } from '../lib/api'
import { CartProvider, useCart } from './CartContext'
import { GUEST_CART_KEY } from './cartStorage'

const auth = vi.hoisted(() => ({ current: { user: null as User | null, loading: false } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth.current }))

const PRICE = 100_000
const user: User = { id: 'u1', email: 'an@example.com', fullName: 'An', phone: null, role: 'CUSTOMER' }
const almonds = { id: 1, name: 'Hạnh nhân', maxPurchasable: 10 }
const walnuts = { id: 2, name: 'Óc chó', maxPurchasable: 3 }

/** What the server would answer for these lines (one fixed price, everything OK). */
function viewOf(items: CartLineInput[]): CartView {
  const lines = items.map((i) => ({
    productId: i.productId,
    name: `SP ${i.productId}`,
    slug: `sp-${i.productId}`,
    imageUrl: null,
    categorySlug: 'hat-dinh-duong',
    weightGrams: 500,
    price: PRICE,
    priceAtAdd: null,
    quantity: i.quantity,
    requestedQuantity: i.quantity,
    maxPurchasable: 10,
    lineTotal: PRICE * i.quantity,
    status: 'OK' as const,
  }))
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
  return {
    items: lines,
    totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    shippingFee: 0,
    amountToFreeShipping: 0,
    freeShippingThreshold: 500_000,
    total: subtotal,
    canCheckout: lines.length > 0,
  }
}

function renderCart() {
  const cart: { current: ReturnType<typeof useCart> | null } = { current: null }
  function Probe() {
    const value = useCart()
    useEffect(() => {
      cart.current = value
    })
    return null
  }
  const tree = () => (
    <ToastProvider>
      <CartProvider>
        <Probe />
      </CartProvider>
    </ToastProvider>
  )
  const utils = render(tree())
  return { cart, rerender: () => utils.rerender(tree()) }
}

const stored = () => JSON.parse(localStorage.getItem(GUEST_CART_KEY) ?? 'null')

beforeEach(() => {
  localStorage.clear()
  auth.current = { user: null, loading: false }
  vi.spyOn(api, 'cartValidate').mockImplementation(async (items) => viewOf(items))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useCart as a guest', () => {
  it('stores only ids and quantities locally and prices through /validate', async () => {
    const { cart } = renderCart()

    await act(() => cart.current!.addItem(almonds, 2))
    await act(() => cart.current!.addItem(walnuts))
    await act(() => cart.current!.addItem(almonds))

    expect(stored().items).toEqual([
      { productId: 2, quantity: 1 },
      { productId: 1, quantity: 3 },
    ])
    expect(JSON.stringify(stored())).not.toMatch(/price|total|name/i)
    expect(cart.current!.count).toBe(4)
    expect(cart.current!.view?.subtotal).toBe(4 * PRICE)
    expect(api.cartValidate).toHaveBeenLastCalledWith(stored().items)
  })

  it('caps at what can be bought and reports it', async () => {
    const { cart } = renderCart()

    const result = await act(() => cart.current!.addItem(walnuts, 5))

    expect(result.warning).toBe('Chỉ còn 3 sản phẩm')
    expect(stored().items).toEqual([{ productId: 2, quantity: 3 }])
  })

  it('picks up changes made in another tab', async () => {
    const { cart } = renderCart()
    await waitFor(() => expect(cart.current!.loading).toBe(false))

    const items = [{ productId: 1, quantity: 4 }]
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify({ mergeKey: 'other-tab', items }))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: GUEST_CART_KEY }))
    })

    await waitFor(() => expect(cart.current!.count).toBe(4))
    await waitFor(() => expect(cart.current!.view?.items).toHaveLength(1))
  })
})

describe('useCart when signed in', () => {
  it('uses the server cart and never touches localStorage', async () => {
    auth.current = { user, loading: false }
    vi.spyOn(api, 'cart').mockResolvedValue(viewOf([]))
    const add = vi.spyOn(api, 'cartAdd').mockResolvedValue({ cart: viewOf([{ productId: 1, quantity: 2 }]), warning: null })
    const { cart } = renderCart()
    await waitFor(() => expect(api.cart).toHaveBeenCalled())

    await act(() => cart.current!.addItem(almonds, 2))

    expect(add).toHaveBeenCalledWith(1, 2)
    expect(cart.current!.count).toBe(2)
    expect(localStorage.getItem(GUEST_CART_KEY)).toBeNull()
  })

  it('rolls back the optimistic badge when the server refuses', async () => {
    auth.current = { user, loading: false }
    vi.spyOn(api, 'cart').mockResolvedValue(viewOf([]))
    vi.spyOn(api, 'cartAdd').mockRejectedValue(new Error('Sản phẩm "Óc chó" đã hết hàng'))
    const { cart } = renderCart()
    await waitFor(() => expect(cart.current!.loading).toBe(false))

    await act(async () => {
      await expect(cart.current!.addItem(walnuts)).rejects.toThrow('đã hết hàng')
    })
    expect(cart.current!.count).toBe(0)
  })
})

describe('signing in with a guest cart', () => {
  it('merges the guest items into the account cart and then clears localStorage', async () => {
    const { cart, rerender } = renderCart()
    await act(() => cart.current!.addItem(almonds, 2))
    await act(() => cart.current!.addItem(walnuts, 1))
    const guest = stored()

    const merge = vi
      .spyOn(api, 'cartMerge')
      .mockImplementation(async (_key, items) => ({ cart: viewOf(items), skipped: [], alreadyMerged: false }))
    vi.spyOn(api, 'cart').mockResolvedValue(viewOf([]))
    auth.current = { user, loading: false }
    rerender()

    await waitFor(() => expect(merge).toHaveBeenCalledWith(guest.mergeKey, guest.items))
    await waitFor(() => expect(localStorage.getItem(GUEST_CART_KEY)).toBeNull())
    expect(cart.current!.mode).toBe('user')
    expect(cart.current!.lines.map((l) => [l.productId, l.quantity])).toEqual([
      [1, 2],
      [2, 1],
    ])
    expect(cart.current!.count).toBe(3)
  })

  it('keeps the guest cart when the merge fails, so nothing is lost', async () => {
    const { cart, rerender } = renderCart()
    await act(() => cart.current!.addItem(almonds, 2))
    const before = stored()

    vi.spyOn(api, 'cartMerge').mockRejectedValue(new Error('network'))
    vi.spyOn(api, 'cart').mockResolvedValue(viewOf([]))
    auth.current = { user, loading: false }
    rerender()

    await waitFor(() => expect(api.cart).toHaveBeenCalled())
    expect(stored()).toEqual(before)
  })
})
