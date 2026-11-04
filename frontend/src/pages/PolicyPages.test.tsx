// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, Navigate, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { formatPolicyVersion } from '../lib/siteInfo'
import { ContactPage, ReturnPolicyPage, ShippingPolicyPage, TermsPage } from './PolicyPages'

// The server's PolicyVersion.CURRENT, as /api/site hands it out
vi.mock('../lib/siteInfo', async (importActual) => ({
  ...(await importActual<typeof import('../lib/siteInfo')>()),
  useSiteInfo: () => ({ siteUrl: '', business: {}, policyVersion: '2026-11-03' }),
}))

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})
afterEach(cleanup)

function Where() {
  const { pathname, hash } = useLocation()
  return <output data-testid="where">{pathname + hash}</output>
}

/** The same policy routes as main.tsx, redirects included */
function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/chinh-sach-doi-tra', element: <ReturnPolicyPage /> },
      { path: '/chinh-sach-van-chuyen', element: <ShippingPolicyPage /> },
      { path: '/dieu-khoan-giao-dich', element: <><TermsPage /><Where /></> },
      { path: '/dieu-khoan-su-dung', element: <Navigate to="/dieu-khoan-giao-dich" replace /> },
      { path: '/chinh-sach-bao-mat', element: <Navigate to="/dieu-khoan-giao-dich#bao-mat" replace /> },
      { path: '/lien-he', element: <ContactPage /> },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

const PAGES = ['/chinh-sach-doi-tra', '/chinh-sach-van-chuyen', '/dieu-khoan-giao-dich', '/lien-he']

describe('policy pages', () => {
  it.each(PAGES)('%s shows the final text, no draft marker or internal note', (path) => {
    const { container } = renderAt(path)
    const text = container.textContent ?? ''
    expect(text).toContain('Cập nhật lần cuối: 03/11/2026')
    for (const hidden of ['Bản nháp', 'CẦN ĐIỀN', 'AGENT', 'Tên chủ sở hữu', '[link:']) expect(text).not.toContain(hidden)
  })

  it('dates the pages from the server policy version only', () => {
    expect(formatPolicyVersion('2026-11-03')).toBe('03/11/2026')
    expect(formatPolicyVersion(undefined)).toBeNull()
    expect(formatPolicyVersion('03/11/2026')).toBeNull()
  })

  it('links the phone, the email and the fanpage', () => {
    renderAt('/lien-he')
    expect(screen.getByRole('link', { name: '0898 98 68 21' }).getAttribute('href')).toBe('tel:0898986821')
    expect(screen.getByRole('link', { name: 'hatlanhstore@gmail.com' }).getAttribute('href')).toBe('mailto:hatlanhstore@gmail.com')
    const fanpage = screen.getByRole('link', { name: /facebook\.com/ })
    expect(fanpage.getAttribute('target')).toBe('_blank')
    expect(fanpage.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByRole('link', { name: 'Tra cứu đơn hàng' }).getAttribute('href')).toBe('/tra-cuu-don-hang')
  })

  it('turns [link: …] into links inside the site', () => {
    renderAt('/chinh-sach-van-chuyen')
    expect(screen.getByRole('link', { name: 'Chính sách đổi trả và Đồng kiểm' }).getAttribute('href')).toBe('/chinh-sach-doi-tra')
  })

  it('puts the privacy policy in part B (#bao-mat) of the terms page; Telegram (no customer data) is not a third party', () => {
    const { container } = renderAt('/dieu-khoan-giao-dich')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Điều khoản giao dịch chung và Chính sách bảo mật')
    const privacy = container.querySelector('#bao-mat')!
    expect(privacy.textContent).toBe('Phần B. Chính sách bảo mật')
    expect(privacy.closest('section')!.textContent).not.toContain('Telegram')
  })

  it('lists every data right with its response time, and concrete retention periods', () => {
    const { container } = renderAt('/dieu-khoan-giao-dich')
    const privacy = container.querySelector('#bao-mat')!.closest('section')!.textContent ?? ''
    for (const right of ['hạn chế xử lý', 'Phản đối', 'Khiếu nại', 'Rút lại sự đồng ý', 'Yêu cầu xoá dữ liệu'])
      expect(privacy).toContain(right)
    for (const time of ['02 ngày làm việc', 'chỉnh sửa dữ liệu: trong 10 ngày', 'phản đối xử lý: trong 15 ngày', 'Xoá dữ liệu: trong 20 ngày'])
      expect(privacy).toContain(time)
    expect(privacy).not.toContain('thời gian cần thiết')
    expect(privacy).not.toContain('TODO')
  })

  it('does not treat visiting the site as agreeing, and applies changes only to later orders', () => {
    const { container } = renderAt('/dieu-khoan-giao-dich')
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/truy cập[^.]*đồng nghĩa/)
    expect(text).toContain('chỉ áp dụng cho các đơn hàng đặt từ ngày có hiệu lực đó trở đi')
  })

  it('states one shipping rule, the one the checkout applies: standard delivery free on every order', () => {
    const { container } = renderAt('/chinh-sach-van-chuyen')
    const text = container.textContent ?? ''
    expect(text).not.toContain('Hoặc:')
    expect(text).toContain('Giao Tiêu chuẩn toàn quốc: MIỄN PHÍ cho mọi đơn hàng, không phân biệt giá trị đơn, khối lượng hay địa chỉ')
    expect(text).toContain('Phí vận chuyển tính theo cước phí thực tế của ứng dụng giao hàng')
    // No threshold and no capped express support any more
    expect(text).not.toMatch(/500\.000|30\.000|Hỗ trợ tối đa/)
  })

  it('keeps the 72-hour limit for transport damage, wrong or missing items, and quality defects until the expiry date', () => {
    const { container } = renderAt('/chinh-sach-doi-tra')
    const text = container.textContent ?? ''
    expect(text).toMatch(/Hư hỏng do vận chuyển, giao sai[^:]*thiếu số lượng[^:]*: trong vòng 03 ngày \(72 giờ\)/)
    expect(text).toMatch(/Lỗi chất lượng[^:]*mốc, hôi dầu[^:]*: Hạt Lành tiếp nhận cho đến hết hạn sử dụng/)
    // Unchanged until the owner hears from a lawyer
    expect(text).toContain('Khách hàng thay đổi ý định mua hàng (không muốn mua nữa).')
  })

  it('sends the old addresses to the merged page', async () => {
    renderAt('/dieu-khoan-su-dung')
    expect((await screen.findByTestId('where')).textContent).toBe('/dieu-khoan-giao-dich')
    cleanup()
    renderAt('/chinh-sach-bao-mat')
    expect((await screen.findByTestId('where')).textContent).toBe('/dieu-khoan-giao-dich#bao-mat')
  })
})
