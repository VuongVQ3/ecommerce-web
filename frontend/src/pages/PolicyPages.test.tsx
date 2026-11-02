// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, Navigate, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ContactPage, ReturnPolicyPage, ShippingPolicyPage, TermsPage } from './PolicyPages'

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
    expect(text).toContain('Cập nhật lần cuối: 02/11/2026')
    for (const hidden of ['Bản nháp', 'CẦN ĐIỀN', 'AGENT', 'Tên chủ sở hữu', '[link:']) expect(text).not.toContain(hidden)
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

  it('puts the privacy policy in part B (#bao-mat) of the terms page, Telegram among the third parties', () => {
    const { container } = renderAt('/dieu-khoan-giao-dich')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Điều khoản giao dịch chung và Chính sách bảo mật')
    const privacy = container.querySelector('#bao-mat')!
    expect(privacy.textContent).toBe('Phần B. Chính sách bảo mật')
    expect(privacy.closest('section')!.textContent).toContain('Thông báo đơn hàng nội bộ: Telegram.')
  })

  it('sends the old addresses to the merged page', async () => {
    renderAt('/dieu-khoan-su-dung')
    expect((await screen.findByTestId('where')).textContent).toBe('/dieu-khoan-giao-dich')
    cleanup()
    renderAt('/chinh-sach-bao-mat')
    expect((await screen.findByTestId('where')).textContent).toBe('/dieu-khoan-giao-dich#bao-mat')
  })
})
