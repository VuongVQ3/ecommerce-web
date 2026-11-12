// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { ApiError } from '../../lib/api'
import { cfApi } from './cfApi'
import { FAQ_MODEL, fragmentDetail, MIXED_MODEL } from './cfFixtures'
import FragmentEditorPage from './FragmentEditorPage'

const session = vi.hoisted(() => ({ canDelete: false, canPublish: false, canManageModels: false, role: 'STAFF', modules: [] }))
vi.mock('../AuthorSessionContext', () => ({ useAuthorSession: () => session }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

function Where() {
  const { pathname } = useLocation()
  return <p data-testid="where">{pathname}</p>
}

function renderEditor(path = '/author/fragments/f1') {
  const router = createMemoryRouter(
    [
      { path: '/author/fragments/new', element: <FragmentEditorPage /> },
      { path: '/author/fragments/:id', element: <FragmentEditorPage /> },
      { path: '/author/fragments', element: <Where /> },
    ],
    { initialEntries: [path] },
  )
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  Object.assign(session, { canDelete: false, canPublish: false })
  vi.spyOn(cfApi, 'markdownPreview').mockResolvedValue({ html: '<p>xem</p>', readingMinutes: 1 })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('FragmentEditorPage form', () => {
  it('builds the form from the model: one control per field type', async () => {
    vi.spyOn(cfApi, 'fragment').mockResolvedValue(fragmentDetail({ model: MIXED_MODEL, data: {} }))
    renderEditor()
    expect(await screen.findByRole('textbox', { name: 'Tiêu đề' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Dòng phụ' }).tagName).toBe('TEXTAREA')
    expect(screen.getByRole('checkbox', { name: 'Nổi bật' })).toBeTruthy()
    expect(within(screen.getByRole('combobox', { name: 'Cỡ' })).getAllByRole('option').map((o) => o.textContent)).toEqual(['— Chọn —', 'Nhỏ', 'Lớn'])
    expect((screen.getByLabelText('Bắt đầu') as HTMLInputElement).type).toBe('datetime-local')
    expect((screen.getByLabelText('Ngày') as HTMLInputElement).type).toBe('date')
    expect(screen.getByRole('button', { name: 'Chọn asset' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chọn fragment' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chọn sản phẩm' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Thêm mục' })).toBeTruthy()
  })

  it('saves the working copy with typed values and a datetime in Vietnam time', async () => {
    vi.spyOn(cfApi, 'fragment').mockResolvedValue(fragmentDetail({ model: MIXED_MODEL, data: {} }))
    const save = vi.spyOn(cfApi, 'save').mockImplementation(async (_id, input) => fragmentDetail({ model: MIXED_MODEL, data: input.data }))
    renderEditor()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Tiêu đề' }), { target: { value: 'Banner Tết' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Nổi bật' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Cỡ' }), { target: { value: 'Lớn' } })
    fireEvent.change(screen.getByLabelText('Bắt đầu'), { target: { value: '2026-12-01T08:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mục' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Tag 1' }), { target: { value: 'tet' } })
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mục' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Tag 2' }), { target: { value: 'qua' } })
    fireEvent.click(screen.getByRole('button', { name: 'Đưa mục 2 lên' }))

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][1].data).toEqual({
      headline: 'Banner Tết',
      featured: true,
      size: 'Lớn',
      startsAt: '2026-12-01T08:00:00+07:00',
      tags: ['qua', 'tet'],
    })
  })

  it('shows server errors under the right field', async () => {
    vi.spyOn(cfApi, 'fragment').mockResolvedValue(fragmentDetail())
    vi.spyOn(cfApi, 'save').mockRejectedValue(
      new ApiError('Dữ liệu chưa hợp lệ', 400, { 'data.order': 'Nhỏ nhất là 0' }, 'INVALID_FRAGMENT_DATA'),
    )
    renderEditor()
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Thứ tự' }), { target: { value: '-3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    const order = (await screen.findByText('Nhỏ nhất là 0')).closest('[data-field]')
    expect(order?.getAttribute('data-field')).toBe('order')
  })

  it('creates a fragment of the model in the URL and opens it', async () => {
    vi.spyOn(cfApi, 'model').mockResolvedValue(FAQ_MODEL)
    const create = vi.spyOn(cfApi, 'create').mockResolvedValue(fragmentDetail({ id: 'new-id' }))
    renderEditor('/author/fragments/new?model=1&folder=/faq')
    fireEvent.change(await screen.findByRole('textbox', { name: /Tiêu đề/ }), { target: { value: 'Đổi trả' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Câu hỏi' }), { target: { value: 'Đổi thế nào?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ modelId: 1, folderPath: '/faq', name: undefined, title: 'Đổi trả', data: { question: 'Đổi thế nào?' } }),
    )
  })
})

describe('FragmentEditorPage actions', () => {
  it('STAFF saves but never sees Publish, Unpublish or Delete', async () => {
    vi.spyOn(cfApi, 'fragment').mockResolvedValue(fragmentDetail({ status: 'PUBLISHED', publishedVersionId: 'v2' }))
    renderEditor()
    await screen.findByRole('button', { name: 'Lưu' })
    expect(screen.queryByRole('button', { name: /^Publish/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Unpublish/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Xoá/ })).toBeNull()
  })

  it('unpublished references are listed and published along on confirmation', async () => {
    session.canPublish = true
    vi.spyOn(cfApi, 'fragment').mockResolvedValue(fragmentDetail())
    const publish = vi
      .spyOn(cfApi, 'publish')
      .mockRejectedValueOnce(
        new ApiError('Fragment này dùng 1 fragment chưa publish.', 409, {}, 'UNPUBLISHED_REFERENCES', {
          references: [{ id: 'f9', title: 'Câu hỏi phụ', model: 'faq' }],
        }),
      )
      .mockResolvedValue(fragmentDetail({ status: 'PUBLISHED', publishedVersionId: 'v2' }))
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: /Publish/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Câu hỏi phụ')).toBeTruthy()
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Publish cùng lúc' })))
    expect(publish).toHaveBeenLastCalledWith('f1', true)
    expect((await screen.findAllByText('Đã publish')).length).toBeGreaterThan(0)
  })

  it('restores an old version from the history panel', async () => {
    vi.spyOn(cfApi, 'fragment').mockResolvedValue(fragmentDetail())
    const rollback = vi.spyOn(cfApi, 'rollback').mockResolvedValue(fragmentDetail({ data: { question: 'Cũ', answer: 'cũ' } }))
    renderEditor()
    const history = await screen.findByRole('region', { name: 'Lịch sử phiên bản' })
    // The latest version has nothing to restore
    expect(within(history).getAllByRole('button', { name: /Khôi phục/ })).toHaveLength(1)
    fireEvent.click(within(history).getByRole('button', { name: /Khôi phục/ }))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Khôi phục' })))
    expect(rollback).toHaveBeenCalledWith('f1', 'v1')
    expect((screen.getByRole('textbox', { name: 'Câu hỏi' }) as HTMLInputElement).value).toBe('Cũ')
  })

  it('a preview link can be opened or copied', async () => {
    vi.spyOn(cfApi, 'fragment').mockResolvedValue(fragmentDetail())
    vi.spyOn(cfApi, 'previewLink').mockResolvedValue({ url: '/api/content/preview/fragments/f1?token=abc', expiresAt: '2026-11-13T00:00:00Z' })
    renderEditor()
    const previewButton = await screen.findByRole('button', { name: /Xem preview/ })
    await act(async () => fireEvent.click(previewButton))
    expect(screen.getByRole('link', { name: 'Mở preview' }).getAttribute('href')).toBe('/api/content/preview/fragments/f1?token=abc')
    expect(screen.getByRole('button', { name: 'Copy link preview' })).toBeTruthy()
  })

  it('usages link to the fragments that use this one', async () => {
    vi.spyOn(cfApi, 'fragment').mockResolvedValue(fragmentDetail({ usages: [{ sourceType: 'FRAGMENT', sourceId: 'g1', title: 'Nhóm giao hàng' }] }))
    renderEditor()
    const usages = await screen.findByRole('region', { name: 'Được dùng ở đâu' })
    expect(within(usages).getByRole('link', { name: 'Nhóm giao hàng' }).getAttribute('href')).toBe('/author/fragments/g1')
  })
})
