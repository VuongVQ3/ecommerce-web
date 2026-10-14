import { useState } from 'react'
import { Link, useParams } from 'react-router'
import AddToCartButton from '../cart/AddToCartButton'
import QuantityStepper from '../cart/QuantityStepper'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { DiscountBadge, PriceTag } from '../components/Price'
import ProductImage from '../components/ProductImage'
import { api, ApiError, type Nutrition, type ProductDetail } from '../lib/api'
import { formatLastDay, formatPrice, formatWeight } from '../lib/format'
import { stockLabel } from '../lib/images'
import { useAsync } from '../lib/useAsync'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import NotFoundPage from './NotFoundPage'

const NUTRITION_ROWS: { key: keyof Nutrition; label: string; unit: string }[] = [
  { key: 'calories', label: 'Năng lượng', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'fat', label: 'Chất béo', unit: 'g' },
  { key: 'carbs', label: 'Carbohydrate', unit: 'g' },
  { key: 'fiber', label: 'Chất xơ', unit: 'g' },
]

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

/** Quantity picker (bounded by maxPurchasable) + add button. Discontinued products get a notice instead. */
function PurchaseBox({ product }: { product: ProductDetail }) {
  const [quantity, setQuantity] = useState(1)

  if (!product.active) {
    return (
      <p className="mt-8 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700" role="note">
        Sản phẩm này đã ngừng kinh doanh.
      </p>
    )
  }

  const ref = { id: product.id, name: product.name, maxPurchasable: product.maxPurchasable }
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {product.maxPurchasable > 0 && (
        <QuantityStepper value={quantity} max={product.maxPurchasable} onChange={setQuantity} label={product.name} />
      )}
      <div className="w-full sm:w-auto sm:flex-1">
        <AddToCartButton product={ref} quantity={quantity} variant="page" onAdded={() => setQuantity(1)} />
      </div>
      {product.maxPurchasable > 0 && product.stockStatus.status === 'IN_STOCK' && (
        <p className="w-full text-sm text-muted">Tối đa {product.maxPurchasable} sản phẩm cho mỗi đơn.</p>
      )}
    </div>
  )
}

export default function ProductDetailPage() {
  const { slug = '' } = useParams()
  const { data: product, error, reload } = useAsync((signal) => api.product(slug, signal), [slug])
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

  const n = product.nutritionPer100g
  const inStock = product.active && product.stockStatus.status !== 'OUT_OF_STOCK'

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
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <PriceTag
              price={product.price}
              regularPrice={product.regularPrice}
              className="text-3xl font-extrabold"
              regularClassName="text-lg text-muted"
            />
            <span className="text-base font-medium text-muted">/ {formatWeight(product.weightGrams)}</span>
            <DiscountBadge percent={product.discountPercent} />
          </div>
          {product.discountPercent && product.promotionEndsAt && (
            <p className="mt-2 text-sm text-stone-700">
              <span className="font-semibold text-success">Tiết kiệm {formatPrice(product.regularPrice - product.price)}</span>
              {' · '}Khuyến mại đến hết {formatLastDay(product.promotionEndsAt)}
            </p>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white p-3">
              <dt className="text-muted">Xuất xứ</dt>
              <dd className="font-semibold text-stone-900">{product.origin ?? 'Đang cập nhật'}</dd>
            </div>
            <div className="rounded-xl bg-white p-3">
              <dt className="text-muted">Tình trạng</dt>
              <dd className={`font-semibold ${inStock ? 'text-brand-700' : 'text-danger'}`}>
                {stockLabel(product.stockStatus, product.active)}
              </dd>
            </div>
          </dl>

          <p className="mt-6 leading-relaxed text-stone-700">{product.description}</p>

          {/* Keyed by product so the chosen quantity resets when navigating to another product */}
          <PurchaseBox key={product.id} product={product} />

          <section className="mt-10 rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="font-bold text-stone-900">Giá trị dinh dưỡng</h2>
            <p className="text-sm text-muted">Trên 100g sản phẩm</p>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {NUTRITION_ROWS.map((row) => (
                  <tr key={row.key} className="border-t border-stone-100">
                    <th scope="row" className="py-2.5 text-left font-medium text-stone-600">
                      {row.label}
                    </th>
                    <td className="py-2.5 text-right font-semibold text-stone-900">
                      {n[row.key]} {row.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  )
}
