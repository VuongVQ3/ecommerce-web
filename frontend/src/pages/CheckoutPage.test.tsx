// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readRecentOrders } from '../lib/recentOrders'
import { ToastProvider } from '../components/Toast'
import { api, ApiError, type CartView, type Order, type User } from '../lib/api'
import CheckoutPage from './CheckoutPage'
import { UPDATED } from '../lib/policyDates'

const auth = vi.hoisted(() => ({ current: { user: null as User | null, loading: false } }))
// refresh(): what /me answers now (by default, the same as the context)
const refresh = vi.hoisted(() => vi.fn<() => Promise<User | null>>())
const logout = vi.hoisted(() => vi.fn())
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ ...auth.current, refresh, logout }) }))
const resetAfterOrder = vi.hoisted(() => vi.fn())
// /api/site: the current policy version (PolicyVersion.CURRENT on the server)
const CURRENT_POLICY = '2026-11-03'
vi.mock('../lib/siteInfo', async (importActual) => ({
  ...(await importActual<typeof import('../lib/siteInfo')>()),
  useSiteInfo: () => ({ siteUrl: '', business: {}, policyVersion: CURRENT_POLICY }),
}))

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
  // Free standard shipping on every order (the current setting)
  shippingFee: 0,
  amountToFreeShipping: 0,
  freeShippingThreshold: 0,
  total: 258_000,
  canCheckout: true,
  freeShippingForAll: true,
}
vi.mock('../cart/CartContext', () => ({ useCart: () => ({ view, loading: false, resetAfterOrder }) }))

const GUEST_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
const order = { code: 'HL261013ABCD', total: 258_000, accessToken: GUEST_TOKEN } as Order

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
const combo = (label: string) => screen.getByRole('combobox', { name: label }) as HTMLInputElement
const change = (el: HTMLElement, value: string) => {
  fireEvent.change(el, { target: { value } })
  fireEvent.blur(el)
}

/** Focus the box, type, Enter: picks the best match. */
function pick(label: string, text: string) {
  const box = combo(label)
  act(() => box.focus())
  fireEvent.change(box, { target: { value: text } })
  fireEvent.keyDown(box, { key: 'Enter' })
}

async function fillValidForm(tickPrivacy = true) {
  change(input('Họ và tên'), 'Nguyễn Văn Khách')
  change(input('Số điện thoại'), '+84 912 345 678')
  await waitFor(() => expect(combo('Tỉnh/Thành phố').disabled).toBe(false))
  pick('Tỉnh/Thành phố', 'ha noi')
  pick('Phường/Xã', 'ba dinh')
  act(() => combo('Phường/Xã').blur())
  change(input('Địa chỉ chi tiết'), '12 Phố Test')
  if (tickPrivacy) fireEvent.click(privacyBox())
}

const privacyBox = () => screen.getByRole('checkbox', { name: /Tôi đồng ý với Chính sách bảo mật/ }) as HTMLInputElement

