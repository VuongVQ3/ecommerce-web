// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Layout from './Layout'

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false, logout: vi.fn() }) }))
vi.mock('../cart/CartContext', () => ({
  useCart: () => ({ count: 0, openDrawer: vi.fn(), drawerOpen: false, closeDrawer: vi.fn() }),
}))
const site = vi.hoisted(() => ({ business: { hotline: '0912 345 678', registrationNumber: '0123456789' } as Record<string, string> }))
vi.mock('../lib/siteInfo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/siteInfo')>()),
  useSiteInfo: () => ({ siteUrl: 'https://example.test', business: site.business }),
}))

afterEach(cleanup)

function renderLayout(path = '/') {
  const router = createMemoryRouter(
    [{ element: <Layout />, children: [{ path: '*', element: <h1>Trang</h1> }] }],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

describe('Layout', () => {
  it('shows the published contact details and the policy links', () => {
    renderLayout()
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: '0898 98 68 21' }).getAttribute('href')).toBe('tel:0898986821')
    expect(within(footer).getByRole('link', { name: 'hatlanhstore@gmail.com' }).getAttribute('href')).toBe('mailto:hatlanhstore@gmail.com')
    const fanpage = within(footer).getByRole('link', { name: /Fanpage Facebook/ })
    expect(fanpage.getAttribute('href')).toBe('https://www.facebook.com/profile.php?id=61596137600993')
    expect(fanpage.getAttribute('target')).toBe('_blank')
    expect(fanpage.getAttribute('rel')).toBe('noopener noreferrer')
    expect(footer.textContent).toContain('Thứ 2 - Thứ 7, 08:30 - 17:00')
    expect(footer.textContent).toContain('© 2026 Hạt Lành · Chung cư Đạt Gia - Số 43, đường Cây Keo, Phường Tam Bình, Tp Hồ Chí Minh')

    const policy = ['Chính sách đổi trả', 'Chính sách vận chuyển', 'Điều khoản giao dịch chung', 'Liên hệ'].map(
      (name) => within(footer).getByRole('link', { name }).getAttribute('href'),
    )
    expect(policy).toEqual(['/chinh-sach-doi-tra', '/chinh-sach-van-chuyen', '/dieu-khoan-giao-dich', '/lien-he'])
    expect(within(footer).queryByRole('link', { name: 'Điều khoản sử dụng' })).toBeNull()
    expect(within(footer).queryByRole('link', { name: 'Chính sách bảo mật' })).toBeNull()
  })

  it('shows the owner details only once configured on the server', () => {
    renderLayout()
    const footer = screen.getByRole('contentinfo')
    // Configured in this test: the registration number only
    expect(footer.textContent).toContain('Mã số ĐKKD: 0123456789')
    expect(footer.textContent).not.toContain('Chủ sở hữu:')
    expect(within(footer).queryByRole('link', { name: /Bộ Công Thương/ })).toBeNull()
  })

  it('keeps the cart drawer button (no hover preview) on touch screens', () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    renderLayout()
    expect(screen.getByRole('button', { name: 'Giỏ hàng trống' }).getAttribute('aria-haspopup')).toBe('dialog')
    expect(screen.queryByRole('button', { name: 'Xem nhanh giỏ hàng' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Xem nhanh giỏ hàng', hidden: true })).toBeNull()
  })

  it('opens the mobile menu, keeps focus inside and closes on Escape', () => {
    renderLayout()
    const opener = screen.getByRole('button', { name: 'Mở menu' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Menu' })
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Đóng menu' }))
    expect(within(dialog).getByRole('link', { name: 'Đăng nhập' })).toBeTruthy()

    // Shift+Tab from the first element wraps to the last one inside the menu
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(dialog.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
