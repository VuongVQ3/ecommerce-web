// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readRecentOrders } from '../lib/recentOrders'
import { ToastProvider } from '../components/Toast'
import { api, ApiError, type CartView, type Order, type User } from '../lib/api'
import CheckoutPage from './CheckoutPage'

const auth = vi.hoisted(() => ({ current: { user: null as User | null, loading: false } }))
// refresh(): what /me answers now (by default, the same as the context)
const refresh = vi.hoisted(() => vi.fn<() => Promise<User | null>>())
const logout = vi.hoisted(() => vi.fn())
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ ...auth.current, refresh, logout }) }))
const resetAfterOrder = vi.hoisted(() => vi.fn())

const view: CartView = {
  items: [
    {
      productId: 7,
      name: 'Hạt chia Úc',
      slug: 'hat-chia-uc',
      imageUrl: null,
      categorySlug: 'hat-sieu-thuc-pham',
      weightGrams: 500,
      price: 129_000,
      regularPrice: null,
      priceAtAdd: null,
      quantity: 2,
      requestedQuantity: 2,
      maxPurchasable: 10,
      lineTotal: 258_000,
      status: 'OK',
    },
  ],
  totalQuantity: 2,
  subtotal: 258_000,
  discountTotal: 0,
  shippingFee: 30_000,
  amountToFreeShipping: 242_000,
  freeShippingThreshold: 500_000,
  total: 288_000,
  canCheckout: true,
}
vi.mock('../cart/CartContext', () => ({ useCart: () => ({ view, loading: false, resetAfterOrder }) }))

const GUEST_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
const order = { code: 'HL261013ABCD', total: 288_000, accessToken: GUEST_TOKEN } as Order

function Where() {
  const location = useLocation()
  return <pre data-testid="where">{JSON.stringify({ path: location.pathname + location.search, state: location.state })}</pre>
}

function renderCheckout() {
  const router = createMemoryRouter(
    [
      { path: '/thanh-toan', element: <CheckoutPage /> },
      { path: '*', element: <Where /> },
    ],
    { initialEntries: ['/thanh-toan'] },
  )
  return render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  )
}

const input = (label: string) => screen.getByLabelText(label, { selector: 'input' })
const select = (label: string) => screen.getByLabelText(label, { selector: 'select' }) as HTMLSelectElement
const change = (el: HTMLElement, value: string) => {
  fireEvent.change(el, { target: { value } })
  fireEvent.blur(el)
}

async function fillValidForm() {
  change(input('Họ và tên'), 'Nguyễn Văn Khách')
  change(input('Số điện thoại'), '+84 912 345 678')
  await waitFor(() => expect(select('Tỉnh/Thành phố').disabled).toBe(false))
  change(select('Tỉnh/Thành phố'), '1')
  change(select('Phường/Xã'), '4')
  change(input('Địa chỉ chi tiết'), '12 Phố Test')
}

const ADMIN: User = { id: 'a1', email: 'admin@example.com', fullName: 'Quản Trị', phone: null, role: 'ADMIN', emailVerified: true, passwordChangeRequired: false }

beforeEach(() => {
  auth.current = { user: null, loading: false }
  resetAfterOrder.mockReset()
  refresh.mockReset().mockImplementation(async () => auth.current.user)
  logout.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  sessionStorage.clear()
  localStorage.clear()
})

