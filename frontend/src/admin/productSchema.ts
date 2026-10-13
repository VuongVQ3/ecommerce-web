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

const decimal = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Bắt buộc')
    .refine((v) => /^\d+([.,]\d+)?$/.test(v), 'Số không hợp lệ')
    .refine((v) => Number(v.replace(',', '.')) <= max, `Tối đa ${max}`)

/** Form values are strings (what inputs hold); `toInput` converts them for the API. */
export const productSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên sản phẩm').max(200, 'Tối đa 200 ký tự'),
  slug: z
    .string()
    .trim()
    .max(200, 'Tối đa 200 ký tự')
    .refine((v) => v === '' || SLUG_PATTERN.test(v), 'Chỉ chữ thường không dấu, số và dấu "-" (VD: hat-dieu-rang)'),
  categoryId: z.string().min(1, 'Vui lòng chọn danh mục'),
  description: z.string().trim().min(1, 'Vui lòng nhập mô tả').max(2000, 'Tối đa 2000 ký tự'),
  origin: z.string().trim().max(100, 'Tối đa 100 ký tự'),
  price: whole('giá', 1000, 100_000_000),
  weightGrams: whole('khối lượng', 1, 100_000),
  calories: decimal(1000),
  protein: decimal(100),
  fat: decimal(100),
  carbs: decimal(100),
  fiber: decimal(100),
  lowStockThreshold: whole('ngưỡng', 0, 100_000),
})

export type ProductForm = z.infer<typeof productSchema>

export const EMPTY_PRODUCT: ProductForm = {
  name: '',
  slug: '',
  categoryId: '',
  description: '',
  origin: '',
  price: '',
  weightGrams: '',
  calories: '',
  protein: '',
  fat: '',
  carbs: '',
  fiber: '',
  lowStockThreshold: '10',
}

const int = (v: string) => Number(v.replace(/[.\s]/g, ''))
const dec = (v: string) => Number(v.replace(',', '.'))

export function toInput(f: ProductForm): ProductInput {
  return {
    name: f.name.trim(),
    slug: f.slug.trim(),
    categoryId: Number(f.categoryId),
    description: f.description.trim(),
    origin: f.origin.trim(),
    price: int(f.price),
    weightGrams: int(f.weightGrams),
    calories: dec(f.calories),
    protein: dec(f.protein),
    fat: dec(f.fat),
    carbs: dec(f.carbs),
    fiber: dec(f.fiber),
    lowStockThreshold: int(f.lowStockThreshold),
  }
}

export function toForm(p: AdminProduct): ProductForm {
  return {
    name: p.name,
    slug: p.slug,
    categoryId: String(p.categoryId),
    description: p.description,
    origin: p.origin ?? '',
    price: String(p.price),
    weightGrams: String(p.weightGrams),
    calories: String(p.calories),
    protein: String(p.protein),
    fat: String(p.fat),
    carbs: String(p.carbs),
    fiber: String(p.fiber),
    lowStockThreshold: String(p.lowStockThreshold),
  }
}
