const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

/** 185000 -> "185.000₫" (whole dong, no space before the symbol). */
export const formatPrice = (value: number) => `${vnd.format(value)}₫`

const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })

/** ISO timestamp -> "13 thg 10, 2026 14:05" (viewer's time zone). */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

export const formatWeight =(grams: number) => (grams >= 1000 ? `${grams / 1000}kg` : `${grams}g`)

const dayMonth = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })

/**
 * Last day of a promotion as dd/MM in Vietnam time. The end instant is exclusive: a promotion ending at midnight
 * on 1/11 runs "đến hết 31/10".
 */
export const formatLastDay = (endExclusiveIso: string) => {
  // Built from parts: some browsers format vi-VN day/month as "21-10"
  const parts = dayMonth.formatToParts(new Date(Date.parse(endExclusiveIso) - 1))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')}/${get('month')}`
}
