import { describe, expect, it } from 'vitest'
import { EMPTY_PRODUCT, productSchema, toInput } from './productSchema'

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
})
