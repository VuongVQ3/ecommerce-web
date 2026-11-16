// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, type CategoryListing, type Page, type ProductSummary } from '../lib/api'
import { shippingPromise, type Shipping } from '../lib/siteInfo'
import HomePage from './HomePage'

// /api/site: what the server charges for standard shipping (cart.shipping-fee / cart.free-shipping-threshold)
const site = vi.hoisted(() => ({ shipping: { fee: 30_000, freeThreshold: 199_000 } as Shipping | undefined }))
vi.mock('../lib/siteInfo', async (importActual) => {
  const actual = await importActual<typeof import('../lib/siteInfo')>()
  return {
    ...actual,
    useSiteInfo: () => ({ siteUrl: '', business: {}, shipping: site.shipping }),
    // The real hook calls the module's own useSiteInfo, which the line above does not replace
    useShippingPromise: () => (site.shipping ? actual.shippingPromise(site.shipping) : null),
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderHome() {
  vi.spyOn(api, 'categories').mockResolvedValue([{ id: 1, name: 'Hạt dinh dưỡng', slug: 'hat-dinh-duong', productCount: 25 } as CategoryListing])
  vi.spyOn(api, 'products').mockResolvedValue({ items: [], page: 0, size: 48, totalItems: 25, totalPages: 1 } as Page<ProductSummary>)
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

describe('HomePage shipping promise', () => {
  it('promises free shipping from the threshold the server charges, never the old wording', async () => {
    const { container } = renderHome()
    expect(await screen.findByText('25 sản phẩm · Miễn phí giao hàng cho đơn từ 199.000₫')).toBeTruthy()
    // The statistics tile is a word, not a counted number
    expect(await screen.findByText('Freeship')).toBeTruthy()
    expect(screen.getByText('cho đơn từ 199.000₫')).toBeTruthy()
    expect(screen.getByText('Miễn phí giao hàng cho đơn từ 199.000₫. Đóng gói 500 g, giao tận nơi toàn quốc.')).toBeTruthy()
    expect(container.textContent).not.toMatch(/500\.000|mọi đơn|Miễn phí giao hàng toàn quốc/)
  })

  it('before /api/site answers, promises nothing it cannot back', async () => {
    site.shipping = undefined
    try {
      const { container } = renderHome()
      // The hero line (a category card says "25 sản phẩm" too)
      expect((await screen.findAllByText('25 sản phẩm')).some((el) => el.tagName === 'P')).toBe(true)
      expect(container.textContent).not.toMatch(/Freeship|Miễn phí/)
    } finally {
      site.shipping = { fee: 30_000, freeThreshold: 199_000 }
    }
  })
})

describe('shippingPromise', () => {
  it('follows the server setting', () => {
    expect(shippingPromise({ fee: 0, freeThreshold: 0 }).short).toBe('Miễn phí giao hàng toàn quốc')
    expect(shippingPromise({ fee: 30_000, freeThreshold: 250_000 }).short).toBe('Miễn phí giao hàng cho đơn từ 250.000₫')
    expect(shippingPromise({ fee: 30_000, freeThreshold: 0 }).short).toBe('Giao hàng toàn quốc, phí 30.000₫')
  })
})