const ADMIN: User = { id: 'a1', email: 'admin@example.com', fullName: 'Quản Trị', phone: null, role: 'ADMIN', emailVerified: true, passwordChangeRequired: false, hasPassword: true, privacyConsentRequired: false }

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
    await waitFor(() => expect(combo('Tỉnh/Thành phố').disabled).toBe(false))
    expect(combo('Phường/Xã').disabled).toBe(true)
    expect(combo('Phường/Xã').placeholder).toBe('Chọn tỉnh/thành phố trước')
    // Before typing: the popular three, then all the others
    act(() => combo('Tỉnh/Thành phố').focus())
    expect(screen.getAllByRole('option')).toHaveLength(34)
    expect(
      screen.getAllByRole('option').slice(0, 4).map((o) => o.textContent),
    ).toEqual(['Thành phố Hồ Chí Minh', 'Thành phố Hà Nội', 'Thành phố Đà Nẵng', 'Tỉnh An Giang'])

    pick('Tỉnh/Thành phố', 'ha noi')
    expect(combo('Tỉnh/Thành phố').value).toBe('Thành phố Hà Nội')
    expect(await screen.findByRole('option', { name: 'Phường Ba Đình' })).toBeTruthy()
    pick('Phường/Xã', 'ba dinh')
    expect(combo('Phường/Xã').value).toBe('Phường Ba Đình')

    pick('Tỉnh/Thành phố', 'hcm')
    expect(combo('Tỉnh/Thành phố').value).toBe('Thành phố Hồ Chí Minh')
    expect(combo('Phường/Xã').value).toBe('')
    expect(screen.queryByRole('option', { name: 'Phường Ba Đình' })).toBeNull()
  })

  it('"hcm" then Enter picks Hồ Chí Minh and moves on to its wards, A→Z without the prefix', async () => {
    renderCheckout()
    await waitFor(() => expect(combo('Tỉnh/Thành phố').disabled).toBe(false))
    pick('Tỉnh/Thành phố', 'hcm')
    expect(combo('Tỉnh/Thành phố').value).toBe('Thành phố Hồ Chí Minh')
    await waitFor(() => expect(document.activeElement).toBe(combo('Phường/Xã')))
    // Its list is open: one A→Z list, Phường and Xã mixed, Côn Đảo among the C names
    const wards = screen.getAllByRole('option').map((o) => o.textContent)
    expect(wards[0]).toBe('Phường An Đông')
    expect(wards.indexOf('Đặc khu Côn Đảo')).toBeGreaterThan(wards.indexOf('Phường Bình Thạnh'))
    fireEvent.change(combo('Phường/Xã'), { target: { value: 'an' } })
    expect(screen.getAllByRole('option')[0].textContent).toBe('Phường An Đông')
  })

  it('brings back the province and ward of the draft by name', async () => {
    sessionStorage.setItem('hatlanh_checkout_draft_v1', JSON.stringify({ provinceCode: '79', wardCode: '27316' }))
    renderCheckout()
    await waitFor(() => expect(combo('Tỉnh/Thành phố').value).toBe('Thành phố Hồ Chí Minh'))
    expect(combo('Phường/Xã').value).toBe('Phường An Đông')
    // A restored province does not grab the focus
    expect(document.activeElement).not.toBe(combo('Phường/Xã'))
  })

  it('shows the province error and keeps free text out of the form', async () => {
    renderCheckout()
    await waitFor(() => expect(combo('Tỉnh/Thành phố').disabled).toBe(false))
    const box = combo('Tỉnh/Thành phố')
    act(() => box.focus())
    fireEvent.change(box, { target: { value: 'khong co tinh nay' } })
    expect(screen.getByRole('option').textContent).toBe('Không tìm thấy “khong co tinh nay”')
    act(() => box.blur())
    expect(box.value).toBe('')
    expect(await screen.findByText('Vui lòng chọn tỉnh/thành phố')).toBeTruthy()
    expect(box.getAttribute('aria-invalid')).toBe('true')
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
    expect(first.acceptPrivacy).toBe(true)

    const where = JSON.parse((await screen.findByTestId('where')).textContent!)
    // Guest: straight to the tracking link, remembered in this browser, form draft cleared
    expect(where.path).toBe(`/don-hang/HL261013ABCD?t=${GUEST_TOKEN}`)
    expect(where.state).toEqual({ justPlaced: true })
    expect(readRecentOrders()).toMatchObject([{ code: 'HL261013ABCD', token: GUEST_TOKEN }])
    expect(sessionStorage.getItem('hatlanh_checkout_draft_v1')).toBeNull()
    expect(resetAfterOrder).toHaveBeenCalledOnce()
  })

  it('does not place the order until the privacy policy box is ticked, and links the terms next to the button', async () => {
    const place = vi.spyOn(api, 'placeOrder').mockResolvedValue(order)
    renderCheckout()
    await fillValidForm()
    fireEvent.click(privacyBox()) // untick again
    expect(privacyBox().checked).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/ }))
    expect(await screen.findByText('Bạn cần đồng ý với Chính sách bảo mật')).toBeTruthy()
    expect(place).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /Tôi đồng ý|Chính sách bảo mật/ }).getAttribute('href')).toBe('/dieu-khoan-giao-dich#bao-mat')
    expect(screen.getByRole('link', { name: /Điều khoản giao dịch chung/ }).getAttribute('href')).toBe('/dieu-khoan-giao-dich')
  })

  it('says under the total that standard shipping is free and express delivery in HCMC is charged, confirmed by phone', async () => {
    renderCheckout()
    const note = await screen.findByText(/Miễn phí giao hàng tiêu chuẩn toàn quốc\. Giao hỏa tốc nội thành TP\.HCM tính theo cước thực tế/)
    expect(note.textContent).toContain('nhân viên sẽ gọi báo phí trước khi gửi')
    expect(note.textContent).not.toMatch(/30\.000|500\.000/)
    const fee = screen.getByText('Phí giao hàng').parentElement!
    expect(fee.textContent).toBe('Phí giao hàngMiễn phí')
    expect(screen.getByRole('link', { name: /Chính sách vận chuyển/ }).getAttribute('target')).toBe('_blank')
    expect(screen.getByRole('link', { name: /Chính sách vận chuyển/ }).getAttribute('href')).toBe('/chinh-sach-van-chuyen')
  })

  it('below 1024px puts the order summary (fees, express note) above the privacy box and "Đặt hàng"', () => {
    // jsdom has no matchMedia: the narrow layout
    renderCheckout()
    const express = screen.getByText(/Giao hỏa tốc nội thành TP.HCM tính theo cước thực tế/)
    const total = screen.getByText('Tổng cộng')
    const button = screen.getByRole('button', { name: /Đặt hàng/ })
    const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect(follows(total, privacyBox())).toBe(true)
    expect(follows(express, privacyBox())).toBe(true)
    expect(follows(privacyBox(), button)).toBe(true)
    expect(screen.getAllByText('Tổng cộng')).toHaveLength(1)
  })

  it('does not ask an account that consented to the current policy again, and lets the server use that consent', async () => {
    auth.current = {
      user: { ...ADMIN, role: 'CUSTOMER', privacyConsentRequired: false, policyVersion: CURRENT_POLICY },
      loading: false,
    }
    const place = vi.spyOn(api, 'placeOrder').mockResolvedValue(order)
    renderCheckout()

    expect(screen.queryByRole('checkbox', { name: /Tôi đồng ý với Chính sách bảo mật/ })).toBeNull()
    expect(screen.getByText(/Đơn hàng được xử lý theo/).textContent).toMatch(/Chính sách bảo mật.*bạn đã đồng ý/)
    expect(screen.getByRole('link', { name: /Chính sách bảo mật/ }).getAttribute('href')).toBe('/dieu-khoan-giao-dich#bao-mat')
    await fillValidForm(false)
    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/ }))
    await waitFor(() => expect(place).toHaveBeenCalledOnce())
    expect(place.mock.calls[0][0].acceptPrivacy).toBeUndefined()
  })

  it('does not ask again because a policy page got a newer date: only the consent version counts', () => {
    // The shipping page now says 04/11/2026 (free shipping); the consent version is still the one this account agreed to
    expect(UPDATED.shipping > CURRENT_POLICY).toBe(true)
    auth.current = {
      user: { ...ADMIN, role: 'CUSTOMER', privacyConsentRequired: false, policyVersion: CURRENT_POLICY },
      loading: false,
    }
    renderCheckout()
    expect(screen.queryByRole('checkbox', { name: /Tôi đồng ý với Chính sách bảo mật/ })).toBeNull()
  })

  it('asks an account that consented to an older policy version, like a guest', () => {
    auth.current = {
      user: { ...ADMIN, role: 'CUSTOMER', privacyConsentRequired: false, policyVersion: '2026-01-01' },
      loading: false,
    }
    renderCheckout()
    expect(privacyBox().checked).toBe(false)
    expect(screen.queryByText(/Đơn hàng được xử lý theo/)).toBeNull()
  })

  it('starts with the privacy policy box unticked', () => {
    renderCheckout()
    expect(privacyBox().checked).toBe(false)
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
      user: { id: 'u1', email: 'an@example.com', fullName: 'Trần An', phone: '0987654321', role: 'CUSTOMER', emailVerified: true, passwordChangeRequired: false, hasPassword: true, privacyConsentRequired: false },
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
      user: { id: 'u1', email: 'an@example.com', fullName: 'Trần An', phone: '0987654321', role: 'CUSTOMER', emailVerified: true, passwordChangeRequired: false, hasPassword: true, privacyConsentRequired: false },
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
    expect(combo('Tỉnh/Thành phố').getAttribute('aria-required')).toBe('true')
    expect(combo('Phường/Xã').getAttribute('aria-required')).toBe('true')
    expect(input('Email (không bắt buộc)').hasAttribute('aria-required')).toBe(false)
    expect(screen.getByLabelText('Ghi chú (không bắt buộc)').hasAttribute('aria-required')).toBe(false)
    expect(screen.getByText(/là thông tin bắt buộc/)).toBeTruthy()
  })
})
