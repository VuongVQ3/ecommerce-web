// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteInfo } from '../lib/siteInfo'
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
  it('shows the configured channels in order, top to bottom', () => {
    site.info = FULL
    renderAt('/san-pham')
    expect(links()).toEqual([
      ['Hạt Lành trên Facebook', 'https://www.facebook.com/hatlanh'],
      ['Hạt Lành trên Shopee', 'https://shopee.vn/hatlanh'],
      ['Hạt Lành trên Zalo', 'https://zalo.me/0912345678'],
      ['Hạt Lành trên TikTok', 'https://www.tiktok.com/@hatlanh'],
      ['Nhắn Messenger cho Hạt Lành', 'https://m.me/hatlanh'],
      ['Gọi Hạt Lành 0912 345 678', 'tel:0912345678'],
    ])
    expect(screen.queryByRole('button', { name: 'Liên hệ Hạt Lành' })).toBeNull()
  })

  it('always shows Facebook, Shopee, Zalo and TikTok; unconfigured ones lead to /lien-he', () => {
    site.info = { ...FULL, contact: { zaloUrl: null, messengerUrl: null, hotline: null }, social: { ...FULL.social!, zaloUrl: null, tiktokUrl: null } }
    renderAt('/')
    expect(links()).toEqual([
      ['Hạt Lành trên Facebook', 'https://www.facebook.com/hatlanh'],
      ['Hạt Lành trên Shopee', 'https://shopee.vn/hatlanh'],
      ['Hạt Lành trên Zalo: đang cập nhật, xem trang Liên hệ', '/lien-he'],
      ['Hạt Lành trên TikTok: đang cập nhật, xem trang Liên hệ', '/lien-he'],
    ])
    cleanup()

    // Nothing configured, or /api/site unavailable: still the four icons
    site.info = null
    renderAt('/')
    expect(links().map((l) => l[1])).toEqual(['/lien-he', '/lien-he', '/lien-he', '/lien-he'])
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
    expect(screen.getAllByRole('link')).toHaveLength(6)
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
