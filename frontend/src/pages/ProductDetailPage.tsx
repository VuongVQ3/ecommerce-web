import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { AddToCartControl, NutritionTable, ProductPrice, StockBadge } from '../components/ProductInfo'
import ProductImageSlider from '../components/ProductImageSlider'
import { api, ApiError } from '../lib/api'
import { formatPrice, formatWeight } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import NotFoundPage from './NotFoundPage'

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
