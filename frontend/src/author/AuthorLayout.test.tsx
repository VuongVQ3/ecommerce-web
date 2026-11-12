// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequireAuth from '../auth/RequireAuth'
import type { Role } from '../lib/api'
import AuthorHomePage from './AuthorHomePage'
import AuthorLayout from './AuthorLayout'
import AuthorPlaceholderPage from './AuthorPlaceholderPage'

type User = { id: string; fullName: string; email: string; role: Role; passwordChangeRequired: boolean }
const auth = vi.hoisted(() => ({ user: null as User | null }))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, loading: false, logout: vi.fn() }),
}))

const signIn = (role: Role) => {
  auth.user = { id: 'u1', fullName: `Người ${role}`, email: 'a@b.vn', role, passwordChangeRequired: false }
}

const session = (role: Role) => ({
  role,
  canPublish: role === 'ADMIN',
  canDelete: role === 'ADMIN',
  canManageModels: role === 'ADMIN',
  modules: ['sites', 'assets', 'fragments'],
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** GET /api/author/session answers with these, in order (the last one repeats). */
function mockSession(...answers: (() => Response | Promise<Response>)[]) {
  const fetch = vi.fn((input: RequestInfo | URL) => {
    if (!String(input).endsWith('/api/author/session')) return Promise.resolve(json(404, {}))
    const answer = answers.length > 1 ? answers.shift()! : answers[0]
    return Promise.resolve(answer())
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

/** The /author routes as in main.tsx, plus a login page that shows where it was sent to. */
function renderAuthor(path = '/author') {
  const router = createMemoryRouter(
    [
      {
        path: '/author',
        element: <RequireAuth roles={['STAFF', 'ADMIN']} />,
        children: [
          {
            element: <AuthorLayout />,
            children: [
              { index: true, element: <AuthorHomePage /> },
              { path: 'sites', element: <AuthorPlaceholderPage module="sites" /> },
              { path: 'assets', element: <AuthorPlaceholderPage module="assets" /> },
              { path: 'fragments', element: <AuthorPlaceholderPage module="fragments" /> },
            ],
          },
        ],
      },
      { path: '*', element: <Where /> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  auth.user = null
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AuthorLayout', () => {
  it('shows the four menu entries and the ways out', async () => {
    signIn('STAFF')
    mockSession(() => json(200, session('STAFF')))
    renderAuthor()
    const nav = (await screen.findAllByRole('navigation', { name: 'Author' }))[0]
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Tổng quan', '/author'],
      ['Sites', '/author/sites'],
      ['Assets', '/author/assets'],
      ['Content Fragments', '/author/fragments'],
    ])
    expect(screen.getAllByRole('link', { name: 'Về trang quản trị' })[0].getAttribute('href')).toBe('/admin')
    expect(screen.getAllByRole('link', { name: 'Xem website' })[0].getAttribute('href')).toBe('/')
    // Its own identity, so it is never mistaken for the back office
    expect(screen.getAllByText('Môi trường soạn thảo').length).toBeGreaterThan(0)
    expect(document.title).toBe('Tổng quan | Author | Hạt Lành')
  })

  it('asks for the session only once while moving between pages', async () => {
    signIn('STAFF')
    const fetch = mockSession(() => json(200, session('STAFF')))
    renderAuthor()
    fireEvent.click((await screen.findAllByRole('link', { name: 'Assets' }))[0])
    expect(await screen.findByRole('heading', { name: 'Assets' })).toBeTruthy()
    expect(screen.getAllByText('Sắp có').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /tải lên|tạo|thêm/i })).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('a 403 from the session shows the forbidden page', async () => {
    signIn('STAFF')
    mockSession(() => json(403, { detail: 'Bạn không có quyền truy cập chức năng này' }))
    renderAuthor()
    expect(await screen.findByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Author' })).toBeNull()
  })

  it('a network failure shows a message, and "Thử lại" asks again', async () => {
    signIn('ADMIN')
    const fetch = mockSession(
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => json(200, session('ADMIN')),
    )
    renderAuthor()
    expect((await screen.findByRole('alert')).textContent).toContain('Không kết nối được máy chủ')
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('heading', { name: 'Tổng quan nội dung' })).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('who gets into /author', () => {
  it('a customer sees the forbidden page, without asking the API', async () => {
    signIn('CUSTOMER')
    const fetch = mockSession(() => json(403, {}))
    renderAuthor('/author/sites')
    expect(await screen.findByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('a signed-out visitor is sent to the login page and comes back afterwards', async () => {
    mockSession(() => json(401, {}))
    renderAuthor('/author/assets')
    expect((await screen.findByTestId('where')).textContent).toBe('/dang-nhap?next=%2Fauthor%2Fassets')
  })
})

describe('AuthorHomePage', () => {
  it('STAFF: may write drafts, only ADMIN publishes', async () => {
    signIn('STAFF')
    mockSession(() => json(200, session('STAFF')))
    renderAuthor()
    expect(
      await screen.findByText(
        'Bạn có thể soạn nháp, tải lên và xem trước; chỉ ADMIN được publish, xoá nội dung và sửa content model.',
      ),
    ).toBeTruthy()
    for (const name of ['Sites', 'Assets', 'Content Fragments']) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(1) // menu entry and card
    }
  })

  it('ADMIN: may do everything', async () => {
    signIn('ADMIN')
    mockSession(() => json(200, session('ADMIN')))
    renderAuthor()
    expect(
      await screen.findByText(
        'Bạn có thể soạn nháp, tải lên, xem trước, publish, xoá nội dung và sửa content model.',
      ),
    ).toBeTruthy()
  })

  it('follows the session, not the role (e.g. if STAFF may publish one day)', async () => {
    signIn('STAFF')
    mockSession(() => json(200, { ...session('STAFF'), canPublish: true }))
    renderAuthor()
    expect(
      await screen.findByText(
        'Bạn có thể soạn nháp, tải lên, xem trước và publish; chỉ ADMIN được xoá nội dung và sửa content model.',
      ),
    ).toBeTruthy()
  })
})
