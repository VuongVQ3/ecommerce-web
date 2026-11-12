// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import SitesPage from './SitesPage'
import { sitesApi, type TreeNode } from './sitesApi'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

const node = (id: string, path: string, title: string, children: TreeNode[] = [], status: TreeNode['status'] = 'DRAFT'): TreeNode => ({
  id,
  parentId: null,
  name: path.split('/').pop()!,
  path,
  title,
  template: 'landing',
  status,
  sortOrder: 0,
  updatedAt: '2026-11-10T00:00:00Z',
  children,
})

const TREE = [
  node('a', '/gioi-thieu', 'Giới thiệu', [{ ...node('a1', '/gioi-thieu/doi-ngu', 'Đội ngũ'), parentId: 'a' }], 'PUBLISHED'),
  node('b', '/khuyen-mai', 'Khuyến mãi'),
]

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/author/sites', element: <SitesPage /> },
      { path: '/author/sites/:id', element: <Where /> },
    ],
    { initialEntries: ['/author/sites'] },
  )
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.spyOn(sitesApi, 'tree').mockResolvedValue(TREE)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SitesPage', () => {
  it('shows the tree with each page status and path', async () => {
    renderPage()
    expect((await screen.findByRole('link', { name: 'Giới thiệu' })).getAttribute('href')).toBe('/author/sites/a')
    expect(screen.getByText('/gioi-thieu/doi-ngu')).toBeTruthy()
    expect(screen.getByText('Đã publish')).toBeTruthy()
    expect(screen.getAllByText('Bản nháp')).toHaveLength(2)
  })

  it('creates a child page and opens it in the editor', async () => {
    const create = vi.spyOn(sitesApi, 'create').mockResolvedValue({ id: 'new' } as Awaited<ReturnType<typeof sitesApi.create>>)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm trang con vào Giới thiệu' }))
    const dialog = screen.getByRole('dialog')
    expect((within(dialog).getByRole('combobox', { name: 'Trang cha' }) as HTMLSelectElement).value).toBe('a')
    expect((within(dialog).getByRole('combobox', { name: 'Mẫu trang' }) as HTMLSelectElement).value).toBe('content')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Tiêu đề' }), { target: { value: 'Câu chuyện' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo trang' })))
    expect(create).toHaveBeenCalledWith({ parentId: 'a', title: 'Câu chuyện', name: undefined, template: 'content' })
    expect((await screen.findByTestId('where')).textContent).toBe('/author/sites/new')
  })

  it('moves a page under another parent, never under itself or its children', async () => {
    const move = vi.spyOn(sitesApi, 'move').mockResolvedValue({} as Awaited<ReturnType<typeof sitesApi.move>>)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Chuyển Giới thiệu sang trang cha khác' }))
    const dialog = screen.getByRole('dialog')
    const options = within(dialog).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['— Cấp cao nhất —', 'Khuyến mãi (/khuyen-mai)'])
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'b' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Chuyển' })))
    expect(move).toHaveBeenCalledWith('a', 'b')
  })

  it('reorders siblings from the keyboard', async () => {
    const move = vi.spyOn(sitesApi, 'move').mockResolvedValue({} as Awaited<ReturnType<typeof sitesApi.move>>)
    renderPage()
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Đổi thứ tự: Khuyến mãi' }), { key: 'ArrowUp' })
    await waitFor(() => expect(move).toHaveBeenCalledWith('b', null, 0))
  })
})
