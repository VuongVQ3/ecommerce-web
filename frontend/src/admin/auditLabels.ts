import type { AuditRow } from '../lib/adminApi'
import { formatAdminDateTime, formatPrice, formatPromotionEnd } from '../lib/format'
import { CANCEL_REASON_LABEL, ORDER_STATUS_LABEL, type CancelReasonCode } from '../lib/orderStatus'
import type { OrderStatus, Role } from '../lib/api'
import { ROLE_LABEL } from './labels'

/**
 * Words for the audit log (/admin/nhat-ky): every action code the backend writes, field names and how values are
 * shown. Unknown codes and fields fall back to the raw code, so a new backend action never breaks the page.
 */
export const ACTION_LABEL: Record<string, string> = {
  ORDER_CONFIRM: 'Xác nhận đơn',
  ORDER_SHIP: 'Giao cho vận chuyển',
  ORDER_COMPLETE: 'Hoàn tất đơn',
  ORDER_CANCEL: 'Huỷ đơn',
  ORDER_CONTACT_FAILED: 'Chưa liên hệ được khách',
  ORDER_NOTE_ADDED: 'Thêm ghi chú đơn',
  ORDER_CLAIMED: 'Gắn đơn vào tài khoản',
  PHONE_FLAG_CREATED: 'Đánh dấu số điện thoại',
  PHONE_FLAG_UPDATED: 'Sửa đánh dấu số điện thoại',
  PHONE_FLAG_REMOVED: 'Gỡ đánh dấu số điện thoại',
  PRODUCT_CREATED: 'Thêm sản phẩm',
  PRODUCT_UPDATED: 'Sửa sản phẩm',
  PRODUCT_HIDDEN: 'Ẩn sản phẩm',
  PRODUCT_SHOWN: 'Hiện sản phẩm',
  PRODUCT_IMAGE_ADDED: 'Thêm ảnh sản phẩm',
  PRODUCT_IMAGE_DELETED: 'Xoá ảnh sản phẩm',
  PRODUCT_IMAGE_PRIMARY: 'Đổi ảnh chính',
  PROMOTION_CREATED: 'Tạo khuyến mại',
  PROMOTION_UPDATED: 'Sửa khuyến mại',
  PROMOTION_CANCELLED: 'Huỷ khuyến mại',
  PROMOTION_ENDED: 'Kết thúc khuyến mại',
  STOCK_IMPORTED: 'Nhập kho',
  STOCK_ADJUSTED: 'Kiểm kho',
  CATEGORY_CREATED: 'Thêm danh mục',
  CATEGORY_UPDATED: 'Sửa danh mục',
  USER_INVITED: 'Mời nhân viên',
  USER_ROLE_CHANGED: 'Đổi vai trò',
  USER_LOCKED: 'Khoá tài khoản',
  USER_UNLOCKED: 'Mở khoá tài khoản',
  USER_PROMOTED: 'Cấp quyền quản trị',
  USER_EMAIL_VERIFIED: 'Xác minh email',
  USER_GOOGLE_TAKEOVER: 'Chủ email nhận lại tài khoản qua Google',
  USER_PASSWORD_SET: 'Đặt mật khẩu',
}

export const actionLabel = (code: string) => ACTION_LABEL[code] ?? code

export const ENTITY_LABEL: Record<string, string> = {
  ORDER: 'Đơn hàng',
  PRODUCT: 'Sản phẩm',
  CATEGORY: 'Danh mục',
  USER: 'Người dùng',
  PHONE: 'Số điện thoại',
}

export const FIELD_LABEL: Record<string, string> = {
  passwordSet: 'Có mật khẩu',
  phoneSet: 'Có số điện thoại',
  price: 'Giá bán',
  salePrice: 'Giá khuyến mại',
  startsAt: 'Bắt đầu',
  endsAt: 'Kết thúc',
  active: 'Trạng thái',
  level: 'Mức đánh dấu',
  reason: 'Lý do',
  status: 'Trạng thái đơn',
  carrier: 'Đơn vị vận chuyển',
  trackingNumber: 'Mã vận đơn',
  name: 'Tên',
  slug: 'Đường dẫn',
  categoryId: 'Danh mục',
  shortDescription: 'Mô tả ngắn',
  description: 'Mô tả',
  origin: 'Xuất xứ',
  weightGrams: 'Khối lượng',
  lowStockThreshold: 'Ngưỡng cảnh báo',
  calories: 'Năng lượng',
  protein: 'Protein',
  fat: 'Chất béo',
  carbs: 'Carbohydrate',
  fiber: 'Chất xơ',
  role: 'Vai trò',
  // Inventory, images, accounts
  onHand: 'Tồn kho',
  difference: 'Chênh lệch',
  quantity: 'Số lượng',
  unitCost: 'Giá nhập',
  supplier: 'Nhà cung cấp',
  movementId: 'Mã phiếu kho',
  note: 'Ghi chú',
  method: 'Cách thức',
  email: 'Email',
  publicId: 'Ảnh',
  primary: 'Ảnh chính',
  productId: 'Sản phẩm',
  userId: 'Tài khoản',
}

export const fieldLabel = (field: string) => (field === '' ? 'Nội dung' : (FIELD_LABEL[field] ?? field))

