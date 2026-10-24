import type { Nutrition, ProductSummary } from './api'

/**
 * The five figures per 100g, in table order: Vietnamese name, English name, unit. One source for the product page
 * table and the admin form (the card chips such as "7.9g đạm" stay short and are not built from this).
 */
export const NUTRIENTS: readonly { key: keyof Nutrition; vi: string; en: string; unit: string }[] = [
  { key: 'calories', vi: 'Năng lượng', en: 'Energy', unit: 'kcal' },
  { key: 'protein', vi: 'Chất đạm', en: 'Protein', unit: 'g' },
  { key: 'fat', vi: 'Chất béo', en: 'Fat', unit: 'g' },
  { key: 'carbs', vi: 'Chất bột đường', en: 'Carb', unit: 'g' },
  { key: 'fiber', vi: 'Chất xơ', en: 'Fiber', unit: 'g' },
]

const nutrient = (key: keyof Nutrition) => NUTRIENTS.find((n) => n.key === key)!

/** Product page table: "Chất bột đường (Carb)"; the unit is shown with the value */
export const nutrientLabel = (key: keyof Nutrition) => `${nutrient(key).vi} (${nutrient(key).en})`

/** Admin form field: "Chất bột đường – Carb (g)" */
export const nutrientFieldLabel = (key: keyof Nutrition) =>
  `${nutrient(key).vi} – ${nutrient(key).en} (${nutrient(key).unit})`

/** Below this many products with figures a nutrition comparison means little: it is not offered */
export const MIN_PRODUCTS_WITH_NUTRITION = 3

/** Products whose nutrition facts are known (the rest have none yet) */
export const withNutrition = (products: ProductSummary[]) =>
  products.filter((p) => p.protein != null && p.calories != null)
