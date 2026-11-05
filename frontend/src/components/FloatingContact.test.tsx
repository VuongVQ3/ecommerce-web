// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteInfo } from '../lib/siteInfo'
import { ComboboxField } from './ComboboxField'
import FloatingContact from './FloatingContact'

const site = vi.hoisted(() => ({ info: null as SiteInfo | null }))
vi.mock('../lib/siteInfo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/siteInfo')>()),
  useSiteInfo: () => site.info,
}))
// Compact or wide screen (min-width: 1280px)
const screenSize = vi.hoisted(() => ({ wide: true }))
vi.mock('../lib/media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/media')>()),
  useMediaQuery: (query: string) => (query === '(min-width: 1280px)' ? screenSize.wide : false),
}))

const FULL: SiteInfo = {
  siteUrl: 'https://example.test',
  business: {},
  contact: { zaloUrl: 'https://zalo.me/0912345678', messengerUrl: 'https://m.me/hatlanh', hotline: '0912 345 678' },
  social: {
    facebookUrl: 'https://www.facebook.com/hatlanh',
    shopeeUrl: 'https://shopee.vn/hatlanh',
    zaloUrl: 'https://zalo.me/0912345678',
    tiktokUrl: 'https://www.tiktok.com/@hatlanh',
  },
}

afterEach(() => {
  cleanup()
  site.info = null
  screenSize.wide = true
})

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <FloatingContact /> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

const links = () => screen.queryAllByRole('link').map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')])

describe('FloatingContact', () => {
  it('shows Facebook, Zalo, Messenger and the hotline, top to bottom; no Shopee or TikTok', () => {
    site.info = FULL
    renderAt('/san-pham')
    expect(links()).toEqual([
      ['Hạt Lành trên Facebook', 'https://www.facebook.com/profile.php?id=61596137600993'],
      ['Nhắn Zalo cho Hạt Lành', 'https://zalo.me/0898986821'],
      ['Nhắn Messenger cho Hạt Lành', 'https://m.me/hatlanh'],
      ['Gọi Hạt Lành 0898 98 68 21', 'tel:0898986821'],
    ])
    expect(screen.queryByRole('button', { name: 'Liên hệ Hạt Lành' })).toBeNull()
  })

  it('uses the published details whatever the server config; Messenger only when configured', () => {
    // The server still sends its own (older) links: they are not used any more
    site.info = { ...FULL, contact: { zaloUrl: 'https://zalo.me/0365314221', messengerUrl: null, hotline: '0365 314 221' } }
    renderAt('/')
    expect(links().map((l) => l[1])).toEqual(['https://www.facebook.com/profile.php?id=61596137600993', 'https://zalo.me/0898986821', 'tel:0898986821'])
    cleanup()

    // /api/site unavailable: the same three channels
    site.info = null
    renderAt('/')
    expect(links()).toHaveLength(3)
  })

  it('phones: one button opens the channels; Esc closes and gives focus back', () => {
    screenSize.wide = false
    site.info = FULL
    renderAt('/')
    const button = screen.getByRole('button', { name: 'Liên hệ Hạt Lành' })
    const list = document.getElementById(button.getAttribute('aria-controls')!)!
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(list.hasAttribute('inert')).toBe(true)

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(list.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Hạt Lành trên Facebook' }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)

    fireEvent.click(button)
    fireEvent.pointerDown(document.body)
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('is on every storefront page but not in the back office', () => {
    site.info = FULL
    renderAt('/thanh-toan')
    expect(screen.getAllByRole('link')).toHaveLength(4)
    // "Lên đầu trang" shares the corner; hidden (aria-hidden, out of the Tab order) at the top of the page
    const toTop = document.querySelector<HTMLButtonElement>('button[aria-label="Lên đầu trang"]')!
    expect(toTop.getAttribute('aria-hidden')).toBe('true')
    expect(toTop.tabIndex).toBe(-1)
    cleanup()
    renderAt('/admin/don-hang')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(document.querySelector('button[aria-label="Lên đầu trang"]')).toBeNull()
  })
})

describe('FloatingContact and an open combobox list', () => {
  it('steps aside while a ComboboxField list is open, and comes back when it closes', async () => {
    site.info = FULL
    screenSize.wide = false
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: (
            <>
              <ComboboxField
                label="Phường/Xã"
                placeholder="Chọn phường/xã"
                options={[{ value: '1', label: 'Phường An Đông' }]}
                value=""
                onChange={() => {}}
              />
              <FloatingContact />
            </>
          ),
        },
      ],
      { initialEntries: ['/thanh-toan'] },
    )
    render(<RouterProvider router={router} />)
    const nav = screen.getByRole('navigation', { name: 'Liên hệ và mạng xã hội' })
    const box = screen.getByRole('combobox', { name: 'Phường/Xã' })
    expect(nav.hasAttribute('data-hidden')).toBe(false)
    expect(screen.getByRole('button', { name: 'Liên hệ Hạt Lành' })).toBeTruthy()

    fireEvent.focus(box)
    await waitFor(() => expect(nav.hasAttribute('data-hidden')).toBe(true))
    // Not read, not focusable, not clickable (inert; visibility: hidden in CSS)
    expect(nav.getAttribute('aria-hidden')).toBe('true')
    expect(nav.hasAttribute('inert')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Liên hệ Hạt Lành' })).toBeNull()

    fireEvent.keyDown(box, { key: 'Escape' })
    await waitFor(() => expect(nav.hasAttribute('data-hidden')).toBe(false))
    expect(nav.hasAttribute('aria-hidden')).toBe(false)
    expect(nav.hasAttribute('inert')).toBe(false)
    expect(screen.getByRole('button', { name: 'Liên hệ Hạt Lành' })).toBeTruthy()
  })
})
