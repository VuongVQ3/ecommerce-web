// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { ApiError } from '../../lib/api'
import AssetsPage from './AssetsPage'
import { assetDetail, assetRow, fakeFile, page, TREE } from './damFixtures'
import { damApi } from './damApi'

const session = vi.hoisted(() => ({ canDelete: false, canPublish: false, canManageModels: false, role: 'STAFF', modules: [] }))
vi.mock('../AuthorSessionContext', () => ({ useAuthorSession: () => session }))

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function renderPage(path = '/author/assets?folder=2') {
  const router = createMemoryRouter(
    [
      {
        path: '/author/assets',
        element: (
          <>
            <AssetsPage />
            <Where />
          </>
        ),
      },
      { path: '/author/assets/:id', element: <Where /> },
    ],
    { initialEntries: [path] },
  )
  const view = render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  )
  return { ...view, fileInput: () => view.container.querySelector<HTMLInputElement>('input[type="file"]')! }
}

const where = () => screen.getByTestId('where').textContent

beforeEach(() => {
  localStorage.clear()
  session.canDelete = false
  vi.spyOn(damApi, 'folders').mockResolvedValue(TREE)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AssetsPage list', () => {
  it('shows a grid with thumbnails, PDF pages and the missing-alt warning, or a table', async () => {
    vi.spyOn(damApi, 'list').mockResolvedValue(
      page([
        assetRow(),
        assetRow({ id: 'a2', title: 'Ảnh chưa có alt', alt: null }),
        assetRow({ id: 'a3', title: 'Bảng giá', kind: 'PDF', mime: 'application/pdf', pageCount: 3, width: null, height: null, alt: null }),
      ]),
    )
    renderPage()
    const grid = await screen.findByRole('link', { name: /Banner Tết/ })
    expect(grid.getAttribute('href')).toBe('/author/assets/a1')
    expect(screen.getAllByText('Thiếu alt')).toHaveLength(1) // the PDF needs no alt
    expect(screen.getByText('PDF · 3 trang')).toBeTruthy()
    expect(damApi.list).toHaveBeenCalledWith(expect.objectContaining({ folderId: 2, page: 0, size: 40 }), expect.anything())

    fireEvent.click(screen.getByRole('button', { name: 'Bảng' }))
    const table = screen.getByRole('table')
    expect(within(table).getAllByText('2 KB')).toHaveLength(3)
    expect(within(table).getAllByText('1200 × 800')).toHaveLength(2)
    expect(within(table).getByText('3 trang')).toBeTruthy()
    expect(within(table).getAllByText('Nhân Viên').length).toBe(3)
    expect(localStorage.getItem('author.assets.view')).toBe('table')
  })

  it('filters and search go into the URL (search after a short pause), back to page 1', async () => {
    const list = vi.spyOn(damApi, 'list').mockResolvedValue(page([assetRow()]))
    renderPage('/author/assets?folder=2&page=2')
    await screen.findByRole('link', { name: /Banner Tết/ })

    fireEvent.change(screen.getByRole('combobox', { name: 'Loại' }), { target: { value: 'PDF' } })
    expect(where()).toBe('/author/assets?folder=2&kind=PDF')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm asset' }), { target: { value: 'bang gia' } })
    expect(where()).toBe('/author/assets?folder=2&kind=PDF')
    await waitFor(() => expect(where()).toBe('/author/assets?folder=2&kind=PDF&q=bang+gia'))
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ folderId: 2, kind: 'PDF', q: 'bang gia', page: 0 }), expect.anything()),
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Lọc tag' }), { target: { value: 'tet' } })
    await waitFor(() => expect(where()).toContain('tag=tet'))
  })

  it('choosing a folder in the tree opens it', async () => {
    vi.spyOn(damApi, 'list').mockResolvedValue(page([]))
    renderPage('/author/assets')
    fireEvent.click(await screen.findByRole('button', { name: /tai-lieu/ }))
    expect(where()).toBe('/author/assets?folder=3')
    expect(await screen.findByText('/hat-lanh/tai-lieu')).toBeTruthy()
  })

  it('folder delete is offered to admins only', async () => {
    vi.spyOn(damApi, 'list').mockResolvedValue(page([]))
    renderPage()
    await screen.findByRole('button', { name: /Đổi tên/ })
    expect(screen.queryByRole('button', { name: /Xoá thư mục/ })).toBeNull()
    cleanup()
    session.canDelete = true
    renderPage()
    expect(await screen.findByRole('button', { name: /Xoá thư mục/ })).toBeTruthy()
  })
})

describe('AssetsPage uploads', () => {
  it('refuses large and wrong files in the browser and uploads the rest one at a time', async () => {
    vi.spyOn(damApi, 'list').mockResolvedValue(page([]))
    const resolvers: ((value: ReturnType<typeof assetDetail>) => void)[] = []
    const upload = vi.spyOn(damApi, 'upload').mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    const { fileInput } = renderPage()
    await screen.findByText('Chưa có asset nào')

    fireEvent.change(fileInput(), {
      target: {
        files: [
          fakeFile('lon.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1),
          fakeFile('tai-lieu.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
          fakeFile('mot.jpg', 'image/jpeg'),
          fakeFile('hai.pdf', 'application/pdf'),
        ],
      },
    })

    const rows = () => screen.getAllByTestId('upload-item').map((r) => `${r.textContent}|${r.dataset.status}`)
    expect(rows()[0]).toContain('File lớn hơn 10MB')
    expect(rows()[1]).toContain('Chỉ nhận ảnh JPEG, PNG, WebP hoặc file PDF')
    // Only the valid files are sent, the second waits for the first
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    expect(upload.mock.calls[0][0].name).toBe('mot.jpg')
    expect(upload.mock.calls[0][1]).toBe(2)
    expect(rows()[3]).toContain('|waiting')

    await act(async () => resolvers[0](assetDetail({ id: 'n1' })))
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
    expect(upload.mock.calls[1][0].name).toBe('hai.pdf')
    await act(async () => resolvers[1](assetDetail({ id: 'n2' })))
    await waitFor(() => expect(rows().filter((r) => r.endsWith('|done'))).toHaveLength(2))
  })

  it('a file already in the library links to the asset that has it', async () => {
    vi.spyOn(damApi, 'list').mockResolvedValue(page([]))
    vi.spyOn(damApi, 'upload').mockRejectedValue(
      new ApiError('File này đã có trong kho: “Banner Tết”', 409, {}, 'DUPLICATE_ASSET', { assetId: 'old-1' }),
    )
    const { fileInput } = renderPage()
    await screen.findByText('Chưa có asset nào')
    fireEvent.change(fileInput(), { target: { files: [fakeFile('ban-sao.jpg', 'image/jpeg')] } })

    expect(await screen.findByText('Đã có trong kho')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Xem asset đã có' }).getAttribute('href')).toBe('/author/assets/old-1')
  })

  it('without an open folder there is nowhere to upload', async () => {
    vi.spyOn(damApi, 'list').mockResolvedValue(page([assetRow()]))
    renderPage('/author/assets')
    await screen.findByRole('link', { name: /Banner Tết/ })
    expect((screen.getByRole('button', { name: 'Tải lên' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
