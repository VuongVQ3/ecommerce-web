// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddToCartControl } from './ProductInfo'

const inCart = vi.hoisted(() => ({ n: 0 }))
vi.mock('../cart/CartContext', () => ({
  useCart: () => ({ addItem: vi.fn(), openDrawer: vi.fn(), getQuantity: () => inCart.n }),
}))
vi.mock('./Toast', () => ({ useToast: () => vi.fn() }))

afterEach(() => {
  cleanup()
  inCart.n = 0
})

const product = { id: 1, name: 'Granola', active: true, maxPurchasable: 10, stockStatus: { status: 'IN_STOCK' as const } }

function renderControl() {
  render(
    <MemoryRouter>
      <AddToCartControl product={product as never} />
    </MemoryRouter>,
  )
}

describe('AddToCartControl', () => {
  it('says how many are already in the cart and caps the picker at what is left', () => {
    inCart.n = 7
    renderControl()
    expect(screen.getByText('✓ Đã có 7 trong giỏ')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Xem giỏ hàng' }).getAttribute('href')).toBe('/gio-hang')
    expect(screen.getByRole('spinbutton').getAttribute('aria-valuemax') ?? screen.getByRole('spinbutton').getAttribute('max')).toBe('3')
  })

  it('turns the button into "Đã đạt số lượng tối đa" when the cart holds the maximum', () => {
    inCart.n = 10
    renderControl()
    expect((screen.getByRole('button', { name: 'Đã đạt số lượng tối đa' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows nothing extra when the product is not in the cart', () => {
    renderControl()
    expect(screen.queryByText(/Đã có/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Thêm vào giỏ hàng' })).toBeTruthy()
  })
})
