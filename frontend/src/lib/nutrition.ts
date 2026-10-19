import type { ProductSummary } from './api'

/** Below this many products with figures a nutrition comparison means little: it is not offered */
export const MIN_PRODUCTS_WITH_NUTRITION = 3

/** Products whose nutrition facts are known (the rest have none yet) */
export const withNutrition = (products: ProductSummary[]) =>
  products.filter((p) => p.protein != null && p.calories != null)