const MONEY_FIELDS = new Set(['price', 'salePrice', 'unitCost', 'total'])
const NUTRITION_UNIT: Record<string, string> = { calories: 'kcal', protein: 'g', fat: 'g', carbs: 'g', fiber: 'g' }
const FLAG_LEVEL_LABEL: Record<string, string> = { BLOCK_COD: 'Chặn COD', WATCH: 'Theo dõi' }
const METHOD_LABEL: Record<string, string> = {
  EMAIL_LINK: 'Link trong email',
  GOOGLE: 'Đăng nhập Google',
  EMAIL_VERIFIED: 'Xác minh email',
  ORDER_LINK: 'Link theo dõi đơn',
}
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

export interface ValueContext {
  entityType: string
  action: string
  /** Category id → name, from the category list */
  categories?: Map<number, string>
}

/** One audit value as people read it: "189.000₫", "16/10/2026 00:00", "Đang bán", "—" for nothing. */
export function formatAuditValue(field: string, value: unknown, ctx: ValueContext): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'active' && typeof value === 'boolean') {
    if (ctx.entityType === 'USER') return value ? 'Hoạt động' : 'Đã khoá'
    if (ctx.action.startsWith('PROMOTION_')) return value ? 'Đang chạy' : 'Đã tắt'
    return value ? 'Đang bán' : 'Đã ẩn'
  }
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  if (MONEY_FIELDS.has(field) && typeof value === 'number') return formatPrice(value)
  if (field === 'weightGrams' && typeof value === 'number') return `${value}g`
  if (field in NUTRITION_UNIT && (typeof value === 'number' || typeof value === 'string')) {
    return `${Number(value).toLocaleString('vi-VN')} ${NUTRITION_UNIT[field]}`
  }
  if (field === 'categoryId' && (typeof value === 'number' || typeof value === 'string')) {
    return ctx.categories?.get(Number(value)) ?? `#${value}`
  }
  if (typeof value === 'string') {
    if (field === 'level') return FLAG_LEVEL_LABEL[value] ?? value
    if (field === 'status') return ORDER_STATUS_LABEL[value as OrderStatus] ?? value
    if (field === 'role') return ROLE_LABEL[value as Role] ?? value
    if (field === 'method') return METHOD_LABEL[value] ?? value
    if (field === 'endsAt' && ISO_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value))) return formatPromotionEnd(value)
    if (ISO_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value))) return formatAdminDateTime(value)
    return value
  }
  if (typeof value === 'number') return value.toLocaleString('vi-VN')
  return JSON.stringify(value)
}

export interface ChangeRow {
  field: string
  before: unknown
  after: unknown
}

const sameValue = (a: unknown, b: unknown) => {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b) && a !== null && b !== null
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * before/after as objects. Defensive: a value that arrives as JSON text is parsed; text that is not a JSON object is
 * shown as it is on one row (field "").
 */
export function snapshot(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      // not JSON
    }
    return { '': value }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return { '': value }
}

/** Shown on the "Lý do" line instead of in the table. */
const HIDDEN_FIELDS = new Set(['reason'])

/**
 * The fields to show. Older rows stored whole snapshots on both sides: unchanged fields are dropped here too.
 * A creation (no "before") lists every field it set.
 */
export function changeRows(row: { before: unknown; after: unknown }): ChangeRow[] {
  const beforeObj = snapshot(row.before)
  const before = beforeObj ?? {}
  const after = snapshot(row.after) ?? {}
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => !HIDDEN_FIELDS.has(f))
  if (beforeObj === null) return fields.map((field) => ({ field, before: null, after: after[field] }))
  return fields
    .filter((field) => !sameValue(before[field], after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }))
}

/** Older rows kept the reason inside "after". */
export function rowReason(row: Pick<AuditRow, 'reasonCode' | 'reason' | 'after'>): string | null {
  const legacy = snapshot(row.after)?.reason
  return reasonText({ reasonCode: row.reasonCode, reason: row.reason ?? (typeof legacy === 'string' ? legacy : null) })
}

/** "Lý do: Không muốn mua nữa – đổi ý" (label and/or note), or null. */
export function reasonText(row: Pick<AuditRow, 'reasonCode' | 'reason'>): string | null {
  const label = row.reasonCode ? (CANCEL_REASON_LABEL[row.reasonCode as CancelReasonCode] ?? row.reasonCode) : null
  const parts = [label, row.reason].filter(Boolean)
  return parts.length ? parts.join(' – ') : null
}

/** "Quốc Vương", "Khách hàng: Nguyễn A", "Hệ thống". */
export function actorText(row: Pick<AuditRow, 'actorType' | 'actorName' | 'actorEmail' | 'actorId'>): string {
  if (row.actorType === 'CUSTOMER') return `Khách hàng: ${row.actorName ?? row.actorEmail ?? '—'}`
  if (row.actorType === 'SYSTEM' || !row.actorId) return 'Hệ thống'
  return row.actorName ?? row.actorEmail ?? 'Tài khoản đã xoá'
}

/** Back-office page of the entity, when there is one. */
export function entityLink(row: Pick<AuditRow, 'entityType' | 'entityId'>): string | null {
  const id = encodeURIComponent(row.entityId)
  if (row.entityType === 'ORDER') return `/admin/don-hang/${id}`
  if (row.entityType === 'PRODUCT') return `/admin/san-pham/${id}`
  if (row.entityType === 'USER') return `/admin/nguoi-dung/${id}`
  if (row.entityType === 'PHONE') return `/admin/don-hang?q=${id}`
  return null
}
