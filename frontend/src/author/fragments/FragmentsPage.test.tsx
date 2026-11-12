// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cfApi, type FragmentRow, type ModelRow } from './cfApi'
import FragmentsPage from './FragmentsPage'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

const model = (id: number, name: string, status: ModelRow['status'] = 'ENABLED'): ModelRow => ({
  id,
  name,
  slug: name.toLowerCase(),
  description: null,
  status,
  version: 1,
  fieldCount: 3,
  fragmentCount: 1,
  updatedAt: '2026-11-01T00:00:00Z',
  updatedByName: null,
})

const row: FragmentRow = {
  id: 'f1',
  model: { id: 1, slug: 'faq', name: 'FAQ' },
  folderPath: '/faq',
  name: 'giao-hang',
  title: 'Giao hàng',
  status: 'MODIFIED',
  publishedAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-02T00:00:00Z',
  updatedByName: 'Nhân Viên',
}

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function renderPage(path = '/author/fragments') {
  const router = createMemoryRouter(
    [
      {
        path: '/author/fragments',
        element: (
          <>
            <FragmentsPage />
            <Where />
          </>
        ),
      },
      { path: '/author/fragments/new', element: <Where /> },
      { path: '/author/fragments/models', element: <Where /> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
}

const where = () => screen.getByTestId('where').textContent

beforeEach(() => {
  vi.spyOn(cfApi, 'models').mockResolvedValue([model(1, 'FAQ'), model(2, 'Banner'), model(3, 'Nháp', 'DRAFT')])
  vi.spyOn(cfApi, 'folders').mockResolvedValue(['/faq', '/khuyen-mai'])
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('FragmentsPage', () => {
  it('lists fragments with their status and keeps filters in the URL', async () => {
    const list = vi.spyOn(cfApi, 'fragments').mockResolvedValue({ items: [row], page: 0, size: 30, totalItems: 1, totalPages: 1 })
    renderPage('/author/fragments?page=2')
    expect((await screen.findByRole('link', { name: 'Giao hàng' })).getAttribute('href')).toBe('/author/fragments/f1')
    expect(within(screen.getByRole('table')).getByText('Đã sửa sau publish')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: '1' } })
    expect(where()).toBe('/author/fragments?model=1')
    fireEvent.change(screen.getByRole('combobox', { name: 'Trạng thái' }), { target: { value: 'PUBLISHED' } })
    await waitFor(() => expect(within(screen.getByRole('combobox', { name: 'Thư mục' })).getAllByRole('option')).toHaveLength(3))
    fireEvent.change(screen.getByRole('combobox', { name: 'Thư mục' }), { target: { value: '/faq' } })
    expect(where()).toBe('/author/fragments?model=1&status=PUBLISHED&folder=%2Ffaq')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm fragment' }), { target: { value: 'giao' } })
    await waitFor(() => expect(where()).toContain('q=giao'))
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ modelId: 1, status: 'PUBLISHED', folder: '/faq', q: 'giao', page: 0 }), expect.anything()),
    )
  })

  it('a new fragment starts by choosing one of the enabled models', async () => {
    vi.spyOn(cfApi, 'fragments').mockResolvedValue({ items: [], page: 0, size: 30, totalItems: 0, totalPages: 0 })
    renderPage('/author/fragments?model=2')
    await screen.findByText('Không có fragment nào khớp bộ lọc')
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tạo fragment' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Tạo fragment' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByRole('option').map((o) => o.textContent)).toEqual(['FAQ', 'Banner'])
    expect((within(dialog).getByRole('combobox') as HTMLSelectElement).value).toBe('2')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp tục' }))
    expect(where()).toBe('/author/fragments/new?model=2')
  })

  it('switches to the models list', async () => {
    vi.spyOn(cfApi, 'fragments').mockResolvedValue({ items: [row], page: 0, size: 30, totalItems: 1, totalPages: 1 })
    renderPage()
    fireEvent.click(await screen.findByRole('link', { name: 'Models' }))
    expect(where()).toBe('/author/fragments/models')
  })
})
