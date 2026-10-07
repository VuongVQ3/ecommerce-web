import { Link } from 'react-router'
import AddToCartButton from '../cart/AddToCartButton'
import type { ProductSummary } from '../lib/api'
import { formatPrice, formatWeight } from '../lib/format'
import ProductImage from './ProductImage'

/**
 * Image and name link to the product page; the add-to-cart button sits outside the link (a button inside a link
 * is invalid HTML and confuses keyboard and screen-reader users).
 */
export default function ProductCard({ product }: { product: ProductSummary }) {
  const href = `/san-pham/${product.slug}`
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link to={href} tabIndex={-1} aria-hidden className="relative block">
        <ProductImage
          name={product.name}
          imageUrl={product.imageUrl}
          categorySlug={product.category.slug}
          className="aspect-square w-full transition group-hover:scale-[1.02]"
        />
        {!product.inStock && (
          <span className="absolute top-3 left-3 rounded-full bg-stone-800/80 px-2.5 py-1 text-xs font-medium text-white">
            Hết hàng
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-medium tracking-wide text-brand-700 uppercase">{product.category.name}</p>
        <h3 className="font-semibold text-stone-900">
          <Link to={href} className="hover:text-brand-700">
            {product.name}
          </Link>
        </h3>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">{product.protein}g protein</span>
          <span className="rounded-full bg-nut-light px-2 py-0.5 text-nut">{product.calories} kcal</span>
        </div>
        <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-2 pt-2">
          <span className="text-lg font-bold text-stone-900 tabular-nums">{formatPrice(product.price)}</span>
          <span className="text-sm text-muted">/ {formatWeight(product.weightGrams)}</span>
        </div>
        <AddToCartButton product={{ id: product.id, name: product.name, maxPurchasable: product.maxPurchasable }} />
      </div>
    </article>
  )
}
