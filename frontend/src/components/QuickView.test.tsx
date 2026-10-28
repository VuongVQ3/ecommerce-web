// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, type ProductDetail } from '../lib/api'
import { quickViewDetails } from '../lib/quickView'
import QuickViewHost from './QuickView'

vi.mock('../cart/CartContext', () => ({
  useCart: () => ({ view: null, addItem: vi.fn(), openDrawer: vi.fn(), count: 0, getQuantity: () => 0, setQuantity: vi.fn() }),
}))
vi.mock('./Toast', () => ({ useToast: () => vi.fn() }))

const LONG_DESCRIPTION = Array.from(
  { length: 40 },
  (_, i) => `Mục ${i + 1}:\nHạt mắc ca Đắk Lắk nứt vỏ sẵn, sấy nóng, bùi béo, giòn, đóng hũ PET kín.`,
).join('\n\n')

const detail = (over: Partial<ProductDetail> = {}): ProductDetail => ({
  id: 7,
  name: 'Mắc ca nứt vỏ',
  slug: 'mac-ca-nut-vo',
  shortDescription: 'Mắc ca Đắk Lắk nứt vỏ sẵn, bùi béo.',
  description: LONG_DESCRIPTION,
  origin: 'Đắk Lắk',
  price: 250_000,
  regularPrice: 250_000,
  discountPercent: null,
  promotionEndsAt: null,
  weightGrams: 500,
  active: true,
  stockStatus: { status: 'IN_STOCK', quantity: null },
  maxPurchasable: 10,
  imageUrl: null,
  images: [],
  nutritionPer100g: { calories: 700, protein: 8, fat: 75, carbs: 14, fiber: 9 },
  category: { id: 1, name: 'Hạt dinh dưỡng', slug: 'hat-dinh-duong' },
  ...over,
})

function open(product: ProductDetail) {
  vi.spyOn(api, 'product').mockResolvedValue(product)
  const router = createMemoryRouter([{ path: '*', element: <QuickViewHost /> }], {
    initialEntries: [`/san-pham?xem=${product.slug}`],
  })
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  cleanup()
  quickViewDetails.clear()
  vi.restoreAllMocks()
})

/** Classes that clamp at every size (the clamp must only apply to the full-height desktop frame) */
const alwaysClamped = (el: Element) => [...el.classList].filter((c) => /^line-clamp-/.test(c))

