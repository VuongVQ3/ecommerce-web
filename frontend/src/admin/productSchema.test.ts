import { describe, expect, it } from 'vitest'
import { EMPTY_PRODUCT, NUTRITION_INCOMPLETE, PRICE_REQUIRED, productSchema, productSchemaFor, toInput } from './productSchema'

const valid = {
  ...EMPTY_PRODUCT,
  name: 'Hạt điều',
  categoryId: '1',
  description: 'Giòn, béo',
  price: '185.000',
  weightGrams: '500',
  calories: '553',
  protein: '18,2',
  fat: '44',
  carbs: '30',
  fiber: '3.3',
}

describe('productSchema', () => {
  it('takes a short description of up to 160 characters, trimmed; empty is allowed', () => {
    expect(toInput(productSchema.parse({ ...valid, shortDescription: '  Giòn, bùi.  ' })).shortDescription).toBe('Giòn, bùi.')
    expect(toInput(productSchema.parse({ ...valid, shortDescription: '   ' })).shortDescription).toBe('')
    expect(productSchema.safeParse({ ...valid, shortDescription: 'đ'.repeat(160) }).success).toBe(true)
    // Spaces around do not count
    expect(productSchema.safeParse({ ...valid, shortDescription: ` ${'đ'.repeat(160)} ` }).success).toBe(true)
    const tooLong = productSchema.safeParse({ ...valid, shortDescription: 'đ'.repeat(161) })
    expect(tooLong.success).toBe(false)
    expect(tooLong.error!.issues).toEqual([expect.objectContaining({ path: ['shortDescription'], message: 'Mô tả ngắn tối đa 160 ký tự' })])
  })

  it('accepts Vietnamese number formats and converts them', () => {
    const parsed = productSchema.parse(valid)
    const input = toInput(parsed)
    expect(input.price).toBe(185000)
    expect(input.protein).toBe(18.2)
    expect(input.fiber).toBe(3.3)
    expect(input.lowStockThreshold).toBe(10)
    expect(input.categoryId).toBe(1)
    expect(input.slug).toBe('')
  })

  it('rejects bad slugs, missing fields and out-of-range values', () => {
    const result = productSchema.safeParse({ ...valid, slug: 'Có Dấu', price: '500', description: ' ', categoryId: '' })
    expect(result.success).toBe(false)
    const fields = result.error!.issues.map((i) => i.path[0])
    expect(fields).toEqual(expect.arrayContaining(['slug', 'price', 'description', 'categoryId']))
    expect(productSchema.safeParse({ ...valid, protein: '120' }).success).toBe(false)
  })

  it('lets a hidden product wait for its price and nutrition, but not with half a nutrition table', () => {
    const draft = { ...EMPTY_PRODUCT, name: 'Mật ong hoa cà phê', categoryId: '5', description: 'Mật ong.' }
    expect(EMPTY_PRODUCT.weightGrams).toBe('500')
    const parsed = productSchema.parse(draft)
    const input = toInput(parsed)
    expect(input.price).toBeNull()
    expect([input.calories, input.protein, input.fat, input.carbs, input.fiber]).toEqual([null, null, null, null, null])
    expect(input.weightGrams).toBe(500)
    expect(input.sortOrder).toBeNull()

    const half = productSchema.safeParse({ ...draft, protein: '20' })
    expect(half.success).toBe(false)
    expect(new Set(half.error!.issues.map((i) => i.message))).toEqual(new Set([NUTRITION_INCOMPLETE]))
    expect(half.error!.issues.map((i) => i.path[0])).toEqual(['calories', 'fat', 'carbs', 'fiber'])
  })

  it('a product on sale must keep a price', () => {
    const draft = { ...EMPTY_PRODUCT, name: 'Hạt điều', categoryId: '1', description: 'Giòn' }
    const result = productSchemaFor(true).safeParse(draft)
    expect(result.success).toBe(false)
    expect(result.error!.issues).toEqual([expect.objectContaining({ path: ['price'], message: PRICE_REQUIRED })])
    expect(productSchemaFor(true).safeParse({ ...draft, price: '185.000' }).success).toBe(true)
    // A price that is there must still be valid
    expect(productSchema.safeParse({ ...draft, price: '500' }).success).toBe(false)
  })
})
