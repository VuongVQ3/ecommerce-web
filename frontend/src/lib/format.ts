const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

/** 185000 -> "185.000₫" (whole dong, no space before the symbol). */
export const formatPrice = (value: number) => `${vnd.format(value)}₫`

/** ISO timestamp -> "14/10/2026 01:26", Vietnam time (one format across the shop and the back office). */
export const formatDateTime = (iso: string) => formatAdminDateTime(iso)

export const formatWeight =(grams: number) => (grams >= 1000 ? `${grams / 1000}kg` : `${grams}g`)

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

/**
 * End of a promotion. ends_at is exclusive: a promotion chosen "đến hết 16/10" ends at 17/10 00:00 Vietnam time, so a
 * midnight end shows the day before it: "Đến hết 16/10/2026". An end in the middle of a day (ended early) shows that
 * moment: "16/10/2026 15:30".
 *
 * @param year false for short storefront texts ("Đến hết 16/10")
 * @param prefix false for a bare date in a "from – to" range ("16/10/2026")
 */
export function formatPromotionEnd(endsAt: string, { year = true, prefix = true }: { year?: boolean; prefix?: boolean } = {}): string {
  const end = vnParts(endsAt)
  const day = (p: ReturnType<typeof vnParts>) => `${p.day}/${p.month}${year ? `/${p.year}` : ''}`
  if (end.hour !== '00' || end.minute !== '00') return `${day(end)} ${end.hour}:${end.minute}`
  const last = day(vnParts(new Date(Date.parse(endsAt) - 1)))
  return prefix ? `Đến hết ${last}` : last
}
