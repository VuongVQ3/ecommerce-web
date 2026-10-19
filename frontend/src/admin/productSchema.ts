import { z } from 'zod'
import type { AdminProduct, ProductInput } from '../lib/adminApi'
import { SLUG_PATTERN } from '../lib/slug'

const whole = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Vui lòng nhập ${label}`)
    .refine((v) => /^\d+$/.test(v.replace(/[.\s]/g, '')), `${label[0].toUpperCase()}${label.slice(1)} phải là số nguyên`)
    .refine((v) => {
      const n = Number(v.replace(/[.\s]/g, ''))
      return n >= min && n <= max
    }, `Trong khoảng ${min.toLocaleString('vi-VN')} – ${max.toLocaleString('vi-VN')}`)

/** Optional nutrition figure: empty, or a number up to `max` */
const decimal = (max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+([.,]\d+)?$/.test(v), 'Số không hợp lệ')
    .refine((v) => v === '' || Number(v.replace(',', '.')) <= max, `Tối đa ${max}`)

/** Empty, or what `whole` accepts (same messages) */
const optionalWhole = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+$/.test(v.replace(/[.\s]/g, '')), `${label[0].toUpperCase()}${label.slice(1)} phải là số nguyên`)
    .refine((v) => {
      if (v === '') return true
      const n = Number(v.replace(/[.\s]/g, ''))
      return n >= min && n <= max
    }, `Trong khoảng ${min.toLocaleString('vi-VN')} – ${max.toLocaleString('vi-VN')}`)

export const NUTRIENTS = ['calories', 'protein', 'fat', 'carbs', 'fiber'] as const
export const NUTRITION_INCOMPLETE = 'Nhập đủ 5 chỉ số hoặc để trống cả 5'
export const PRICE_REQUIRED = 'Nhập giá bán trước khi hiện sản phẩm'

const fields = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên sản phẩm').max(200, 'Tối đa 200 ký tự'),
  slug: z
    .string()
    .trim()
    .max(200, 'Tối đa 200 ký tự')
    .refine((v) => v === '' || SLUG_PATTERN.test(v), 'Chỉ chữ thường không dấu, số và dấu "-" (VD: hat-dieu-rang)'),
  categoryId: z.string().min(1, 'Vui lòng chọn danh mục'),
  description: z.string().trim().min(1, 'Vui lòng nhập mô tả').max(2000, 'Tối đa 2000 ký tự'),
  origin: z.string().trim().max(100, 'Tối đa 100 ký tự'),
  // Empty while the product is being prepared (hidden); see productSchemaFor
  price: optionalWhole('giá', 1000, 100_000_000),
  weightGrams: whole('khối lượng', 1, 100_000),
  calories: decimal(1000),
  protein: decimal(100),
  fat: decimal(100),
  carbs: decimal(100),
  fiber: decimal(100),
  lowStockThreshold: whole('ngưỡng', 0, 100_000),
  // Storefront order, smaller first; empty = after the others
  sortOrder: optionalWhole('thứ tự', 0, 100_000),
})

/**
 * Form values are strings (what inputs hold); `toInput` converts them for the API. Nutrition is optional but all
 * five or none (a half table would mislead). A product on sale must keep a price; a hidden one may have none yet.
 */
export const productSchemaFor = (onSale: boolean) =>
  fields.superRefine((v, ctx) => {
    const empty = NUTRIENTS.filter((k) => v[k] === '')
    if (empty.length > 0 && empty.length < NUTRIENTS.length) {
      for (const k of empty) ctx.addIssue({ code: 'custom', path: [k], message: NUTRITION_INCOMPLETE })
    }
    if (onSale && v.price === '') ctx.addIssue({ code: 'custom', path: ['price'], message: PRICE_REQUIRED })
  })

/** A new or hidden product */
export const productSchema = productSchemaFor(false)

export type ProductForm = z.infer<typeof fields>

export const EMPTY_PRODUCT: ProductForm = {
  name: '',
  slug: '',
  categoryId: '',
  description: '',
  origin: '',
  price: '',
  // Every pack of the shop is 500 g
  weightGrams: '500',
  calories: '',
  protein: '',
  fat: '',
  carbs: '',
  fiber: '',
  lowStockThreshold: '10',
  sortOrder: '',
}

const int = (v: string) => Number(v.replace(/[.\s]/g, ''))
const dec = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
const intOrNull = (v: string) => (v.trim() === '' ? null : int(v))

export function toInput(f: ProductForm): ProductInput {
  return {
    name: f.name.trim(),
    slug: f.slug.trim(),
    categoryId: Number(f.categoryId),
    description: f.description.trim(),
    origin: f.origin.trim(),
    price: intOrNull(f.price),
    weightGrams: int(f.weightGrams),
    calories: dec(f.calories),
    protein: dec(f.protein),
    fat: dec(f.fat),
    carbs: dec(f.carbs),
    fiber: dec(f.fiber),
    lowStockThreshold: int(f.lowStockThreshold),
    sortOrder: intOrNull(f.sortOrder),
  }
}

const text = (n: number | null) => (n === null ? '' : String(n))

export function toForm(p: AdminProduct): ProductForm {
  return {
    name: p.name,
    slug: p.slug,
    categoryId: String(p.categoryId),
    description: p.description,
    origin: p.origin ?? '',
    // 0 = no price yet
    price: p.price ? String(p.price) : '',
    weightGrams: String(p.weightGrams),
    calories: text(p.calories),
    protein: text(p.protein),
    fat: text(p.fat),
    carbs: text(p.carbs),
    fiber: text(p.fiber),
    lowStockThreshold: String(p.lowStockThreshold),
    sortOrder: String(p.sortOrder),
  }
}

/** Signed change in percent, rounded: 100 → 1000 is +900. */
export const priceChangePercent = (oldPrice: number, newPrice: number) => Math.round(((newPrice - oldPrice) / oldPrice) * 100)

/** A change of more than half the old price is probably a typo (an extra or missing zero): ask first. */
export const isBigPriceChange = (oldPrice: number, newPrice: number) =>
  oldPrice > 0 && Math.abs(newPrice - oldPrice) > oldPrice / 2
