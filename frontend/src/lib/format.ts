const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

/** 185000 -> "185.000₫" (whole dong, no space before the symbol). */
export const formatPrice = (value: number) => `${vnd.format(value)}₫`

const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })

/** ISO timestamp -> "13 thg 10, 2026 14:05" (viewer's time zone). */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

export const formatWeight =(grams: number) => (grams >= 1000 ? `${grams / 1000}kg` : `${grams}g`)
