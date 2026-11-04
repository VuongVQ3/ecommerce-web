// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ProductSummary } from '../lib/api'
import { blogApi, type BlogPostDetail } from '../lib/blogApi'
import { resetInitialData } from '../lib/initialData'
import BlogPostPage, { BLOG_DISCLAIMER } from './BlogPostPage'

vi.mock('../cart/CartContext', () => ({
  useCart: () => ({ view: null, addItem: vi.fn(), openDrawer: vi.fn(), count: 0, getQuantity: () => 0, setQuantity: vi.fn() }),
}))
vi.mock('../components/Toast', () => ({ useToast: () => vi.fn() }))

const product: ProductSummary = {
  id: 7,
  name: 'Mắc ca nứt vỏ',
  slug: 'mac-ca-nut-vo',
  shortDescription: null,
  price: 189_000,
  regularPrice: 189_000,
  discountPercent: null,
  promotionEndsAt: null,
  weightGrams: 500,
  imageUrl: null,
  calories: null,
  protein: null,
  stockStatus: { status: 'IN_STOCK', quantity: null },
  maxPurchasable: 10,
  category: { id: 1, name: 'Hạt dinh dưỡng', slug: 'hat-dinh-duong' },
}

const post = (over: Partial<BlogPostDetail> = {}): BlogPostDetail => ({
  id: 1,
  title: 'Ăn mắc ca thế nào cho đúng',
  slug: 'an-mac-ca',
  excerpt: 'Mẹo chọn và ăn mắc ca.',
  contentHtml: '<h2>Chọn hạt</h2><p>Đoạn văn với <a href="/san-pham/mac-ca-nut-vo">link nội bộ</a>.</p>',
  coverImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/blog/a.jpg',
  coverImageAlt: 'Hũ mắc ca',
  coverWidth: 1600,
  coverHeight: 900,
  publishedAt: '2026-11-01T03:00:00Z',
  updatedAt: '2026-11-02T03:00:00Z',
  readingMinutes: 4,
  products: [product],
  latest: [
    { id: 2, title: 'Bảo quản hạt', slug: 'bao-quan-hat', excerpt: 'Giữ hạt giòn lâu.', coverImageUrl: null, coverImageAlt: null, publishedAt: '2026-10-20T03:00:00Z', readingMinutes: 2 },
  ],
  ...over,
})

function embed(data: unknown) {
  const script = document.createElement('script')
  script.type = 'application/json'
  script.id = 'initial-data'
  script.textContent = JSON.stringify(data)
  document.head.appendChild(script)
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/blog/:slug', element: <BlogPostPage /> },
      { path: '/san-pham/:slug', element: <p>Trang sản phẩm</p> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.getElementById('initial-data')?.remove()
  resetInitialData()
})

describe('BlogPostPage', () => {
  it('starts from the data the server embedded, without calling the API', () => {
    embed({ type: 'blogPost', slug: 'an-mac-ca', data: post() })
    const load = vi.spyOn(blogApi, 'post')
    renderAt('/blog/an-mac-ca')

    // Already there on the first render: nothing to wait for
    expect(screen.getByRole('heading', { level: 1, name: 'Ăn mắc ca thế nào cho đúng' })).toBeTruthy()
    expect(load).not.toHaveBeenCalled()
    const cover = screen.getByRole('img', { name: 'Hũ mắc ca' })
    expect(cover.getAttribute('fetchpriority')).toBe('high')
    expect(cover.getAttribute('loading')).toBeNull()
    expect(screen.getByText('4 phút đọc')).toBeTruthy()
    expect(screen.getByText('01/11/2026')).toBeTruthy()
  })

  it('ignores embedded data for another post and loads this one', async () => {
    embed({ type: 'blogPost', slug: 'bai-khac', data: post({ slug: 'bai-khac', title: 'Bài khác' }) })
    const load = vi.spyOn(blogApi, 'post').mockResolvedValue(post())
    renderAt('/blog/an-mac-ca')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ăn mắc ca thế nào cho đúng' })).toBeTruthy()
    expect(load).toHaveBeenCalledWith('an-mac-ca', expect.anything())
  })

  it('shows the products of the post, the disclaimer, share buttons and newer posts', async () => {
    vi.spyOn(blogApi, 'post').mockResolvedValue(post())
    renderAt('/blog/an-mac-ca')

    const products = await screen.findByRole('region', { name: 'Sản phẩm trong bài' })
    expect(within(products).getByRole('article', { name: 'Mắc ca nứt vỏ' })).toBeTruthy()
    expect(within(products).getByRole('button', { name: /Thêm .*vào giỏ/ })).toBeTruthy()

    const note = screen.getByRole('complementary', { name: 'Lưu ý' })
    expect(note.textContent).toContain(BLOG_DISCLAIMER)
    expect(BLOG_DISCLAIMER).toContain('không thay thế tư vấn của bác sĩ hay chuyên gia dinh dưỡng')

    expect(screen.getByRole('link', { name: 'Facebook' }).getAttribute('href')).toContain(encodeURIComponent('/blog/an-mac-ca'))
    expect(screen.getByRole('button', { name: 'Zalo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sao chép link' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Bảo quản hạt/ }).getAttribute('href')).toBe('/blog/bao-quan-hat')
  })

  it('opens links to the site inside the post without reloading', async () => {
    vi.spyOn(blogApi, 'post').mockResolvedValue(post())
    const router = renderAt('/blog/an-mac-ca')
    ;(await screen.findByRole('link', { name: 'link nội bộ' })).click()
    expect(router.state.location.pathname).toBe('/san-pham/mac-ca-nut-vo')
  })

  it('shows the not-found page for a draft or unknown post', async () => {
    vi.spyOn(blogApi, 'post').mockRejectedValue(new ApiError('Không tìm thấy bài viết', 404, {}, 'BLOG_POST_NOT_FOUND'))
    renderAt('/blog/nhap')
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeTruthy()
  })

  it('moves to the current address of a renamed post', async () => {
    vi.spyOn(blogApi, 'post').mockResolvedValue({ ...post(), redirectTo: 'an-mac-ca' })
    const router = renderAt('/blog/ten-cu')
    await screen.findByRole('heading', { level: 1 })
    expect(router.state.location.pathname).toBe('/blog/an-mac-ca')
  })
})
