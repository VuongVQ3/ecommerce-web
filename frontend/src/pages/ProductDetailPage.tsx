import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { AddToCartControl, NutritionTable, ProductPrice, StockBadge } from '../components/ProductInfo'
import ProductImage from '../components/ProductImage'
import { api, ApiError, type ProductDetail } from '../lib/api'
import { formatPrice, formatWeight } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import NotFoundPage from './NotFoundPage'

/** Main photo plus thumbnails when the product has several images. */
function Gallery({ product }: { product: ProductDetail }) {
  const urls = product.images.length > 0 ? product.images.map((i) => i.url) : product.imageUrl ? [product.imageUrl] : []
  const [index, setIndex] = useState(0)
  const current = urls[Math.min(index, urls.length - 1)] ?? null
  return (
    <div>
      <ProductImage
        name={product.name}
        imageUrl={current}
        categorySlug={product.category.slug}
        size={560}
        className="aspect-square w-full rounded-3xl [&>span]:text-9xl"
      />
      {urls.length > 1 && (
        <ul className="mt-3 flex gap-2" aria-label="Ảnh sản phẩm">
          {urls.map((url, i) => (
            <li key={url}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Xem ảnh ${i + 1}`}
                aria-pressed={i === index}
                className={`block overflow-hidden rounded-xl border-2 ${i === index ? 'border-brand-600' : 'border-transparent'}`}
              >
                <ProductImage
                  name={`${product.name} – ảnh ${i + 1}`}
                  imageUrl={url}
                  categorySlug={product.category.slug}
                  size={64}
                  className="size-16"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
    current?.description.slice(0, 155),
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

      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <Gallery key={product.id} product={product} />

        <div>
          <h1 className="text-3xl font-bold text-stone-900 md:text-4xl">{product.name}</h1>
          <ProductPrice product={product} />

          <StockBadge product={product} />

          <p className="mt-6 leading-relaxed text-stone-700">{product.description}</p>

          {/* Keyed by product so the chosen quantity resets when navigating to another product */}
          <AddToCartControl key={product.id} product={product} />

          <NutritionTable nutrition={product.nutritionPer100g} />
        </div>
      </div>
    </div>
  )
}
