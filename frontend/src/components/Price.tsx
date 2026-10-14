import { formatPrice } from '../lib/format'

/**
 * Current price, plus the regular price struck through when discounted. Screen readers hear "Giá gốc …" for the
 * struck-through amount instead of two unexplained numbers.
 */
export function PriceTag({
  price,
  regularPrice,
  /** Size and weight only: the colour depends on whether it is discounted */
  className = 'text-lg font-bold',
  regularClassName = 'text-sm text-muted',
}: {
  price: number
  regularPrice?: number | null
  className?: string
  regularClassName?: string
}) {
  const discounted = regularPrice != null && regularPrice > price
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className={`tabular-nums ${discounted ? 'text-danger' : 'text-stone-900'} ${className}`}>
        {discounted && <span className="sr-only">Giá khuyến mại </span>}
        {formatPrice(price)}
      </span>
      {discounted && (
        <s className={`tabular-nums ${regularClassName}`}>
          <span className="sr-only">Giá gốc </span>
          {formatPrice(regularPrice)}
        </s>
      )}
    </span>
  )
}

/** "-30%" on a product image. */
export function DiscountBadge({ percent, className = '' }: { percent: number | null; className?: string }) {
  if (!percent) return null
  return (
    <span className={`rounded-full bg-red-700 px-2.5 py-1 text-xs font-bold text-white tabular-nums ${className}`}>
      <span className="sr-only">Giảm </span>-{percent}%
    </span>
  )
}
