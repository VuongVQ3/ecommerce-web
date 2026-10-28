// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ProductImageSlider from './ProductImageSlider'

const photo = (n: number) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/hat-lanh/products/p${n}.jpg`, width: 800, height: 800 })
const shown = () => document.querySelector('[data-fly-source] img, [data-fly-source] [role="img"]')

afterEach(cleanup)

describe('ProductImageSlider', () => {
  it('one photo: square, no arrows, no dots, loaded at once as an 800×800 copy', () => {
    render(<ProductImageSlider name="Mắc ca" images={[photo(1)]} categorySlug="hat-dinh-duong" nav="dots" />)
    expect(screen.queryByRole('button', { name: 'Ảnh sau' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Chọn ảnh' })).toBeNull()
    const img = screen.getByRole('img', { name: 'Mắc ca' }) as HTMLImageElement
    expect(img.getAttribute('loading')).toBe('eager')
    expect(img.src).toContain('c_fill,w_800,h_800')
  })

  it('quick view: below md the whole photo, contained on the frame, the dots and counter in a strip under it', () => {
    const images = [1, 2, 3].map(photo)
    render(
      <ProductImageSlider
        name="Mắc ca"
        images={images}
        categorySlug="hat-dinh-duong"
        nav="quickview"
        frame="aspect-[4/3] max-h-[40vh] bg-cream md:aspect-square md:max-h-none md:bg-white"
      />,
    )
    const img = document.querySelector('[aria-roledescription=slide] img') as HTMLImageElement
    // Phones load the uncropped copy; from md the same square crop as before
    const source = img.parentElement!.querySelector('source')!
    expect(img.parentElement!.tagName).toBe('PICTURE')
    expect(source.getAttribute('media')).toBe('(max-width: 767.98px)')
    expect(source.getAttribute('srcset')).toContain('c_limit,w_1200,h_1200')
    expect(img.src).toContain('c_fill,w_800,h_800')
    // Contained (not cropped) below md, covering the square frame from md
    expect(img.className).toContain('max-md:object-contain')
    expect(img.className).toContain('md:object-cover')
    expect(img.className).not.toMatch(/(^|\s)object-cover(\s|$)/)
    // The frame is the theme's cream below md; a strip under the photo keeps the dots and counter off it
    const frame = screen.getByRole('region', { name: 'Ảnh sản phẩm Mắc ca' }).parentElement!
    expect(frame.className).toContain('bg-cream')
    expect(frame.className).not.toMatch(/(^|\s)bg-white(\s|$)/)
    expect(img.closest('[aria-roledescription=slide]')!.className).toContain('max-md:pb-8')
    expect(screen.getByRole('group', { name: 'Chọn ảnh' }).className).toMatch(/(^|\s)bottom-1(\s|$)/)
    expect(screen.getByText('1/3').className).toContain('bottom-1.5')
  })

  it('elsewhere (product page): the square crop, covered, on white, as before', () => {
    render(<ProductImageSlider name="Mắc ca" images={[photo(1), photo(2)]} categorySlug="hat-dinh-duong" nav="thumbnails" />)
    const img = document.querySelector('[aria-roledescription=slide] img') as HTMLImageElement
    expect(img.parentElement!.tagName).not.toBe('PICTURE')
    expect(img.className).toMatch(/(^|\s)object-cover(\s|$)/)
    expect(screen.getByRole('region', { name: 'Ảnh sản phẩm Mắc ca' }).parentElement!.className).toContain('aspect-square bg-white')
  })

  it('no photo: the category placeholder', () => {
    render(<ProductImageSlider name="Mật ong" images={[]} categorySlug="trai-cay-say-dac-san" nav="dots" />)
    expect(screen.getByRole('img', { name: 'Mật ong' }).textContent).toBe('🥭')
  })

  it('five photos (of more): arrows, dots, keys; the rest lazy; the shown one flies to the cart', () => {
    const images = [1, 2, 3, 4, 5, 6].map(photo)
    render(<ProductImageSlider name="Mắc ca" images={images} categorySlug="hat-dinh-duong" nav="dots" />)
    expect(screen.getAllByRole('button', { name: /^Ảnh \d$/ })).toHaveLength(5)
    expect(screen.getByText('1/5')).toBeTruthy()
    expect((screen.getByRole('img', { name: 'Mắc ca – ảnh 2', hidden: true }) as HTMLImageElement).getAttribute('loading')).toBe('lazy')
    expect((screen.getByRole('button', { name: 'Ảnh trước' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Ảnh sau' }))
    expect(screen.getByText('2/5')).toBeTruthy()
    expect(shown()?.getAttribute('alt')).toBe('Mắc ca – ảnh 2')

    const carousel = screen.getByRole('region', { name: 'Ảnh sản phẩm Mắc ca' })
    fireEvent.keyDown(carousel, { key: 'ArrowRight' })
    fireEvent.keyDown(carousel, { key: 'ArrowRight' })
    expect(screen.getByText('4/5')).toBeTruthy()
    fireEvent.keyDown(carousel, { key: 'ArrowLeft' })
    expect(screen.getByText('3/5')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh 5' }))
    expect(screen.getByText('5/5')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Ảnh sau' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('thumbnails pick the photo and show which one is current', () => {
    render(<ProductImageSlider name="Hạt điều" images={[1, 2, 3].map(photo)} categorySlug="hat-dinh-duong" nav="thumbnails" />)
    const third = screen.getByRole('button', { name: 'Xem ảnh 3' })
    fireEvent.click(third)
    expect(third.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Xem ảnh 1' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('3/3')).toBeTruthy()
    expect(third.querySelector('img')?.getAttribute('src')).toContain('w_160,h_160')
  })
})
