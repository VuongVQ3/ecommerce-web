// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { ApiError } from '../../lib/api'
import AssetDetailPage from './AssetDetailPage'
import { assetDetail, TREE } from './damFixtures'
import { damApi } from './damApi'

const session = vi.hoisted(() => ({ canDelete: false, canPublish: false, canManageModels: false, role: 'STAFF', modules: [] }))
vi.mock('../AuthorSessionContext', () => ({ useAuthorSession: () => session }))

const writeText = vi.fn()

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function renderDetail() {
  const router = createMemoryRouter(
    [
      { path: '/author/assets/:id', element: <AssetDetailPage /> },
      { path: '/author/assets', element: <Where /> },
    ],
    { initialEntries: ['/author/assets/a1'] },
  )
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  session.canDelete = false
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  vi.spyOn(damApi, 'folders').mockResolvedValue(TREE)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AssetDetailPage', () => {
  it('saves the metadata with tags as chips', async () => {
    vi.spyOn(damApi, 'get').mockResolvedValue(assetDetail({ alt: null, tags: [] }))
    const update = vi.spyOn(damApi, 'update').mockImplementation(async (_id, input) => assetDetail({ ...input }))
    renderDetail()
    const title = await screen.findByRole('textbox', { name: /Tiêu đề/ })
    expect(screen.getByText(/Ảnh chưa có alt: vẫn lưu được/)).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    fireEvent.change(title, { target: { value: 'Banner Tết 2027' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Mô tả ảnh \(alt\)/ }), { target: { value: '  Giỏ quà Tết ' } })
    const tags = screen.getByRole('textbox', { name: 'Tag' })
    fireEvent.change(tags, { target: { value: 'Tết  Nguyên Đán' } })
    fireEvent.keyDown(tags, { key: 'Enter' })
    fireEvent.change(tags, { target: { value: 'banner' } })
    fireEvent.keyDown(tags, { key: ',' })
    expect(screen.getByRole('button', { name: 'Bỏ tag tết nguyên đán' })).toBeTruthy()

    fireEvent.click(save)
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('a1', {
        title: 'Banner Tết 2027',
        alt: 'Giỏ quà Tết',
        description: null,
        tags: ['tết nguyên đán', 'banner'],
      }),
    )
    expect(await screen.findByText('Đã lưu thông tin asset')).toBeTruthy()
  })

  it('an empty title is not sent', async () => {
    vi.spyOn(damApi, 'get').mockResolvedValue(assetDetail())
    const update = vi.spyOn(damApi, 'update')
    renderDetail()
    fireEvent.change(await screen.findByRole('textbox', { name: /Tiêu đề/ }), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText('Nhập tiêu đề')).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('STAFF never sees the delete button', async () => {
    vi.spyOn(damApi, 'get').mockResolvedValue(assetDetail())
    renderDetail()
    await screen.findByRole('button', { name: /Thay file/ })
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull()
    expect(screen.getByRole('button', { name: /Di chuyển/ })).toBeTruthy()
  })

  it('an asset in use cannot be deleted, and the usages are listed', async () => {
    session.canDelete = true
    vi.spyOn(damApi, 'get').mockResolvedValue(
      assetDetail({ usages: [{ sourceType: 'PAGE', sourceId: 'trang-chu', since: '2026-11-11T00:00:00Z' }] }),
    )
    const remove = vi.spyOn(damApi, 'remove')
    renderDetail()
    const del = (await screen.findByRole('button', { name: 'Xoá' })) as HTMLButtonElement
    expect(del.disabled).toBe(true)
    expect(screen.getByText(/đang được dùng nên chưa xoá được/)).toBeTruthy()
    const usages = screen.getByRole('region', { name: 'Được dùng ở đâu' })
    expect(within(usages).getByText('trang-chu')).toBeTruthy()
    expect(within(usages).getByText('Trang (Sites)')).toBeTruthy()
    expect(remove).not.toHaveBeenCalled()
  })

  it('a refusal from the server (in use meanwhile) shows the usages instead of deleting', async () => {
    session.canDelete = true
    vi.spyOn(damApi, 'get').mockResolvedValue(assetDetail())
    vi.spyOn(damApi, 'remove').mockRejectedValue(
      new ApiError('Asset đang được dùng ở 1 nơi.', 409, {}, 'ASSET_IN_USE', {
        usages: [{ sourceType: 'FRAGMENT', sourceId: 'faq-1', since: '2026-11-11T00:00:00Z' }],
      }),
    )
    renderDetail()
    expect(await screen.findByText('Chưa được dùng ở đâu.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }))
    const dialog = screen.getByRole('dialog')
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá' })))
    expect(await within(dialog).findByText('Asset đang được dùng ở 1 nơi.')).toBeTruthy()
    expect(within(dialog).getByText('faq-1')).toBeTruthy()
  })

  it('an admin deletes an unused asset and goes back to its folder', async () => {
    session.canDelete = true
    vi.spyOn(damApi, 'get').mockResolvedValue(assetDetail())
    const remove = vi.spyOn(damApi, 'remove').mockResolvedValue(undefined)
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá' }))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xoá' })))
    expect(remove).toHaveBeenCalledWith('a1')
    expect((await screen.findByTestId('where')).textContent).toBe('/author/assets?folder=2')
  })

  it('copies the full stable link and each rendition', async () => {
    vi.spyOn(damApi, 'get').mockResolvedValue(assetDetail())
    renderDetail()
    const copyLink = await screen.findByRole('button', { name: 'Copy link' })
    await act(async () => fireEvent.click(copyLink))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/files/a1/banner-tet.jpg`)
    expect(screen.getByText('Link này giữ nguyên kể cả khi thay file.')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy thumb' })))
    expect(writeText).toHaveBeenLastCalledWith('https://res.cloudinary.com/thumb.jpg')
  })

  it('a PDF shows page 1 and opens through the stable link', async () => {
    vi.spyOn(damApi, 'get').mockResolvedValue(
      assetDetail({ kind: 'PDF', mime: 'application/pdf', pageCount: 4, width: null, height: null, stableUrl: '/files/a1/bang-gia.pdf' }),
    )
    renderDetail()
    const open = await screen.findByRole('link', { name: /Mở PDF/ })
    expect(open.getAttribute('href')).toBe('/files/a1/bang-gia.pdf')
    expect(open.getAttribute('target')).toBe('_blank')
    expect(screen.queryByRole('textbox', { name: /alt/ })).toBeNull()
    expect(screen.getByText('4 trang')).toBeTruthy()
  })
})
