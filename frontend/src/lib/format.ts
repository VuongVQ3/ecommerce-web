const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

/** 185000 -> "185.000₫" (whole dong, no space before the symbol). */
export const formatPrice = (value: number) => `${vnd.format(value)}₫`

/** ISO timestamp -> "14/10/2026 01:26", Vietnam time (one format across the shop and the back office). */
export const formatDateTime = (iso: string) => formatAdminDateTime(iso)

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

const VN = 'Asia/Ho_Chi_Minh'
const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function vnParts(iso: string | Date) {
  const parts = partsFormatter.formatToParts(typeof iso === 'string' ? new Date(iso) : iso)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { day: get('day'), month: get('month'), year: get('year'), hour: get('hour'), minute: get('minute') }
}

/** Back office date-times, always Vietnam time: "14/10/2026 01:26". */
export function formatAdminDateTime(iso: string | Date): string {
  const p = vnParts(iso)
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

/** Compact form for narrow tables: "14/10 01:26". */
export function formatShortDateTime(iso: string | Date): string {
  const p = vnParts(iso)
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`
}

/** "vừa xong", "5 phút trước", "2 giờ trước", "3 ngày trước", then the date. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ngày trước`
  return formatAdminDateTime(iso).slice(0, 10)
}
