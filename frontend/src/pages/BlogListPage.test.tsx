// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { blogApi, type BlogCard } from '../lib/blogApi'
import BlogListPage from './BlogListPage'

const card = (id: number): BlogCard => ({
  id,
  title: `Bài số ${id}`,
  slug: `bai-${id}`,
  excerpt: `Tóm tắt bài ${id}.`,
  coverImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/blog/a.jpg',
  coverImageAlt: `Ảnh bài ${id}`,
  publishedAt: '2026-11-01T03:00:00Z',
  readingMinutes: 3,
})

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter([{ path: '/blog', element: <BlogListPage /> }], { initialEntries: [path] })} />)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BlogListPage', () => {
  it('lists posts as cards with cover, title, excerpt, date and reading time', async () => {
    const list = vi.spyOn(blogApi, 'list').mockResolvedValue({ items: [card(1), card(2)], page: 0, size: 12, totalItems: 2, totalPages: 1 })
    renderAt('/blog')

    expect(screen.getByRole('heading', { level: 1, name: 'Blog' })).toBeTruthy()
    const first = await screen.findByRole('link', { name: /Bài số 1/ })
    expect(first.getAttribute('href')).toBe('/blog/bai-1')
    expect(within(first).getByRole('img', { name: 'Ảnh bài 1' }).getAttribute('loading')).toBe('lazy')
    expect(within(first).getByText('Tóm tắt bài 1.')).toBeTruthy()
    expect(within(first).getByText('01/11/2026')).toBeTruthy()
    expect(within(first).getByText('3 phút đọc')).toBeTruthy()
    expect(list).toHaveBeenCalledWith(0, 12, expect.anything())
    expect(screen.queryByRole('navigation', { name: 'Phân trang' })).toBeNull()
  })

  it('reads the page from ?page= and links the other pages', async () => {
    const list = vi.spyOn(blogApi, 'list').mockResolvedValue({ items: [card(13)], page: 1, size: 12, totalItems: 13, totalPages: 2 })
    renderAt('/blog?page=2')
    const pager = await screen.findByRole('navigation', { name: 'Phân trang' })
    expect(list).toHaveBeenCalledWith(1, 12, expect.anything())
    expect(within(pager).getByRole('link', { name: '1' }).getAttribute('href')).toBe('/blog')
  })

  it('says so when there is nothing yet', async () => {
    vi.spyOn(blogApi, 'list').mockResolvedValue({ items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 })
    renderAt('/blog')
    expect(await screen.findByText(/Chưa có bài viết nào/)).toBeTruthy()
  })
})
