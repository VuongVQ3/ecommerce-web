import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import CardCartControl from '../cart/CardCartControl'
import type { ProductSummary } from '../lib/api'
import { formatWeight } from '../lib/format'
import { stockLabel } from '../lib/images'
import { quickViewCards, useOpenQuickView } from '../lib/quickView'
import { DiscountBadge, PriceTag } from './Price'
import ProductImage from './ProductImage'

function EyeIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

/**
 * Image and name link to the product page; the add-to-cart and quick view buttons sit outside the links (a button
 * inside a link is invalid HTML and confuses keyboard and screen-reader users). Quick view: a labelled button at the
 * bottom of the image on hover/focus with a mouse, an always-visible eye icon on touch screens.
 */
export default function ProductCard({ product }: { product: ProductSummary }) {
  const href = `/san-pham/${product.slug}`
  const openQuickView = useOpenQuickView()
  const card = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = card.current
    if (!el) return
    quickViewCards.set(product.slug, el)
    return () => {
      if (quickViewCards.get(product.slug) === el) quickViewCards.delete(product.slug)
    }
  }, [product.slug])

  return (
    <article
      ref={card}
      tabIndex={-1}
      aria-label={product.name}
      className="group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 motion-safe:hover:-translate-y-0.5"
    >
      <div className="relative">
        <Link to={href} tabIndex={-1} aria-hidden className="block aspect-square w-full overflow-hidden">
          <ProductImage
            name={product.name}
            imageUrl={product.imageUrl}
            categorySlug={product.category.slug}
            size={320}
            className="aspect-square size-full transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
          />
        </Link>
        <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {product.stockStatus.status !== 'IN_STOCK' && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium text-white ${
                product.stockStatus.status === 'OUT_OF_STOCK' ? 'bg-stone-800/80' : 'bg-amber-700/90'
              }`}
            >
              {stockLabel(product.stockStatus)}
            </span>
          )}
          <DiscountBadge percent={product.discountPercent} />
        </div>
        <button
          type="button"
          onClick={() => openQuickView(product)}
          aria-label={`Xem nhanh ${product.name}`}
          aria-haspopup="dialog"
          className="absolute flex items-center justify-center gap-1.5 bg-white/95 font-semibold text-stone-800 shadow-md hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 [@media(hover:hover)]:bottom-3 [@media(hover:hover)]:left-1/2 [@media(hover:hover)]:-translate-x-1/2 [@media(hover:hover)]:rounded-full [@media(hover:hover)]:px-4 [@media(hover:hover)]:py-2 [@media(hover:hover)]:text-sm [@media(hover:hover)]:whitespace-nowrap [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:top-1.5 [@media(hover:none)]:right-1.5 [@media(hover:none)]:size-11 [@media(hover:none)]:rounded-full"
        >
          <EyeIcon className="size-5 shrink-0" />
          <span className="[@media(hover:none)]:sr-only" aria-hidden="true">
            Xem nhanh
          </span>
        </button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <p className="truncate text-xs font-medium tracking-wide text-brand-700 uppercase">{product.category.name}</p>
        <h3 className="min-h-[2.75rem] leading-snug font-semibold text-stone-900">
          <Link to={href} title={product.name} className="line-clamp-2 break-words hover:text-brand-700">
            {product.name}
          </Link>
        </h3>
        <div className="flex min-w-0 flex-nowrap gap-1.5 overflow-hidden text-xs whitespace-nowrap">
          <span className="min-w-0 truncate rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">{product.protein}g protein</span>
          <span className="min-w-0 shrink-0 truncate rounded-full bg-nut-light px-2 py-0.5 text-nut">{product.calories} kcal</span>
        </div>
        <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-2 pt-2">
          <PriceTag price={product.price} regularPrice={product.regularPrice} />
          <span className="text-sm text-muted">/ {formatWeight(product.weightGrams)}</span>
        </div>
        <CardCartControl product={{ id: product.id, name: product.name, maxPurchasable: product.maxPurchasable }} />
      </div>
    </article>
  )
}
