// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { ApiError } from '../../lib/api'
import { cfApi, type ModelInput } from './cfApi'
import { FAQ_MODEL } from './cfFixtures'
import ModelEditorPage from './ModelEditorPage'

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

function renderEditor(path: string) {
  const router = createMemoryRouter([{ path: '/author/fragments/models/:id', element: <ModelEditorPage /> }], { initialEntries: [path] })
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  )
}

const fieldCards = () => within(screen.getByRole('list', { name: 'Danh sách field' })).getAllByRole('listitem')

beforeEach(() => {
  Object.assign(session, { canDelete: true, canManageModels: true })
  vi.spyOn(cfApi, 'models').mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ModelEditorPage', () => {
  it('a new field takes its name from the label; types bring their own rules', async () => {
    const create = vi.spyOn(cfApi, 'createModel').mockImplementation(async (input) => ({ ...FAQ_MODEL, id: 9, ...input, slug: 'cam-nhan' }))
    renderEditor('/author/fragments/models/new')
    fireEvent.change(await screen.findByRole('textbox', { name: 'Tên model' }), { target: { value: 'Cảm nhận' } })
    fireEvent.click(screen.getByRole('button', { name: 'Thêm field' }))
    const card = fieldCards()[0]
    fireEvent.change(within(card).getByRole('textbox', { name: 'Nhãn' }), { target: { value: 'Lời khen của khách' } })
    expect((within(card).getByRole('textbox', { name: 'Tên (trong dữ liệu)' }) as HTMLInputElement).value).toBe('loiKhenCuaKhach')
    fireEvent.change(within(card).getByRole('combobox', { name: 'Kiểu' }), { target: { value: 'enum' } })
    fireEvent.change(within(card).getByRole('textbox', { name: /Các lựa chọn/ }), { target: { value: 'Tốt\nRất tốt' } })
    fireEvent.click(within(card).getByRole('checkbox', { name: 'Bắt buộc khi publish' }))

    fireEvent.click(screen.getByRole('button', { name: 'Lưu model' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    const input = create.mock.calls[0][0] as ModelInput
    expect(input.name).toBe('Cảm nhận')
    expect(input.fields).toEqual([
      { name: 'loiKhenCuaKhach', label: 'Lời khen của khách', type: 'enum', required: true, multiple: false, help: null, rules: { options: ['Tốt', 'Rất tốt'] } },
    ])
  })

  it('fields can be reordered from the keyboard and removed', async () => {
    vi.spyOn(cfApi, 'model').mockResolvedValue(FAQ_MODEL)
    const update = vi.spyOn(cfApi, 'updateModel').mockResolvedValue(FAQ_MODEL)
    renderEditor('/author/fragments/models/1')
    await screen.findByText(/Câu hỏi thường gặp · v1/)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Đổi thứ tự: Thứ tự' }), { key: 'ArrowUp' })
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ field Câu hỏi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu model' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect((update.mock.calls[0][1] as ModelInput).fields.map((f) => f.name)).toEqual(['order', 'answer'])
  })

  it('a change that would lose data asks first, then drops it on confirmation', async () => {
    vi.spyOn(cfApi, 'model').mockResolvedValue(FAQ_MODEL)
    const update = vi
      .spyOn(cfApi, 'updateModel')
      .mockRejectedValueOnce(
        new ApiError('1 fragment đang có dữ liệu', 409, {}, 'MODEL_CHANGE_CONFLICT', { affectedFragments: 3, fields: ['order'] }),
      )
      .mockResolvedValue({ ...FAQ_MODEL, version: 2, fields: FAQ_MODEL.fields.slice(0, 2) })
    renderEditor('/author/fragments/models/1')
    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ field Thứ tự' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu model' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/3 fragment đang có dữ liệu/)).toBeTruthy()
    expect(within(dialog).getByText('order')).toBeTruthy()
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu và xoá dữ liệu' })))
    expect((update.mock.calls[1][1] as ModelInput).dropFieldData).toBe(true)
    expect(await screen.findByText(/Câu hỏi thường gặp · v2/)).toBeTruthy()
  })

  it('without canManageModels the model is read-only', async () => {
    Object.assign(session, { canManageModels: false, canDelete: false })
    vi.spyOn(cfApi, 'model').mockResolvedValue(FAQ_MODEL)
    renderEditor('/author/fragments/models/1')
    expect(await screen.findByText('Bạn chỉ xem được model; chỉ ADMIN được sửa.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Lưu model' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Thêm field' })).toBeNull()
    expect((screen.getByRole('textbox', { name: 'Tên model' }) as HTMLInputElement).disabled).toBe(true)
  })
})
