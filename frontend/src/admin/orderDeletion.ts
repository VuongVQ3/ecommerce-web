import type { OrderStatus } from '../lib/api'
import type { BulkDeleteResult } from '../lib/adminApi'

/** Only a cancelled or completed order can be deleted; an open one is cancelled first (its stock goes back then). */
export const isClosed = (status: OrderStatus) => status === 'CANCELLED' || status === 'COMPLETED'

export const NOT_CLOSED_HINT = 'Huỷ đơn trước rồi mới xoá'

/** The word typed to confirm. Both spellings, as Vietnamese keyboards put the accent on either vowel. */
export const CONFIRM_WORD = 'XOÁ'
export const isConfirmWord = (text: string) => ['XOÁ', 'XÓA'].includes(text.trim().normalize('NFC').toLocaleUpperCase('vi'))

/** "Đã xoá 3 đơn · bỏ qua 1 đơn: HL… (Huỷ đơn trước rồi mới xoá)" */
export function deleteResultMessage({ deleted, skipped }: BulkDeleteResult): string {
  const parts = [`Đã xoá ${deleted.length} đơn`]
  if (skipped.length > 0) {
    parts.push(`bỏ qua ${skipped.length} đơn: ${skipped.map((s) => `${s.code} (${s.reason})`).join(', ')}`)
  }
  return parts.join(' · ')
}
