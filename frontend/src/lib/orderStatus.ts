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

export const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-900',
  CONFIRMED: 'bg-sky-100 text-sky-900',
  SHIPPING: 'bg-indigo-100 text-indigo-900',
  COMPLETED: 'bg-brand-100 text-brand-800',
  CANCELLED: 'bg-stone-200 text-stone-700',
}

/** In lifecycle order (filters, progress bars). */
export const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'SHIPPING', 'COMPLETED', 'CANCELLED']

export type CancelReasonCode = 'CUSTOMER_REQUEST' | 'OUT_OF_STOCK' | 'REFUSED_DELIVERY' | 'UNREACHABLE' | 'OTHER'

export const CANCEL_REASON_LABEL: Record<CancelReasonCode, string> = {
  CUSTOMER_REQUEST: 'Khách yêu cầu huỷ',
  OUT_OF_STOCK: 'Hết hàng',
  REFUSED_DELIVERY: 'Khách không nhận hàng',
  UNREACHABLE: 'Không liên lạc được khách',
  OTHER: 'Lý do khác',
}