describe('QuickView', () => {
  it('shows the short description, not the full one', async () => {
    open(detail())
    const summary = await screen.findByTestId('quick-view-summary')
    expect(summary.textContent).toBe('Mắc ca Đắk Lắk nứt vỏ sẵn, bùi béo.')
    expect(screen.queryByText(/Mục 1/)).toBeNull()
    expect(screen.queryByText(/Mục 40/)).toBeNull()
  })

  it('shows a valid short description of exactly 160 characters in full, without "…"', async () => {
    const short = 'MẮC CA ĐẮK LẮK LOẠI ĐẠI NỨT VỎ SẴN, SẤY NÓNG GIÒN BÙI. HẠT TO ĐỀU, BÉO NGẬY, ĐÓNG HŨ PET KÍN. QUÀ TẶNG ĐẶC SẢN TÂY NGUYÊN CHO GIA ĐÌNH VÀ ĐỐI TÁC DỊP TẾT NGUYÊN'
    expect(short).toHaveLength(160)
    open(detail({ shortDescription: short }))
    const summary = await screen.findByTestId('quick-view-summary')
    expect(summary.textContent).toBe(short)
    expect(summary.textContent).not.toContain('…')
    // Desktop: at most a five-line safety net (160 characters take at most five lines there, measured in Chrome),
    // and only on the full-height frame; phones and low windows scroll instead and never clamp
    expect(summary.classList.contains('qv-full:line-clamp-5')).toBe(true)
    expect(alwaysClamped(summary)).toEqual([])
  })

  it('fits its content up to the screen height; desktop: the button under the nutrition, the link on its row', async () => {
    // An over-long short description (a stale answer) is clamped on a tall desktop window; elsewhere it may scroll
    open(detail({ shortDescription: 'Rất dài '.repeat(200).trim() }))
    const addToCart = await screen.findByRole('button', { name: /Thêm vào giỏ/ })
    expect(screen.getByTestId('quick-view-summary').classList.contains('qv-full:line-clamp-5')).toBe(true)

    const dialog = screen.getByRole('dialog')
    // No fixed height: as tall as the content, at most the screen minus its margins, scrolling only past that
    expect(dialog.className).not.toMatch(/(^|\s)(md:)?h-\[/)
    expect(dialog.className).toContain('md:max-h-[calc(100dvh-3rem)]')
    expect(dialog.className).toContain('max-h-[90dvh]')

    // Reading order: nutrition, then the button; desktop: the bar is the details column's last cell, no border,
    // the link ends the button's row (hidden below md, where it sits above the bar)
    const nutrition = screen.getByRole('heading', { name: /Dinh dưỡng/ })
    expect(nutrition.compareDocumentPosition(addToCart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const bar = addToCart.closest('.shrink-0')!
    expect(bar.className).toContain('md:col-start-2')
    expect(bar.className).toContain('md:border-0')
    const [mobileLink, desktopLink] = screen.getAllByRole('link', { name: /Xem trang chi tiết/ })
    expect(bar.contains(desktopLink)).toBe(true)
    expect(desktopLink.parentElement?.className).toContain('max-md:hidden')
    expect(mobileLink.parentElement?.className).toContain('md:hidden')
    expect(desktopLink.getAttribute('href')).toBe('/san-pham/mac-ca-nut-vo')
  })

  it('phones: a title row, the scrolling content, then a buy bar with quantity and button on one row', async () => {
    open(detail())
    const addToCart = await screen.findByRole('button', { name: /Thêm vào giỏ/ })
    const dialog = screen.getByRole('dialog')
    const scroller = dialog.querySelector('.overflow-y-auto')!

    // Title row: its own row above the photo, outside the scrolling part (stays put), never over the photo
    const titleRow = screen.getByRole('button', { name: 'Đóng xem nhanh' }).parentElement!
    expect(scroller.contains(titleRow)).toBe(false)
    expect(titleRow.className).toMatch(/(^|\s)bg-cream(\s|$)/)
    expect(titleRow.compareDocumentPosition(scroller) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(scroller.querySelector('[aria-roledescription=carousel]')?.parentElement?.className).toContain(
      'aspect-[4/3] max-h-[40vh]',
    )

    // Buy bar: after the scrolling part, outside it, a thin top border and room for the home indicator
    const bar = addToCart.closest('.shrink-0')!
    expect(scroller.contains(bar)).toBe(false)
    expect(scroller.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bar.className).toContain('border-t')
    expect(bar.className).toContain('env(safe-area-inset-bottom)')
    // Quantity and button on one row below md (no wrapping), the button taking the rest
    const row = addToCart.closest('.items-center')!
    expect(row.className).toContain('md:flex-wrap')
    expect(row.className).not.toMatch(/(^|\s)flex-wrap/)
    expect(row.querySelector('[class*="flex-[1_0_auto]"]')?.contains(addToCart)).toBe(true)

    // The link and the per-order note end the scrolling part, above the bar
    const [mobileLink] = screen.getAllByRole('link', { name: /Xem trang chi tiết/ })
    expect(scroller.contains(mobileLink)).toBe(true)
    const notes = screen.getAllByText('Tối đa 10 sản phẩm cho mỗi đơn.')
    expect(notes.some((n) => scroller.contains(n) && n.closest('.md\\:hidden'))).toBe(true)
    expect(notes.filter((n) => bar.contains(n)).every((n) => n.className.includes('max-md:hidden'))).toBe(true)
  })

  it('never squeezes the button: one-line label, and a row that wraps the link instead', async () => {
    open(detail())
    const addToCart = await screen.findByRole('button', { name: /Thêm vào giỏ/ })
    expect(addToCart.className).toMatch(/(^|\s)whitespace-nowrap(\s|$)/)

    const row = addToCart.closest('.items-center')!
    // Desktop: the row wraps (quantity + button + link), so a narrow modal moves the link down
    expect(row.className).toContain('md:flex-wrap')
    // The button's slot grows but never shrinks, with its label as the basis (flex-1 would mean basis 0: no wrap)
    const slot = addToCart.parentElement!
    expect(slot.className).toContain('flex-[1_0_auto]')
    expect(slot.className).not.toMatch(/(^|\s)(min-w-0|flex-1)(\s|$)/)
    // The link is not pushed right: on its own line it starts at the left
    const desktopLink = screen.getAllByRole('link', { name: /Xem trang chi tiết/ })[1]
    expect(desktopLink.parentElement?.className).not.toContain('ml-auto')
  })

  it('"Hết hàng" keeps its label on one line too', async () => {
    open(detail({ stockStatus: { status: 'OUT_OF_STOCK', quantity: null }, maxPurchasable: 0 }))
    const soldOut = await screen.findByRole('button', { name: 'Hết hàng' })
    expect(soldOut.className).toMatch(/(^|\s)whitespace-nowrap(\s|$)/)
  })

  it('a sold-out product shows "Hết hàng" in the bar, the link after it', async () => {
    open(detail({ stockStatus: { status: 'OUT_OF_STOCK', quantity: null }, maxPurchasable: 0 }))
    const soldOut = await screen.findByRole('button', { name: 'Hết hàng' })
    expect((soldOut as HTMLButtonElement).disabled).toBe(true)
    expect(soldOut.closest('.shrink-0')).not.toBeNull()
    const links = screen.getAllByRole('link', { name: /Xem trang chi tiết/ })
    expect(soldOut.compareDocumentPosition(links[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/Tối đa/)).toBeNull()
  })

  it('shows no paragraph when there is no description at all', async () => {
    open(detail({ shortDescription: null }))
    await screen.findByRole('button', { name: /Thêm vào giỏ/ })
    expect(screen.queryByTestId('quick-view-summary')).toBeNull()
  })
})
