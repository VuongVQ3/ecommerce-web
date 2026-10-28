// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, type Page, type ProductDetail, type ProductSummary } from '../lib/api'
import ProductDetailPage from './ProductDetailPage'

vi.mock('../cart/CartContext', () => ({
  useCart: () => ({ view: null, addItem: vi.fn(), openDrawer: vi.fn(), count: 0, getQuantity: () => 0, setQuantity: vi.fn() }),
}))
vi.mock('../components/Toast', () => ({ useToast: () => vi.fn() }))

const CATEGORY = { id: 1, name: 'Hạt dinh dưỡng', slug: 'hat-dinh-duong' }

const detail = (over: Partial<ProductDetail> = {}): ProductDetail => ({
  id: 2,
  name: 'Mắc ca size 26–28 mm',
  slug: 'mac-ca-26-28',
  shortDescription: null,
  description: 'Mắc ca nguyên vỏ, hạt to, chắc.',
  origin: 'Đắk Lắk',
  price: 200_000,
  regularPrice: 200_000,
  discountPercent: null,
  promotionEndsAt: null,
  weightGrams: 500,
  active: true,
  stockStatus: { status: 'IN_STOCK', quantity: null },
  maxPurchasable: 10,
  imageUrl: null,
  images: [],
  nutritionPer100g: { calories: 450, protein: 13, fat: 20, carbs: 55, fiber: 9 },
  category: CATEGORY,
  ...over,
})

const summary = (id: number, name: string): ProductSummary => ({
  id,
  name,
  slug: `sp-${id}`,
  shortDescription: null,
  price: 100_000,
  regularPrice: 100_000,
  discountPercent: null,
  promotionEndsAt: null,
  weightGrams: 500,
  imageUrl: null,
  calories: null,
  protein: null,
  stockStatus: { status: 'IN_STOCK', quantity: null },
  maxPurchasable: 10,
  category: CATEGORY,
})

const page = (items: ProductSummary[]): Page<ProductSummary> => ({ items, page: 0, size: 5, totalItems: items.length, totalPages: 1 })

function renderPage(product: ProductDetail, sameCategory: ProductSummary[]) {
  vi.spyOn(api, 'product').mockResolvedValue(product)
  const products = vi.spyOn(api, 'products').mockResolvedValue(page(sameCategory))
  const router = createMemoryRouter([{ path: '/san-pham/:slug', element: <ProductDetailPage /> }], {
    initialEntries: [`/san-pham/${product.slug}`],
  })
  render(<RouterProvider router={router} />)
  return products
}

/** Document order, which is the reading order on one column */
const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ProductDetailPage', () => {
  it('puts the nutrition table after "Thêm vào giỏ hàng" and the promises, then up to four related products', async () => {
    const others = [summary(1, 'Mắc ca 22–25'), summary(3, 'Hạt điều'), summary(4, 'Óc chó'), summary(5, 'Hạnh nhân')]
    const products = renderPage(detail(), [others[0], summary(2, 'Mắc ca size 26–28 mm'), ...others.slice(1)])

    const addToCart = await screen.findByRole('button', { name: /Thêm vào giỏ/ })
    const promises = screen.getByRole('list', { name: 'Cam kết khi mua hàng' })
    const nutrition = screen.getByRole('heading', { name: 'Giá trị dinh dưỡng' })
    expect(before(addToCart, promises)).toBe(true)
    expect(before(promises, nutrition)).toBe(true)

    expect(within(promises).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Giao hàng toàn quốc', '/chinh-sach-van-chuyen'],
      ['Đổi trả', '/chinh-sach-doi-tra'],
      ['Thanh toán khi nhận hàng', '/chinh-sach-van-chuyen'],
    ])

    const related = await screen.findByRole('region', { name: 'Sản phẩm liên quan' })
    expect(products).toHaveBeenCalledWith({ category: 'hat-dinh-duong', size: 5 }, expect.any(AbortSignal))
    // The current product is left out
    expect(within(related).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Mắc ca 22–25',
      'Hạt điều',
      'Óc chó',
      'Hạnh nhân',
    ])
    expect(before(nutrition, related)).toBe(true)
  })

  it('no nutrition figures and nothing else in the category: neither section is there', async () => {
    renderPage(detail({ nutritionPer100g: null }), [summary(2, 'Mắc ca size 26–28 mm')])

    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('heading', { name: 'Giá trị dinh dưỡng' })).toBeNull()
    await waitFor(() => expect(api.products).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Sản phẩm liên quan' })).toBeNull()
  })
})
