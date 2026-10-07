const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

/** 185000 -> "185.000₫" (whole dong, no space before the symbol). */
export const formatPrice = (value: number) => `${vnd.format(value)}₫`

export const formatWeight = (grams: number) => (grams >= 1000 ? `${grams / 1000}kg` : `${grams}g`)