describe('CheckoutPage', () => {
  it('ward options depend on the province and reset when it changes', async () => {
    renderCheckout()
    await waitFor(() => expect(select('Tỉnh/Thành phố').disabled).toBe(false))
    expect(select('Tỉnh/Thành phố').options).toHaveLength(35) // placeholder + 34
    expect(select('Phường/Xã').disabled).toBe(true)

    change(select('Tỉnh/Thành phố'), '1')
    expect(within(select('Phường/Xã')).getByRole('option', { name: 'Phường Ba Đình' })).toBeTruthy()
    change(select('Phường/Xã'), '4')
    expect(select('Phường/Xã').value).toBe('4')

    change(select('Tỉnh/Thành phố'), '79')
    expect(select('Phường/Xã').value).toBe('')
    expect(within(select('Phường/Xã')).queryByRole('option', { name: 'Phường Ba Đình' })).toBeNull()
  })

  it('sends only ids and quantities, normalized phone, and the same idempotency key on retry', async () => {
    const place = vi
      .spyOn(api, 'placeOrder')
      .mockRejectedValueOnce(new ApiError('Không kết nối được máy chủ. Vui lòng thử lại.', 0))
      .mockResolvedValueOnce(order)
    renderCheckout()
    await fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/ }))
    expect(await screen.findByText('Không kết nối được máy chủ. Vui lòng thử lại.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/ }))

    await waitFor(() => expect(place).toHaveBeenCalledTimes(2))
    const [first, second] = place.mock.calls.map((c) => c[0])
    expect(first.items).toEqual([{ productId: 7, quantity: 2 }])
    expect(first).toMatchObject({ phone: '0912345678', provinceCode: 1, wardCode: 4, customerName: 'Nguyễn Văn Khách' })
    expect(JSON.stringify(first)).not.toMatch(/price|total/i)
    expect(second.idempotencyKey).toBe(first.idempotencyKey)

    const where = JSON.parse((await screen.findByTestId('where')).textContent!)
    // Guest: straight to the tracking link, remembered in this browser, form draft cleared
    expect(where.path).toBe(`/don-hang/HL261013ABCD?t=${GUEST_TOKEN}`)
    expect(where.state).toEqual({ justPlaced: true })
    expect(readRecentOrders()).toMatchObject([{ code: 'HL261013ABCD', token: GUEST_TOKEN }])
    expect(sessionStorage.getItem('hatlanh_checkout_draft_v1')).toBeNull()
    expect(resetAfterOrder).toHaveBeenCalledOnce()
  })

  it('goes back to the cart with the shortages when stock ran out', async () => {
    const shortage = { productId: 7, name: 'Hạt chia Úc', requested: 2, available: 1 }
    vi.spyOn(api, 'placeOrder').mockRejectedValue(
      new ApiError('Một số sản phẩm không còn đủ hàng', 409, {}, 'OUT_OF_STOCK', { items: [shortage] }),
    )
    renderCheckout()
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/ }))

    const where = JSON.parse((await screen.findByTestId('where')).textContent!)
    expect(where).toEqual({ path: '/gio-hang', state: { shortages: [shortage] } })
    expect(resetAfterOrder).not.toHaveBeenCalled()
  })

  it('keeps what a guest typed when they go to sign in and come back', async () => {
    const first = renderCheckout()
    fireEvent.change(input('Họ và tên'), { target: { value: 'Khách Đã Nhập' } })
    first.unmount()
    auth.current = {
      user: { id: 'u1', email: 'an@example.com', fullName: 'Trần An', phone: '0987654321', role: 'CUSTOMER', emailVerified: true, passwordChangeRequired: false },
      loading: false,
    }
    renderCheckout()
    expect((input('Họ và tên') as HTMLInputElement).value).toBe('Khách Đã Nhập')
    expect((input('Số điện thoại') as HTMLInputElement).value).toBe('0987654321')
  })

  it('offers sign-in to guests without blocking checkout', () => {
    renderCheckout()
    expect(screen.getByRole('link', { name: 'Đăng nhập để điền nhanh thông tin' }).getAttribute('href')).toBe(
      '/dang-nhap?next=%2Fthanh-toan',
    )
    expect(screen.getByRole('button', { name: /Đặt hàng/ })).toBeTruthy()
  })

  it('prefills name, email and phone for a signed-in user', () => {
    auth.current = {
      user: { id: 'u1', email: 'an@example.com', fullName: 'Trần An', phone: '0987654321', role: 'CUSTOMER', emailVerified: true, passwordChangeRequired: false },
      loading: false,
    }
    renderCheckout()
    expect((input('Họ và tên') as HTMLInputElement).value).toBe('Trần An')
    expect((input('Số điện thoại') as HTMLInputElement).value).toBe('0987654321')
    expect((input('Email (không bắt buộc)') as HTMLInputElement).value).toBe('an@example.com')
  })

  it('checks the session again when the page opens', () => {
    renderCheckout()
    expect(refresh).toHaveBeenCalled()
  })

  it('opens the order in the account when the server saved it there, even if this tab thought it was a guest', async () => {
    // Signed in from another tab: the cookie is valid, this tab still has user = null
    refresh.mockResolvedValue(ADMIN)
    vi.spyOn(api, 'placeOrder').mockResolvedValue({ code: 'HL2610196CGX', total: 288_000 } as Order)
    renderCheckout()
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/ }))

    const where = JSON.parse((await screen.findByTestId('where')).textContent!)
    expect(where).toEqual({ path: '/tai-khoan/don-hang/HL2610196CGX', state: { justPlaced: true } })
  })

  it('falls back to the lookup page (never the login page) when no session is found after all', async () => {
    refresh.mockResolvedValue(null)
    vi.spyOn(api, 'placeOrder').mockResolvedValue({ code: 'HL2610196CGX', total: 288_000 } as Order)
    renderCheckout()
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/ }))

    const where = JSON.parse((await screen.findByTestId('where')).textContent!)
    expect(where).toEqual({ path: '/tra-cuu-don-hang?code=HL2610196CGX', state: { placedCode: 'HL2610196CGX' } })
  })

  it('says which account the order will be saved to, with a way out', () => {
    auth.current = { user: ADMIN, loading: false }
    renderCheckout()
    expect(screen.getByText(/Đơn sẽ được lưu vào tài khoản/).textContent).toContain('Quản Trị (admin@example.com)')
    fireEvent.click(screen.getByRole('button', { name: 'Không phải bạn? Đăng xuất' }))
    expect(logout).toHaveBeenCalled()
  })

  it('shows no account line to a guest', () => {
    renderCheckout()
    expect(screen.queryByText(/Đơn sẽ được lưu vào tài khoản/)).toBeNull()
  })

  it('marks the five required fields, not email and note, and explains the *', () => {
    renderCheckout()
    for (const label of ['Họ và tên', 'Số điện thoại', 'Địa chỉ chi tiết']) {
      expect(input(label).getAttribute('aria-required')).toBe('true')
    }
    expect(select('Tỉnh/Thành phố').getAttribute('aria-required')).toBe('true')
    expect(select('Phường/Xã').getAttribute('aria-required')).toBe('true')
    expect(input('Email (không bắt buộc)').hasAttribute('aria-required')).toBe(false)
    expect(screen.getByLabelText('Ghi chú (không bắt buộc)').hasAttribute('aria-required')).toBe(false)
    expect(screen.getByText(/là thông tin bắt buộc/)).toBeTruthy()
  })
})
