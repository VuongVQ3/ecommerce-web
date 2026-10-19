// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, type User } from '../lib/api'
import { readRecentOrders } from '../lib/recentOrders'
import { OrderLookupPage } from './OrderPages'

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: null as User | null, loading: false }) }))

const CODE = 'HL261014ABCD'
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

function renderLookup(state?: unknown) {
  const router = createMemoryRouter(
    [
      { path: '/tra-cuu-don-hang', element: <OrderLookupPage /> },
      { path: '*', element: <Where /> },
    ],
    { initialEntries: [{ pathname: '/tra-cuu-don-hang', search: state ? `?code=${CODE}` : '', state }] },
  )
  render(<RouterProvider router={router} />)
}

function submit(code: string, phone: string) {
  fireEvent.change(screen.getByLabelText('Mã đơn hàng'), { target: { value: code } })
  fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: phone } })
  fireEvent.click(screen.getByRole('button', { name: 'Tra cứu' }))
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('OrderLookupPage', () => {
  it('opens the tracking page with the new link and keeps it in recent orders', async () => {
    const lookup = vi.spyOn(api, 'lookupOrder').mockResolvedValue({ code: CODE, token: TOKEN })
    renderLookup()
    submit(CODE.toLowerCase(), '0912 345 678')

    expect(await screen.findByTestId('where')).toHaveProperty('textContent', `/don-hang/${CODE}?t=${TOKEN}`)
    expect(lookup).toHaveBeenCalledWith(CODE, '0912345678')
    expect(readRecentOrders().map((o) => [o.code, o.token])).toEqual([[CODE, TOKEN]])
  })

  it('shows the one "not found" message for a wrong code or phone', async () => {
    vi.spyOn(api, 'lookupOrder').mockRejectedValue(
      new ApiError('Không tìm thấy đơn hàng. Vui lòng kiểm tra lại mã đơn và số điện thoại.', 404, {}, 'ORDER_NOT_FOUND'),
    )
    renderLookup()
    submit(CODE, '0999999999')

    expect(await screen.findByText('Không tìm thấy đơn hàng. Vui lòng kiểm tra lại mã đơn và số điện thoại.')).toBeTruthy()
    expect(screen.queryByTestId('where')).toBeNull()
    expect(readRecentOrders()).toEqual([])
  })

  it('asks to sign in for an order that belongs to an account', async () => {
    vi.spyOn(api, 'lookupOrder').mockRejectedValue(
      new ApiError('Đơn này thuộc một tài khoản. Vui lòng đăng nhập để xem.', 409, {}, 'ORDER_BELONGS_TO_ACCOUNT'),
    )
    renderLookup()
    submit(CODE, '0912345678')

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Đơn này thuộc một tài khoản'))
    expect(screen.getByRole('link', { name: 'Đăng nhập' }).getAttribute('href')).toBe(
      `/dang-nhap?next=${encodeURIComponent(`/tai-khoan/don-hang/${CODE}`)}`,
    )
  })

  it('confirms an order just placed when checkout sends the buyer here', () => {
    renderLookup({ placedCode: CODE })
    expect(screen.getByRole('status').textContent).toContain('Đặt hàng thành công!')
    expect(screen.getByRole('status').textContent).toContain(CODE)
    expect((screen.getByLabelText('Mã đơn hàng') as HTMLInputElement).value).toBe(CODE)
  })
})
