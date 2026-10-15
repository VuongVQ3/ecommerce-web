// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { api, type Page, type ProductSummary } from '../lib/api'
import ProductsPage from './ProductsPage'

vi.mock('../cart/CartContext', () => ({ useCart: () => ({ addItem: vi.fn(), openDrawer: vi.fn(), getQuantity: () => 0, setQuantity: vi.fn() }) }))
vi.mock('../components/Toast', () => ({ useToast: () => vi.fn() }))

const product = (id: number, name: string, slug: string): ProductSummary => ({
  id,
  name,
  slug,
  price: 189_000,
  regularPrice: 189_000,
  discountPercent: null,
  promotionEndsAt: null,
  weightGrams: 500,
  imageUrl: null,
  calories: 579,
  protein: 21,
  stockStatus: { status: 'IN_STOCK', quantity: null },
  maxPurchasable: 10,
  category: { id: 1, name: 'Hạt dinh dưỡng', slug: 'hat-dinh-duong' },
})

const page = (items: ProductSummary[]): Page<ProductSummary> => ({ items, page: 0, size: 12, totalItems: items.length, totalPages: 1 })

function Where() {
  const location = useLocation()
  return <p data-testid="detail">{location.pathname}</p>
}

beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ProductsPage', () => {
  it('keeps the sort when switching category, and comes back to the same category instantly', async () => {
    vi.spyOn(api, 'categories').mockResolvedValue([
      { id: 1, name: 'Hạt dinh dưỡng', slug: 'hat-dinh-duong' },
      { id: 2, name: 'Hạt siêu thực phẩm', slug: 'hat-sieu-thuc-pham' },
    ])
    const products = vi.spyOn(api, 'products').mockImplementation(async (query) =>
      query.category === 'hat-dinh-duong' ? page([product(1, 'Hạnh nhân rang mộc', 'hanh-nhan')]) : page([product(2, 'Hạt chia Úc', 'hat-chia')]),
    )
    const router = createMemoryRouter(
      [
        { path: '/san-pham', element: <ProductsPage /> },
        { path: '/danh-muc/:slug', element: <ProductsPage /> },
        { path: '/san-pham/:slug', element: <Where /> },
      ],
      { initialEntries: ['/san-pham?sort=price_asc'] },
    )
    render(<RouterProvider router={router} />)
    await screen.findByText('Hạt chia Úc')

    const nav = screen.getAllByRole('navigation', { name: 'Danh mục sản phẩm' })[0]
    fireEvent.click(within(nav).getByRole('link', { name: 'Hạt dinh dưỡng' }))
    await screen.findByText('Hạnh nhân rang mộc')
    expect(router.state.location.pathname + router.state.location.search).toBe('/danh-muc/hat-dinh-duong?sort=price_asc')
    expect(products).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'hat-dinh-duong', sort: 'price_asc' }), expect.anything())
    expect(within(nav).getByRole('link', { name: 'Hạt dinh dưỡng' }).getAttribute('aria-current')).toBe('page')

    // Open a product, then go Back: same category and sort, list shown without waiting
    fireEvent.click(screen.getByRole('link', { name: 'Hạnh nhân rang mộc' }))
    expect((await screen.findByTestId('detail')).textContent).toBe('/san-pham/hanh-nhan')
    products.mockImplementation(() => new Promise(() => {})) // the network is slow now
    await act(() => router.navigate(-1))
    expect(router.state.location.pathname + router.state.location.search).toBe('/danh-muc/hat-dinh-duong?sort=price_asc')
    expect(screen.getByText('Hạnh nhân rang mộc')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
