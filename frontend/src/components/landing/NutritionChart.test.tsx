// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProductSummary } from '../../lib/api'
import { NutritionTable } from '../ProductInfo'
import NutritionChart from './NutritionChart'

const product = (id: number, protein: number | null, calories: number | null): ProductSummary => ({
  id,
  name: `Sản phẩm ${id}`,
  slug: `san-pham-${id}`,
  price: 150_000,
  regularPrice: 150_000,
  discountPercent: null,
  promotionEndsAt: null,
  weightGrams: 500,
  imageUrl: null,
  calories,
  protein,
  stockStatus: { status: 'IN_STOCK', quantity: null },
  maxPurchasable: 10,
  category: { id: 1, name: 'Hạt dinh dưỡng', slug: 'hat-dinh-duong' },
})

const renderChart = (products: ProductSummary[]) =>
  render(
    <MemoryRouter>
      <NutritionChart products={products} />
    </MemoryRouter>,
  )

afterEach(cleanup)

describe('NutritionChart', () => {
  it('renders nothing with fewer than 3 products that have figures', () => {
    const { container } = renderChart([product(1, 20, 550), product(2, 18, 600), product(3, null, null), product(4, null, null)])
    expect(container.innerHTML).toBe('')
  })

  it('compares only the products that have figures', () => {
    renderChart([product(1, 20, 550), product(2, 18, 600), product(3, 9, 300), product(4, null, null)])
    expect(screen.getByText('Sản phẩm 1')).toBeTruthy()
    expect(screen.getByText('Sản phẩm 3')).toBeTruthy()
    expect(screen.queryByText('Sản phẩm 4')).toBeNull()
  })
})

describe('NutritionTable', () => {
  it('is left out entirely while the figures are not known (product page and quick view)', () => {
    const { container } = render(<NutritionTable nutrition={null} serving />)
    expect(container.innerHTML).toBe('')
    render(<NutritionTable nutrition={{ calories: 579, protein: 21.2, fat: 49.9, carbs: 21.6, fiber: 12.5 }} />)
    expect(screen.getByText('Giá trị dinh dưỡng')).toBeTruthy()
  })
})
