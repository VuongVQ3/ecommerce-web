// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminBlogApi, type AdminBlogPost } from '../lib/adminBlogApi'
import BlogFormPage from './BlogFormPage'
import MarkdownEditor from './MarkdownEditor'

vi.mock('../components/Toast', () => ({ useToast: () => vi.fn() }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  vi.spyOn(adminBlogApi, 'preview').mockResolvedValue({ html: '<p>xem trước</p>', readingMinutes: 1 })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const IMAGE_URL = 'https://res.cloudinary.com/demo/image/upload/v1/hat-lanh/blog/anh.png'
const png = () => new File(['png'], 'anh.png', { type: 'image/png' })

const draft = (over: Partial<AdminBlogPost> = {}): AdminBlogPost => ({
  id: 5,
  title: 'Ăn hạt mỗi ngày',
  slug: 'an-hat-moi-ngay',
  excerpt: 'Ăn hạt mỗi ngày thế nào cho đủ chất.',
  content: 'Nội dung bài.',
  coverImageUrl: null,
  coverImageAlt: null,
  status: 'DRAFT',
  publishedAt: null,
  createdAt: '2026-11-01T03:00:00Z',
  updatedAt: '2026-11-01T03:00:00Z',
  images: [],
  products: [],
  ...over,
})

describe('MarkdownEditor image insertion', () => {
  function Editor({ initial, upload }: { initial: string; upload: (f: File) => Promise<{ url: string; id: string }> }) {
    const [value, setValue] = useState(initial)
    return <MarkdownEditor value={value} onChange={setValue} uploadImage={upload} />
  }

  it('uploads the chosen file, asks for alt text and inserts the image where the cursor was', async () => {
    const upload = vi.fn().mockResolvedValue({ url: IMAGE_URL, id: 'img-1' })
    render(<Editor initial="Đoạn một.Đoạn hai." upload={upload} />)
    const area = screen.getByLabelText('Nội dung') as HTMLTextAreaElement
    area.focus()
    area.setSelectionRange(9, 9)

    fireEvent.change(screen.getByTestId('editor-image-input'), { target: { files: [png()] } })
    expect(upload).toHaveBeenCalledTimes(1)

    // Alt text is required
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Chèn ảnh' }))
    expect(await screen.findByText(/Vui lòng nhập mô tả ảnh \(alt\)/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Mô tả ảnh \(alt\)/), { target: { value: 'Hũ hạt mắc ca' } })
    fireEvent.change(screen.getByLabelText(/Chú thích/), { target: { value: 'Mắc ca Đắk Lắk' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Chèn ảnh' }))

    await waitFor(() =>
      expect(area.value).toBe(`Đoạn một.\n\n![Hũ hạt mắc ca](${IMAGE_URL} "Mắc ca Đắk Lắk")\n\nĐoạn hai.`),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('takes an image pasted from the clipboard and refuses other file types', async () => {
    const upload = vi.fn().mockResolvedValue({ url: IMAGE_URL, id: 'img-1' })
    render(<Editor initial="" upload={upload} />)
    const area = screen.getByLabelText('Nội dung')

    fireEvent.paste(area, { clipboardData: { files: [new File(['gif'], 'a.gif', { type: 'image/gif' })] } })
    expect(await screen.findByText('Chỉ nhận ảnh JPEG, PNG hoặc WebP.')).toBeTruthy()
    expect(upload).not.toHaveBeenCalled()

    fireEvent.paste(area, { clipboardData: { files: [png()] } })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('shows the preview rendered by the server', async () => {
    render(<Editor initial="**x**" upload={vi.fn()} />)
    expect(await screen.findByText('xem trước', {}, { timeout: 2000 })).toBeTruthy()
    expect(adminBlogApi.preview).toHaveBeenCalledWith('**x**', expect.anything())
  })
})

describe('BlogFormPage', () => {
  function renderAt(path: string) {
    const router = createMemoryRouter(
      [
        { path: '/admin/blog/moi', element: <BlogFormPage /> },
        { path: '/admin/blog/:id', element: <BlogFormPage /> },
      ],
      { initialEntries: [path] },
    )
    render(<RouterProvider router={router} />)
    return router
  }

  it('does not publish without a cover, and says what is missing', async () => {
    vi.spyOn(adminBlogApi, 'get').mockResolvedValue(draft())
    const setStatus = vi.spyOn(adminBlogApi, 'setStatus')
    renderAt('/admin/blog/5')

    fireEvent.click(await screen.findByRole('button', { name: 'Đăng' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Chưa có ảnh bìa.')
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('does not publish a cover without alt text', async () => {
    vi.spyOn(adminBlogApi, 'get').mockResolvedValue(draft({ coverImageUrl: IMAGE_URL, coverImageAlt: '' }))
    const setStatus = vi.spyOn(adminBlogApi, 'setStatus')
    renderAt('/admin/blog/5')

    fireEvent.click(await screen.findByRole('button', { name: 'Đăng' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Ảnh bìa chưa có mô tả (alt).')
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('publishes a complete post', async () => {
    const ready = draft({ coverImageUrl: IMAGE_URL, coverImageAlt: 'Hũ hạt' })
    vi.spyOn(adminBlogApi, 'get').mockResolvedValue(ready)
    const setStatus = vi.spyOn(adminBlogApi, 'setStatus').mockResolvedValue({ ...ready, status: 'PUBLISHED', publishedAt: '2026-11-04T03:00:00Z' })
    renderAt('/admin/blog/5')

    fireEvent.click(await screen.findByRole('button', { name: 'Đăng' }))
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(5, 'PUBLISHED'))
    expect(await screen.findByRole('button', { name: 'Gỡ bài' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Xem bài/ }).getAttribute('href')).toBe('/blog/an-hat-moi-ngay')
  })

  it('warns, without blocking, about health claims', async () => {
    vi.spyOn(adminBlogApi, 'get').mockResolvedValue(draft({ content: 'Hạt óc chó giúp chữa mất ngủ.' }))
    renderAt('/admin/blog/5')
    expect((await screen.findByText(/Lưu ý nội dung/)).textContent).toContain('"chữa"')
    expect(screen.getByRole('button', { name: 'Đăng' })).toHaveProperty('disabled', false)
  })

  it('saves a new post as a draft before its first image, and keeps the editor open', async () => {
    const created = draft({ id: 9, title: 'Bài mới', slug: 'bai-moi', excerpt: null, content: '' })
    const create = vi.spyOn(adminBlogApi, 'create').mockResolvedValue(created)
    const uploadImage = vi.spyOn(adminBlogApi, 'uploadImage').mockResolvedValue({ id: 'img-1', url: IMAGE_URL, width: 800, height: 600, alt: null })
    const router = renderAt('/admin/blog/moi')

    fireEvent.change(await screen.findByLabelText('Tiêu đề'), { target: { value: 'Bài mới' } })
    expect((screen.getByLabelText('Đường dẫn (slug)') as HTMLInputElement).value).toBe('bai-moi')
    fireEvent.change(screen.getByTestId('editor-image-input'), { target: { files: [png()] } })

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(9, expect.any(File)))
    expect(create).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/admin/blog/9')
    fireEvent.change(await screen.findByLabelText(/Mô tả ảnh \(alt\)/), { target: { value: 'Ảnh' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Chèn ảnh' }))
    await waitFor(() => expect((screen.getByLabelText('Nội dung') as HTMLTextAreaElement).value).toContain(`![Ảnh](${IMAGE_URL})`))
  })
})
