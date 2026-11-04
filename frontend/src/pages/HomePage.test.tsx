// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, type CategoryListing, type Page, type ProductSummary } from '../lib/api'
import HomePage from './HomePage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('HomePage shipping promise', () => {
  it('promises free shipping on every order, with no threshold left anywhere', async () => {
    vi.spyOn(api, 'categories').mockResolvedValue([{ id: 1, name: 'Hạt dinh dưỡng', slug: 'hat-dinh-duong', productCount: 25 } as CategoryListing])
    vi.spyOn(api, 'products').mockResolvedValue({ items: [], page: 0, size: 48, totalItems: 25, totalPages: 1 } as Page<ProductSummary>)
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('25 sản phẩm · Miễn phí giao hàng toàn quốc')).toBeTruthy()
    // The statistics tile is a word, not a counted number
    expect(await screen.findByText('Freeship')).toBeTruthy()
    expect(screen.getByText('mọi đơn hàng toàn quốc')).toBeTruthy()
    expect(screen.getByText('Miễn phí giao hàng toàn quốc cho mọi đơn. Đóng gói 500 g, giao tận nơi.')).toBeTruthy()
    expect(container.textContent).not.toMatch(/500\.000|500K|miễn phí ship/)
  })
})
