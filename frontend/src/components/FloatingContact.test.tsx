// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteInfo } from '../lib/siteInfo'
import FloatingContact from './FloatingContact'

const site = vi.hoisted(() => ({ info: null as SiteInfo | null }))
vi.mock('../lib/siteInfo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/siteInfo')>()),
  useSiteInfo: () => site.info,
}))

afterEach(() => {
  cleanup()
  site.info = null
})

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <FloatingContact /> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

const links = () => screen.queryAllByRole('link').map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')])

describe('FloatingContact column', () => {
  it('always shows Facebook, Shopee, Zalo and TikTok; unconfigured ones lead to /lien-he', () => {
    renderAt('/')
    expect(screen.getByRole('navigation', { name: 'Liên hệ và mạng xã hội' })).toBeTruthy()
    expect(links()).toEqual([
      ['Hạt Lành trên Facebook: đang cập nhật, xem trang Liên hệ', '/lien-he'],
      ['Hạt Lành trên Shopee: đang cập nhật, xem trang Liên hệ', '/lien-he'],
      ['Hạt Lành trên Zalo: đang cập nhật, xem trang Liên hệ', '/lien-he'],
      ['Hạt Lành trên TikTok: đang cập nhật, xem trang Liên hệ', '/lien-he'],
    ])
  })

  it('uses the configured links, then Messenger and the hotline when set', () => {
    site.info = {
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
    renderAt('/san-pham')
    expect(links()).toEqual([
      ['Hạt Lành trên Facebook', 'https://www.facebook.com/hatlanh'],
      ['Hạt Lành trên Shopee', 'https://shopee.vn/hatlanh'],
      ['Hạt Lành trên Zalo', 'https://zalo.me/0912345678'],
      ['Hạt Lành trên TikTok', 'https://www.tiktok.com/@hatlanh'],
      ['Nhắn Messenger cho Hạt Lành', 'https://m.me/hatlanh'],
      ['Gọi Hạt Lành 0912 345 678', 'tel:0912345678'],
    ])
  })

  it('is on every storefront page, including checkout, but not in the back office', () => {
    renderAt('/thanh-toan')
    expect(screen.getAllByRole('link')).toHaveLength(4)
    cleanup()
    renderAt('/admin/don-hang')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
