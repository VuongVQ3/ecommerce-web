// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeliveredPage } from '../cms/pageTypes'
import { resetInitialData } from '../lib/initialData'
import CmsPage from './CmsPage'

const page = (path: string, text: string): DeliveredPage => ({
  id: 'p1',
  path,
  template: 'content',
  title: 'Giới thiệu',
  version: 2,
  publishedAt: '2026-11-12T00:00:00Z',
  properties: { seoTitle: 'Về Hạt Lành', seoDescription: null },
  regions: { main: [{ id: 't', type: 'rich-text', props: { markdown: { markdown: text, html: `<p>${text}</p>` } } }] },
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <CmsPage /> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  resetInitialData()
  document.getElementById('initial-data')?.remove()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CmsPage', () => {
  it('shows the published page at the address', async () => {
    const fetch = vi.fn((_input: RequestInfo | URL) => Promise.resolve(json(200, page('/gioi-thieu', 'Câu chuyện của chúng tôi'))))
    vi.stubGlobal('fetch', fetch)
    renderAt('/gioi-thieu/')
    expect(await screen.findByText('Câu chuyện của chúng tôi')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Giới thiệu' })).toBeTruthy()
    expect(String(fetch.mock.calls[0][0])).toContain('/api/content/pages?path=%2Fgioi-thieu')
    expect(document.title).toBe('Về Hạt Lành | Hạt Lành')
  })

  it('an address without a page is the usual "page not found"', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json(404, { code: 'PAGE_NOT_FOUND' }))))
    renderAt('/khong-co')
    expect(await screen.findByText(/Không tìm thấy trang/)).toBeTruthy()
  })

  it('uses the content the server embedded on first load, without asking again', async () => {
    const script = document.createElement('script')
    script.type = 'application/json'
    script.id = 'initial-data'
    script.textContent = JSON.stringify({ type: 'cmsPage', slug: '/khuyen-mai', data: page('/khuyen-mai', 'Giảm 10%') })
    document.body.appendChild(script)
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    renderAt('/khuyen-mai')
    expect(await screen.findByText('Giảm 10%')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })
})
