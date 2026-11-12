// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { ApiError } from '../../lib/api'
import { cfApi } from '../fragments/cfApi'
import PageEditorPage from './PageEditorPage'
import { sitesApi, type PageDetail } from './sitesApi'

const session = vi.hoisted(() => ({ canDelete: true, canPublish: true, canManageModels: true, role: 'ADMIN', modules: [] }))
vi.mock('../AuthorSessionContext', () => ({ useAuthorSession: () => session }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

const detail = (over: Partial<PageDetail> = {}): PageDetail => ({
  id: 'p1',
  parentId: null,
  name: 'gioi-thieu',
  path: '/gioi-thieu',
  template: 'landing',
  title: 'Giới thiệu',
  content: { regions: { main: [] } },
  properties: {},
  status: 'DRAFT',
  publishedVersionId: null,
  publishedAt: null,
  publishAt: null,
  unpublishAt: null,
  createdAt: '2026-11-10T00:00:00Z',
  createdByName: null,
  updatedAt: '2026-11-10T00:00:00Z',
  updatedByName: null,
  versions: [{ id: 'v1', versionNo: 1, title: 'Giới thiệu', comment: 'Tạo mới', createdAt: '2026-11-10T00:00:00Z', createdByName: null, published: false }],
  refs: {},
  oldPaths: [],
  ...over,
})

function renderEditor() {
  const router = createMemoryRouter([{ path: '/author/sites/:id', element: <PageEditorPage /> }], { initialEntries: ['/author/sites/p1'] })
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  Object.assign(session, { canPublish: true, canDelete: true })
  vi.spyOn(sitesApi, 'previewLink').mockResolvedValue({ url: '/author/preview?token=abc', expiresAt: '2026-11-13T00:00:00Z' })
  vi.spyOn(cfApi, 'markdownPreview').mockResolvedValue({ html: '<p>x</p>', readingMinutes: 1 })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PageEditorPage', () => {
  it('adds a component from the palette, edits its props and saves the content', async () => {
    vi.spyOn(sitesApi, 'page').mockResolvedValue(detail())
    const save = vi.spyOn(sitesApi, 'save').mockImplementation(async (_id, input) => detail({ title: input.title, content: input.content }))
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm component' }))
    fireEvent.click(within(screen.getByRole('list', { name: 'Bảng component' })).getByRole('button', { name: 'Hero (banner lớn)' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Tiêu đề' }), { target: { value: 'Tết sum vầy' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Căn chữ' }), { target: { value: 'center' } })
    expect(within(screen.getByRole('list', { name: 'Danh sách component' })).getByText('Tết sum vầy')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const block = save.mock.calls[0][1].content.regions.main[0]
    expect(block.type).toBe('hero')
    expect(block.props).toEqual({ align: 'center', headline: 'Tết sum vầy' })
    // The preview pane shows the saved working copy
    expect(screen.getByTitle('Xem trước trang').getAttribute('src')).toBe('/author/preview?token=abc')
  })

  it('the palette only offers what the template allows', async () => {
    vi.spyOn(sitesApi, 'page').mockResolvedValue(detail({ template: 'content' }))
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm component' }))
    const names = within(screen.getByRole('list', { name: 'Bảng component' })).getAllByRole('button').map((b) => b.textContent)
    expect(names).toEqual(['Đoạn văn (Markdown)', 'Ảnh', 'Ảnh + chữ', 'Câu hỏi thường gặp', 'Tải PDF', 'Lời kêu gọi (CTA)'])
  })

  it('server errors open the component they belong to', async () => {
    vi.spyOn(sitesApi, 'page').mockResolvedValue(
      detail({
        status: 'MODIFIED',
        publishedVersionId: 'v1',
        content: {
          regions: {
            main: [
              { id: 's1', type: 'spacer', props: { size: 'md' } },
              { id: 'g1', type: 'product-grid', props: { mode: 'category' } },
            ],
          },
        },
      }),
    )
    vi.spyOn(sitesApi, 'publish').mockRejectedValue(
      new ApiError('Trang chưa đủ dữ liệu để publish', 400, { 'blocks.g1.props.categorySlug': 'Bắt buộc' }, 'INVALID_PAGE'),
    )
    vi.spyOn(cfApi, 'models').mockResolvedValue([])
    renderEditor()
    const publishButton = await screen.findByRole('button', { name: /Publish/ })
    await act(async () => fireEvent.click(publishButton))
    expect(await screen.findByText('Bắt buộc')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Lưới sản phẩm' })).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Danh sách component' })).getByText('· cần sửa')).toBeTruthy()
  })

  it('unpublished fragments are published along on confirmation', async () => {
    vi.spyOn(sitesApi, 'page').mockResolvedValue(detail())
    const publish = vi
      .spyOn(sitesApi, 'publish')
      .mockRejectedValueOnce(new ApiError('Trang dùng 1 fragment chưa publish.', 409, {}, 'UNPUBLISHED_REFERENCES', { references: [{ id: 'f1', title: 'Hỏi đáp Tết', model: 'faq' }] }))
      .mockResolvedValue(detail({ status: 'PUBLISHED', publishedVersionId: 'v1' }))
    renderEditor()
    const publishButton = await screen.findByRole('button', { name: /Publish/ })
    await act(async () => fireEvent.click(publishButton))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Hỏi đáp Tết')).toBeTruthy()
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Publish cùng lúc' })))
    expect(publish).toHaveBeenLastCalledWith('p1', true)
  })

  it('deleting a page with children asks again before taking them too', async () => {
    vi.spyOn(sitesApi, 'page').mockResolvedValue(detail())
    const remove = vi
      .spyOn(sitesApi, 'remove')
      .mockRejectedValueOnce(new ApiError('Trang có 2 trang con.', 409, {}, 'PAGE_HAS_CHILDREN', { childCount: 2 }))
      .mockResolvedValue(undefined)
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá trang' }))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xoá' })))
    expect(remove).toHaveBeenCalledWith('p1', false)
    const again = await screen.findByRole('dialog', { name: 'Xoá trang và 2 trang con?' })
    await act(async () => fireEvent.click(within(again).getByRole('button', { name: 'Xoá cả trang con' })))
    expect(remove).toHaveBeenLastCalledWith('p1', true)
  })

  it('STAFF edits but cannot publish or delete', async () => {
    Object.assign(session, { canPublish: false, canDelete: false })
    vi.spyOn(sitesApi, 'page').mockResolvedValue(detail())
    renderEditor()
    await screen.findByRole('button', { name: 'Thêm component' })
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Xoá trang' })).toBeNull()
  })
})
