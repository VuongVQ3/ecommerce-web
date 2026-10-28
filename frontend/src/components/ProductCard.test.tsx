// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductSummary } from '../lib/api'
import ProductCard from './ProductCard'

vi.mock('../cart/CartContext', () => ({ useCart: () => ({ addItem: vi.fn(), openDrawer: vi.fn(), getQuantity: () => 0, setQuantity: vi.fn() }) }))
vi.mock('./Toast', () => ({ useToast: () => vi.fn() }))

const base: ProductSummary = {
  id: 1,
  name: 'Hạnh nhân rang mộc',
  slug: 'hanh-nhan-rang-moc',
  shortDescription: null,
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

  it('shows the nutrition in short English as a two-colour pill on phones and as two chips from sm, rounded', () => {
    // Older figures may still have decimals: shown as whole numbers
    renderCard({ ...base, protein: 20.5, calories: 584.6 })
    const [pill, proteinChip] = screen.getAllByTitle('Protein 21g · 585 kcal / 100g')
    expect(pill.lang).toBe('en')
    // One line of fixed height, never wider than the card
    for (const c of ['flex', 'h-5', 'max-w-full', 'whitespace-nowrap', 'sm:hidden']) expect(pill.className.split(' ')).toContain(c)
    const [protein, comma, kcal] = pill.children
    // Protein half: the protein chip's colours, rounded on the left, the one cut with an ellipsis when too long
    expect(protein.textContent).toBe('Protein 21g')
    for (const c of ['bg-brand-50', 'text-brand-700', 'rounded-l-full', 'min-w-0', 'truncate']) {
      expect(protein.className.split(' ')).toContain(c)
    }
    // Kcal half: the kcal chip's colours, rounded on the right, always shown in full
    expect(kcal.textContent).toBe('585 kcal')
    for (const c of ['bg-nut-light', 'text-nut', 'rounded-r-full', 'shrink-0']) expect(kcal.className.split(' ')).toContain(c)
    // No dot; screen readers hear "Protein 21g, 585 kcal"
    expect(comma.className).toBe('sr-only')
    expect(pill.textContent).toBe('Protein 21g, 585 kcal')

    const chips = proteinChip.parentElement!
    expect(chips.className).toContain('max-sm:hidden')
    expect([...chips.children].map((c) => c.textContent)).toEqual(['Protein 21g', '585 kcal'])
    expect(screen.queryByText(/đạm/)).toBeNull()
  })

  it('shows no nutrition facts while the figures are not known, but keeps the line on phones', () => {
    const { container } = renderCard({ ...base, name: 'Mật ong hoa cà phê', calories: null, protein: null })
    expect(screen.queryByText(/kcal/)).toBeNull()
    expect(screen.queryByText(/protein|đạm/i)).toBeNull()
    expect(screen.getByText('/ 500g')).toBeTruthy()
    // An empty line as tall as the chip, so prices and buttons line up with cards that have the facts
    const spacer = container.querySelector('h3 + div')!
    expect(spacer.getAttribute('aria-hidden')).toBe('true')
    expect(spacer.className).toBe('h-5 sm:hidden')
  })
})
