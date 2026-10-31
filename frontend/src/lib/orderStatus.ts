import type { OrderStatus } from './api'

/**
 * The single source of order status labels and colours on the frontend (the backend's OrderStatus uses the same
 * labels, e.g. in emails). Never write these strings anywhere else.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  SHIPPING: 'Đang giao',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã huỷ',
}

/** One hue per status, told apart at a glance (text on its tint is at least 7:1) */
export const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-orange-100 text-orange-900',
  CONFIRMED: 'bg-blue-100 text-blue-900',
  SHIPPING: 'bg-purple-100 text-purple-900',
  COMPLETED: 'bg-brand-100 text-brand-800',
  CANCELLED: 'bg-stone-200 text-stone-700',
}

/** Dot drawn before the label, so the status does not rely on the tint alone */
export const ORDER_STATUS_DOT: Record<OrderStatus, string> = {
  PENDING: 'bg-orange-500',
  CONFIRMED: 'bg-blue-600',
  SHIPPING: 'bg-purple-600',
  COMPLETED: 'bg-brand-600',
  CANCELLED: 'bg-stone-500',
}

/** In lifecycle order (filters, progress bars). */
export const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'SHIPPING', 'COMPLETED', 'CANCELLED']

/** Reasons a customer picks when cancelling their own order (same codes as the backend's CancelReason). */
export type CustomerCancelReasonCode = 'CHANGED_MIND' | 'CHANGE_ITEMS' | 'CHANGE_ADDRESS' | 'DUPLICATE_ORDER' | 'BETTER_PRICE' | 'OTHER'

/** Reasons staff pick in the back office. */
export type StaffCancelReasonCode = 'CUSTOMER_REQUEST' | 'OUT_OF_STOCK' | 'REFUSED_DELIVERY' | 'UNREACHABLE' | 'OTHER'

export type CancelReasonCode = CustomerCancelReasonCode | StaffCancelReasonCode

export const CANCEL_REASON_LABEL: Record<CancelReasonCode, string> = {
  CHANGED_MIND: 'Không muốn mua nữa',
  CHANGE_ITEMS: 'Muốn đổi sản phẩm hoặc số lượng',
  CHANGE_ADDRESS: 'Muốn đổi địa chỉ giao hàng',
  DUPLICATE_ORDER: 'Đặt trùng đơn',
  BETTER_PRICE: 'Tìm được giá tốt hơn',
  CUSTOMER_REQUEST: 'Khách yêu cầu huỷ',
  OUT_OF_STOCK: 'Hết hàng',
  REFUSED_DELIVERY: 'Khách không nhận hàng',
  UNREACHABLE: 'Không liên lạc được khách',
  OTHER: 'Lý do khác',
}

/** In the order shown to customers ("Lý do khác" last). */
export const CUSTOMER_CANCEL_REASONS: CustomerCancelReasonCode[] = [
  'CHANGED_MIND',
  'CHANGE_ITEMS',
  'CHANGE_ADDRESS',
  'DUPLICATE_ORDER',
  'BETTER_PRICE',
  'OTHER',
]

export const CANCELLED_BY_LABEL = { STAFF: 'Cửa hàng huỷ', CUSTOMER: 'Khách tự huỷ' } as const
