import type { CartView } from '../lib/api'
import { formatPrice, formatPriceShort } from '../lib/format'

/**
 * "FREESHIP cho đơn từ 199k. Mua thêm 90.000₫ để được miễn phí giao hàng!!" — one sentence shared by the cart page,
 * the quick cart and the checkout summary. Renders nothing once the order ships free (or shipping is free for all).
 */
export default function FreeShippingNudge({
  view,
  as: Tag = 'p',
  className,
}: {
  view: Pick<CartView, 'amountToFreeShipping' | 'freeShippingThreshold' | 'freeShippingForAll'>
  as?: 'p' | 'span' | 'dd'
  className?: string
}) {
  if (view.freeShippingForAll || view.amountToFreeShipping <= 0) return null
  return (
    <Tag className={className}>
      <strong>FREESHIP</strong> cho đơn từ {formatPriceShort(view.freeShippingThreshold)}. Mua thêm{' '}
      <strong className="tabular-nums">{formatPrice(view.amountToFreeShipping)}</strong> để được miễn phí giao hàng!!
    </Tag>
  )
}
