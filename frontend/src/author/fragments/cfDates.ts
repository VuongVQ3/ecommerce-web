/** Vietnam has no daylight saving time: always UTC+7. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000

/** "2026-11-12T03:00:00Z" → "2026-11-12T10:00" for a datetime-local input (Vietnam time); "" for nothing. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''
  return new Date(time + VN_OFFSET_MS).toISOString().slice(0, 16)
}

/** "2026-11-12T10:00" (Vietnam time) → "2026-11-12T10:00:00+07:00"; null for an empty input. */
export function fromLocalInput(local: string): string | null {
  return local ? `${local}:00+07:00` : null
}
