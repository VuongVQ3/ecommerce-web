// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductSummary } from '../lib/api'
import ProductCard from './ProductCard'

vi.mock('../cart/CartContext', () => ({ useCart: () => ({ addItem: vi.fn(), openDrawer: vi.fn() }) }))
vi.mock('./Toast', () => ({ useToast: () => vi.fn() }))

const base: ProductSummary = {
  id: 1,
  name: 'Hạnh nhân rang mộc',
  slug: 'hanh-nhan-rang-moc',
  price: 189_000,
  regularPrice: 189_000,
  discountPercent: null,
  promotionEndsAt: null,
  weightGrams: 500,
  imageUrl: null,
  calories: 579,
  protein: 21.2,
  stockStatus: { status: 'IN_STOCK', quantity: null },
  maxPurchasable: 10,
  category: { id: 1, name: 'Hạt dinh dưỡng', slug: 'hat-dinh-duong' },
}

const renderCard = (product: ProductSummary) =>
  render(
    <MemoryRouter>
      <ProductCard product={product} />
    </MemoryRouter>,
  )

afterEach(cleanup)

describe('ProductCard', () => {
  it('shows one price and no badge without a promotion', () => {
    const { container } = renderCard(base)
    expect(screen.getByText('189.000₫')).toBeTruthy()
    expect(container.querySelector('s')).toBeNull()
    expect(screen.queryByText(/-\d+%/)).toBeNull()
  })

  it('shows the sale price, the struck regular price and the badge during a promotion', () => {
    const { container } = renderCard({
      ...base,
      price: 132_000,
      discountPercent: 30,
      promotionEndsAt: '2026-10-31T17:00:00Z',
    })
    expect(screen.getByText('132.000₫')).toBeTruthy()
    const struck = container.querySelector('s')!
    expect(struck.textContent).toBe('Giá gốc 189.000₫')
    expect(within(struck).getByText('Giá gốc').className).toContain('sr-only')
    expect(screen.getByText('-30%')).toBeTruthy()
  })
})
