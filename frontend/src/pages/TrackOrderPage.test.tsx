// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { api, ApiError, type TrackedOrder, type User } from '../lib/api'
import { readRecentOrders, saveRecentOrder } from '../lib/recentOrders'
import TrackOrderPage from './TrackOrderPage'

const signedIn = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ current: { user: null as User | null, loading: false } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ ...auth.current, signedIn }) }))

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
const CODE = 'HL261014ABCD'

const tracked: TrackedOrder = {
  code: CODE,
  status: 'CONFIRMED',
  statusLabel: 'Đã xác nhận',
  createdAt: '2026-10-14T03:00:00Z',
  customerName: 'Nguyễn Khách',
  maskedPhone: '09******78',
  maskedEmail: 'kh***@example.com',
  hasEmail: true,
  province: 'Thành phố Hà Nội',
  ward: 'Phường Ba Đình',
  addressLine: '12 Phố Test',
  paymentMethod: 'COD',
  items: [{ productId: 7, productName: 'Hạt chia Úc', unitPrice: 129_000, regularUnitPrice: 129_000, weightGrams: 500, quantity: 2, lineTotal: 258_000 }],
  subtotal: 258_000,
  shippingFee: 30_000,
  total: 288_000,
  carrier: null,
  trackingNumber: null,
  history: [
    { status: 'PENDING', label: 'Chờ xác nhận', at: '2026-10-14T03:00:00Z', reason: 'Đặt hàng' },
    { status: 'CONFIRMED', label: 'Đã xác nhận', at: '2026-10-14T04:00:00Z', reason: null },
  ],
  canCancel: false,
  canClaim: true,
}

function Where() {
  const location = useLocation()
  return <pre data-testid="where">{location.pathname + location.search}</pre>
}

function renderPage(state?: unknown) {
  const router = createMemoryRouter(
    [
      { path: '/don-hang/:code', element: <TrackOrderPage /> },
      { path: '*', element: <Where /> },
    ],
    { initialEntries: [{ pathname: `/don-hang/${CODE}`, search: `?t=${TOKEN}`, state }] },
  )
  return render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  )
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  auth.current = { user: null, loading: false }
  signedIn.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('TrackOrderPage', () => {
  it('shows the whole order from the API after a reload (no navigation state)', async () => {
    const track = vi.spyOn(api, 'trackOrder').mockResolvedValue(tracked)
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: CODE })).toBeTruthy()
    expect(track).toHaveBeenCalledWith(CODE, TOKEN, expect.anything())
    expect(screen.queryByText('Đặt hàng thành công!')).toBeNull()
    expect(screen.getByText('Hạt chia Úc')).toBeTruthy()
    expect(screen.getByText('12 Phố Test, Phường Ba Đình, Thành phố Hà Nội')).toBeTruthy()
    expect(screen.getByText(/09\*\*\*\*\*\*78/)).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Tiến trình đơn hàng' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sao chép link theo dõi' })).toBeTruthy()
    // Not cancellable once confirmed
    expect(screen.queryByRole('button', { name: 'Huỷ đơn hàng' })).toBeNull()
    // Remembered in this browser: code + token only
    expect(readRecentOrders()).toMatchObject([{ code: CODE, token: TOKEN }])
  })

  it('shows the success banner only right after checkout', async () => {
    vi.spyOn(api, 'trackOrder').mockResolvedValue(tracked)
    renderPage({ justPlaced: true })
    expect(await screen.findByText('Đặt hàng thành công!')).toBeTruthy()
  })

  it('explains how to look the order up when the link does not work', async () => {
    saveRecentOrder(CODE, TOKEN)
    vi.spyOn(api, 'trackOrder').mockRejectedValue(new ApiError('Không tìm thấy', 404, {}, 'ORDER_NOT_FOUND'))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Không mở được link theo dõi' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tra cứu đơn hàng' }).getAttribute('href')).toBe(`/tra-cuu-don-hang?code=${CODE}`)
    await waitFor(() => expect(readRecentOrders()).toEqual([]))
  })

  it('requires a reason to cancel', async () => {
    vi.spyOn(api, 'trackOrder').mockResolvedValue({ ...tracked, status: 'PENDING', statusLabel: 'Chờ xác nhận', canCancel: true })
    const cancel = vi
      .spyOn(api, 'cancelTrackedOrder')
      .mockResolvedValue({ ...tracked, status: 'CANCELLED', statusLabel: 'Đã huỷ', canCancel: false })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Huỷ đơn hàng' }))
    const confirm = screen.getAllByRole('button', { name: 'Huỷ đơn hàng' }).at(-1)!
    fireEvent.click(confirm)
    expect(await screen.findByText('Vui lòng chọn lý do huỷ đơn')).toBeTruthy()
    expect(cancel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('Không còn nhu cầu'))
    fireEvent.click(confirm)
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(CODE, TOKEN, 'Không còn nhu cầu'))
  })

  it('creates an account from the order and goes to the saved order', async () => {
    saveRecentOrder(CODE, TOKEN)
    vi.spyOn(api, 'trackOrder').mockResolvedValue(tracked)
    const user: User = { id: 'u1', email: 'khach@example.com', fullName: 'Nguyễn Khách', phone: '0912345678', role: 'CUSTOMER', emailVerified: false, passwordChangeRequired: false }
    const claim = vi.spyOn(api, 'claimAccount').mockResolvedValue(user)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Lưu đơn hàng vào tài khoản' })).toBeTruthy()
    expect(screen.getByText('kh***@example.com')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'matkhau123' } })
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), { target: { value: 'matkhau123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))

    expect(await screen.findByTestId('where')).toBeTruthy()
    expect(screen.getByTestId('where').textContent).toBe(`/tai-khoan/don-hang/${CODE}`)
    expect(claim).toHaveBeenCalledWith(CODE, TOKEN, {
      password: 'matkhau123',
      acceptTerms: true,
      marketingConsent: false,
      email: undefined,
    })
    expect(signedIn).toHaveBeenCalledWith(user)
    expect(readRecentOrders()).toEqual([])
  })

  it('offers sign-in when the email or phone already has an account', async () => {
    vi.spyOn(api, 'trackOrder').mockResolvedValue(tracked)
    vi.spyOn(api, 'claimAccount').mockRejectedValue(new ApiError('exists', 409, {}, 'ACCOUNT_EXISTS'))
    renderPage()
    await screen.findByRole('heading', { name: 'Lưu đơn hàng vào tài khoản' })
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'matkhau123' } })
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), { target: { value: 'matkhau123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))

    expect(await screen.findByText('Email hoặc số điện thoại này đã có tài khoản.')).toBeTruthy()
    const login = screen.getByRole('link', { name: 'Đăng nhập để lưu đơn' })
    expect(login.getAttribute('href')).toBe(`/dang-nhap?next=${encodeURIComponent(`/don-hang/${CODE}?t=${TOKEN}`)}`)
  })

  it('asks for an email when the order has none, and can be dismissed', async () => {
    vi.spyOn(api, 'trackOrder').mockResolvedValue({ ...tracked, hasEmail: false, maskedEmail: null })
    renderPage()
    await screen.findByRole('heading', { name: 'Lưu đơn hàng vào tài khoản' })
    expect(screen.getByLabelText('Email')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Đóng lời mời tạo tài khoản' }))
    expect(screen.queryByRole('heading', { name: 'Lưu đơn hàng vào tài khoản' })).toBeNull()
    expect(sessionStorage.getItem(`hatlanh_claim_dismissed_${CODE}`)).toBe('1')
  })
})
