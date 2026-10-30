import type { ReactNode } from 'react'
import type { Order, OrderStatus } from '../lib/api'
import { ORDER_STATUS_DOT, ORDER_STATUS_LABEL, ORDER_STATUS_STYLE } from '../lib/orderStatus'
import { orderSavings } from '../lib/pricing'
import { PriceTag } from './Price'
import { formatDateTime, formatPrice, formatWeight } from '../lib/format'

/** Label and colour come from lib/orderStatus (the `label` prop is kept for older callers and ignored). */
export function StatusBadge({ status, size = 'md' }: { status: OrderStatus; label?: string; size?: 'md' | 'lg' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold whitespace-nowrap ${ORDER_STATUS_STYLE[status]} ${
        size === 'lg' ? 'gap-2 px-3.5 py-1.5 text-sm' : 'gap-1.5 px-2.5 py-1 text-xs'
      }`}
    >
      <span aria-hidden className={`shrink-0 rounded-full ${ORDER_STATUS_DOT[status]} ${size === 'lg' ? 'size-2' : 'size-1.5'}`} />
      {ORDER_STATUS_LABEL[status]}
    </span>
  )
}

/**
 * Full order view shared by the success page, "my orders" and guest lookup. `actions` renders under the header;
 * `header={false}` leaves out code, date and status for a page that shows them itself (the back office).
 */
export default function OrderDetails({ order, actions, header = true }: { order: Order; actions?: ReactNode; header?: boolean }) {
  const savings = orderSavings(order.items)
  return (
    <div className="space-y-6">
      {header && (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Mã đơn hàng</p>
          <p className="text-2xl font-extrabold tracking-wider text-stone-900">{order.code}</p>
          <p className="text-sm text-muted">Đặt lúc {formatDateTime(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} label={order.statusLabel} />
      </div>
      )}
      {actions}

      <section className="rounded-2xl border border-stone-200 bg-white p-5" aria-labelledby="order-items-title">
        <h2 id="order-items-title" className="font-bold text-stone-900">
          Sản phẩm
        </h2>
        <ul className="mt-3 divide-y divide-stone-100">
          {order.items.map((item) => (
            <li key={item.productId} className="flex justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium break-words text-stone-900">{item.productName}</p>
                <p className="text-muted tabular-nums">
                  <PriceTag price={item.unitPrice} regularPrice={item.regularUnitPrice} className="text-sm font-normal" regularClassName="text-xs text-muted" />{' '}
                  × {item.quantity} · {formatWeight(item.weightGrams)}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1.5 border-t border-stone-100 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-600">Tạm tính</dt>
            <dd className="tabular-nums">{formatPrice(order.subtotal)}</dd>
          </div>
          {savings > 0 && (
            <div className="flex justify-between">
              <dt className="text-stone-600">Tiết kiệm nhờ khuyến mại</dt>
              <dd className="font-semibold text-success tabular-nums">{formatPrice(savings)}</dd>
            </div>
          )}

          <div className="flex justify-between">
            <dt className="text-stone-600">Phí giao hàng</dt>
            <dd className="tabular-nums">{order.shippingFee === 0 ? 'Miễn phí' : formatPrice(order.shippingFee)}</dd>
          </div>
          <div className="flex justify-between text-base">
            <dt className="font-semibold">Tổng thanh toán khi nhận hàng</dt>
            <dd className="font-bold text-brand-700 tabular-nums">{formatPrice(order.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 text-sm" aria-labelledby="order-delivery-title">
        <h2 id="order-delivery-title" className="font-bold text-stone-900">
          Giao hàng
        </h2>
        <p className="mt-2 font-medium text-stone-900">
          {order.customerName} · <span className="tabular-nums">{order.phone}</span>
        </p>
        <p className="mt-1 break-words text-stone-700">
          {order.addressLine}, {order.ward}, {order.province}
        </p>
        {order.email && <p className="mt-1 break-all text-stone-700">{order.email}</p>}
        {order.note && <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-stone-700">Ghi chú: {order.note}</p>}
        <p className="mt-3 text-stone-600">Thanh toán khi nhận hàng (COD)</p>
      </section>

      {order.history.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 text-sm" aria-labelledby="order-history-title">
          <h2 id="order-history-title" className="font-bold text-stone-900">
            Lịch sử đơn hàng
          </h2>
          <ol className="mt-3 space-y-3 border-l-2 border-brand-100 pl-4">
            {order.history.map((h, i) => (
              <li key={i}>
                <p className="font-medium text-stone-900">{h.label}</p>
                <p className="text-muted">
                  {formatDateTime(h.at)}
                  {h.reason ? ` · ${h.reason}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
