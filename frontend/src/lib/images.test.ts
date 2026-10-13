import { describe, expect, it } from 'vitest'
import { cloudinaryUrl, stockLabel } from './images'
import { slugify, SLUG_PATTERN } from './slug'

describe('cloudinaryUrl', () => {
  it('inserts format, quality and size after /image/upload/', () => {
    expect(cloudinaryUrl('https://res.cloudinary.com/demo/image/upload/v17/hat-lanh/products/abc.jpg', 400)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,w_400,h_400/v17/hat-lanh/products/abc.jpg',
    )
    expect(cloudinaryUrl('https://res.cloudinary.com/demo/image/upload/a.png', 320, 180)).toContain('w_320,h_180/a.png')
  })

  it('leaves other URLs untouched', () => {
    expect(cloudinaryUrl('https://example.com/image/upload/a.png', 400)).toBe('https://example.com/image/upload/a.png')
    expect(cloudinaryUrl('/images/a.png', 400)).toBe('/images/a.png')
  })
})

describe('stockLabel', () => {
  it('never shows an exact count unless stock is very low', () => {
    expect(stockLabel({ status: 'IN_STOCK', quantity: null })).toBe('Còn hàng')
    expect(stockLabel({ status: 'LOW_STOCK', quantity: 3 })).toBe('Chỉ còn 3')
    expect(stockLabel({ status: 'OUT_OF_STOCK', quantity: null })).toBe('Hết hàng')
    expect(stockLabel({ status: 'IN_STOCK', quantity: null }, false)).toBe('Ngừng kinh doanh')
  })
})

describe('slugify', () => {
  it('matches the backend rules', () => {
    expect(slugify('Hạt Điều Rang Muối')).toBe('hat-dieu-rang-muoi')
    expect(slugify('  Óc chó (Mỹ) – 500g!! ')).toBe('oc-cho-my-500g')
    expect(slugify('Đậu phộng')).toBe('dau-phong')
    expect(SLUG_PATTERN.test(slugify('Hạnh nhân Úc'))).toBe(true)
    expect(SLUG_PATTERN.test('Hat-dieu')).toBe(false)
  })
})
