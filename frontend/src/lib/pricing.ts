import type { OrderItem } from './api'

/** What promotions took off an order: Σ (regular − paid) × quantity. */
export function orderSavings(items: Pick<OrderItem, 'unitPrice' | 'regularUnitPrice' | 'quantity'>[]): number {
  return items.reduce((sum, i) => sum + Math.max(0, (i.regularUnitPrice ?? i.unitPrice) - i.unitPrice) * i.quantity, 0)
}
