import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import ProductCard from '../components/ProductCard'
import ProductDescription from '../components/ProductDescription'
import { AddToCartControl, NutritionTable, ProductPrice, StockBadge } from '../components/ProductInfo'
import ProductImageSlider from '../components/ProductImageSlider'
import QuickViewHost from '../components/QuickView'
import { api, ApiError, type ProductDetail } from '../lib/api'
import { formatPrice, formatWeight } from '../lib/format'
import { PURCHASE_PROMISES } from '../lib/promises'
import { useAsync } from '../lib/useAsync'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import NotFoundPage from './NotFoundPage'

/**
 * "Giao hàng toàn quốc · Đổi trả · Thanh toán khi nhận hàng", each part linking to its policy page. A wrapping list:
 * a part never breaks inside, the line wraps between parts on narrow screens.
 */
function PurchasePromises() {
  return (
    <ul className="mt-4 flex flex-wrap gap-y-1 text-sm text-stone-600" aria-label="Cam kết khi mua hàng">
      {PURCHASE_PROMISES.map((p, i) => (
        <li key={p.label} className="whitespace-nowrap">
          {i > 0 && (
            <span aria-hidden="true" className="mx-2 text-stone-300">
              ·
            </span>
          )}
          <Link to={p.to} className="underline decoration-stone-300 underline-offset-2 hover:text-brand-700 hover:decoration-brand-700">
            {p.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

const RELATED_MAX = 4

/**
 * Up to four other products of the same category (catalogue order) with the usual cards; nothing at all when there
 * are none. One request for RELATED_MAX + 1, so leaving the current product out still leaves four.
 */
function RelatedProducts({ product }: { product: ProductDetail }) {
  const { data } = useAsync(
    (signal) => api.products({ category: product.category.slug, size: RELATED_MAX + 1 }, signal),
    [product.category.slug],
  )
  const related = (data?.items ?? []).filter((p) => p.id !== product.id).slice(0, RELATED_MAX)
  if (related.length === 0) return null
  return (
    <section className="mt-10" aria-labelledby="related-title">
      <h2 id="related-title" className="text-xl font-bold text-stone-900">
        Sản phẩm liên quan
      </h2>
      <ul className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {related.map((p) => (
          <li key={p.id} className="flex min-w-0">
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function ProductDetailPage() {
  const { slug = '' } = useParams()
  const { data: product, error, reload } = useAsync((signal) => api.product(slug, signal), [slug])
  const navigate = useNavigate()
  const location = useLocation()
  // Old address of a renamed product: move to the current one without a history entry
  const redirectTo = product?.redirectTo
  useEffect(() => {
    if (redirectTo && redirectTo !== slug) {
      navigate({ pathname: `/san-pham/${redirectTo}`, search: location.search, hash: location.hash }, { replace: true })
    }
  }, [redirectTo, slug, navigate, location.search, location.hash])
  const current = product?.slug === slug ? product : null
  usePageMeta(
    current && `${current.name} ${formatWeight(current.weightGrams)} – ${formatPrice(current.price)} | ${BRAND}`,
    // Same as the server-rendered tag: typed, or derived from the description (≤ 160 characters)
    current?.shortDescription,
  )

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <ErrorMessage message={error.message} onRetry={reload} />
      </div>
    )
  }
  if (!product || product.slug !== slug) return <Spinner />

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav className="text-sm text-muted" aria-label="Breadcrumb">
        <Link to="/san-pham" className="hover:text-brand-700">
          Sản phẩm
        </Link>
        <span className="mx-2">/</span>
        <Link to={`/danh-muc/${product.category.slug}`} className="hover:text-brand-700">
          {product.category.name}
        </Link>
      </nav>

      {/*
        Two columns from lg only; below, one column with the photos at a moderate size, centred. From lg the photos
        stick under the header while the longer details column scrolls (self-start: a stretched item cannot stick).
      */}
      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="mx-auto w-full max-w-xl lg:sticky lg:top-[calc(var(--header-h,0px)+1.5rem)] lg:max-w-none lg:self-start">
          {/* key: another product starts again at its first photo */}
          <ProductImageSlider
            key={product.id}
            name={product.name}
            images={product.images}
            fallbackUrl={product.imageUrl}
            categorySlug={product.category.slug}
            nav="thumbnails"
            placeholderClass="[&>span]:text-9xl"
          />
        </div>

        <div>
          <h1 className="text-3xl font-bold text-stone-900 md:text-4xl">{product.name}</h1>
          <ProductPrice product={product} />

          <StockBadge product={product} />

          <ProductDescription text={product.description} className="mt-6" />

          {/* Keyed by product so the chosen quantity resets when navigating to another product */}
          <AddToCartControl key={product.id} product={product} />

          <PurchasePromises />

          <NutritionTable nutrition={product.nutritionPer100g} />
        </div>
      </div>

      <RelatedProducts key={product.id} product={product} />
      {/* The related cards' quick view (?xem=): pages host their own, the layout has none */}
      <QuickViewHost />
    </div>
  )
}
