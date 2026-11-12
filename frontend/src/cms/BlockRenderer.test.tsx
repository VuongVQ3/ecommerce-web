// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BlockRenderer from './BlockRenderer'
import type { DeliveredBlock } from './pageTypes'
import { allowedTypes, newBlock } from './registry'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const renderBlocks = (blocks: DeliveredBlock[]) =>
  render(
    <MemoryRouter>
      <BlockRenderer blocks={blocks} />
    </MemoryRouter>,
  )

const md = (markdown: string, html: string) => ({ markdown, html })

describe('BlockRenderer', () => {
  it('renders each known type with its resolved props', () => {
    renderBlocks([
      { id: 'h', type: 'hero', props: { headline: 'Tết sum vầy', subline: 'Giỏ quà', ctaLabel: 'Xem ngay', ctaLink: '/san-pham' } },
      { id: 't', type: 'rich-text', props: { markdown: md('**Đậm**', '<p><strong>Đậm</strong></p>') } },
      {
        id: 'g',
        type: 'product-grid',
        props: { title: 'Bán chạy', products: [{ id: 1, slug: 'mac-ca', name: 'Mắc ca', price: 189000, image: null }] },
      },
      {
        id: 'q',
        type: 'faq',
        props: { title: 'Hỏi đáp', items: [{ id: 'f1', model: 'faq', title: 'Giao hàng', data: { question: 'Bao lâu?', answer: md('2 ngày', '<p>2 ngày</p>') } }] },
      },
      { id: 'c', type: 'cta', props: { text: 'Đặt sỉ', buttonLabel: 'Liên hệ', link: 'https://zalo.me/1', style: 'dark' } },
      {
        id: 'p',
        type: 'pdf-download',
        props: { label: 'Bảng giá', asset: { id: 'a', kind: 'PDF', title: 'Giá', url: 'x', alt: null, width: null, height: null, pageCount: 3, renditions: {}, stableUrl: '/files/a/gia.pdf' } },
      },
      { id: 'm', type: 'marquee', props: { items: ['Freeship', 'Quà Tết'] } },
    ])
    expect(screen.getByRole('heading', { name: 'Tết sum vầy' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Xem ngay' }).getAttribute('href')).toBe('/san-pham')
    expect(screen.getByText('Đậm').tagName).toBe('STRONG')
    expect(screen.getByRole('link', { name: /Mắc ca/ }).getAttribute('href')).toBe('/san-pham/mac-ca')
    expect(screen.getByText('189.000₫')).toBeTruthy()
    expect(screen.getByText('Bao lâu?')).toBeTruthy()
    const cta = screen.getByRole('link', { name: 'Liên hệ' })
    expect(cta.getAttribute('target')).toBe('_blank')
    expect(screen.getByRole('link', { name: /Bảng giá/ }).getAttribute('href')).toBe('/files/a/gia.pdf')
    expect(screen.getByText('PDF · 3 trang')).toBeTruthy()
    expect(screen.getByRole('marquee', { name: 'Freeship, Quà Tết' })).toBeTruthy()
  })

  it('an unknown type is skipped (and logged) without breaking the rest of the page', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderBlocks([
      { id: 'x', type: 'carousel-3d', props: { anything: 1 } },
      { id: 't', type: 'rich-text', props: { markdown: md('Vẫn hiện', '<p>Vẫn hiện</p>') } },
      { id: 'bad', type: 'hero', props: {} },
    ])
    expect(screen.getByText('Vẫn hiện')).toBeTruthy()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('carousel-3d'))
  })

  it('containers lay their children out in columns; empty blocks render nothing', () => {
    const { container } = renderBlocks([
      {
        id: 'k',
        type: 'container',
        props: { columns: '3' },
        children: [
          { id: 'k1', type: 'rich-text', props: { markdown: md('Cột 1', '<p>Cột 1</p>') } },
          { id: 'k2', type: 'spacer', props: { size: 'lg' } },
        ],
      },
      { id: 'e', type: 'product-grid', props: { products: [] } },
    ])
    const grid = container.querySelector('[data-block="container"] > div')!
    expect(grid.className).toContain('md:grid-cols-3')
    expect(within(grid as HTMLElement).getByText('Cột 1')).toBeTruthy()
    expect(container.querySelector('[data-block="product-grid"]')!.childElementCount).toBe(0)
  })
})

describe('registry', () => {
  it('templates limit the palette; containers never nest', () => {
    expect(allowedTypes('content')).toEqual(['rich-text', 'image', 'image-text', 'faq', 'pdf-download', 'cta'])
    expect(allowedTypes('landing')).toContain('container')
    expect(allowedTypes('landing', true)).not.toContain('container')
    const block = newBlock('product-grid')
    expect(block.props).toEqual({ mode: 'category', limit: 8 })
    expect(block.id).toMatch(/^b[a-z0-9]+$/)
    expect(newBlock('container').children).toEqual([])
  })
})
