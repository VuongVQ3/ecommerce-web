import { useState } from 'react'
import { Link, useParams } from 'react-router'
import AddToCartButton from '../cart/AddToCartButton'
import QuantityStepper from '../cart/QuantityStepper'
import { ErrorMessage, Spinner } from '../components/Feedback'
import ProductImage from '../components/ProductImage'
import { api, ApiError, type Nutrition, type ProductDetail } from '../lib/api'
import { formatPrice, formatWeight } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import NotFoundPage from './NotFoundPage'

const NUTRITION_ROWS: { key: keyof Nutrition; label: string; unit: string }[] = [
  { key: 'calories', label: 'Năng lượng', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'fat', label: 'Chất béo', unit: 'g' },
  { key: 'carbs', label: 'Carbohydrate', unit: 'g' },
  { key: 'fiber', label: 'Chất xơ', unit: 'g' },
]

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
      {product.maxPurchasable > 0 && product.maxPurchasable < product.availableQuantity && (
        <p className="w-full text-sm text-muted">Tối đa {product.maxPurchasable} sản phẩm cho mỗi đơn.</p>
      )}
    </div>
  )
}

export default function ProductDetailPage() {
  const { slug = '' } = useParams()
  const { data: product, error, reload } = useAsync((signal) => api.product(slug, signal), [slug])

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
  const inStock = product.active && product.availableQuantity > 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav className="text-sm text-stone-500" aria-label="Breadcrumb">
        <Link to="/san-pham" className="hover:text-brand-700">
          Sản phẩm
        </Link>
        <span className="mx-2">/</span>
        <Link to={`/san-pham?category=${product.category.slug}`} className="hover:text-brand-700">
          {product.category.name}
        </Link>
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <ProductImage
          name={product.name}
          imageUrl={product.imageUrl}
          categorySlug={product.category.slug}
          className="aspect-square w-full rounded-3xl [&>span]:text-9xl"
        />

        <div>
          <h1 className="text-3xl font-bold text-stone-900 md:text-4xl">{product.name}</h1>
          <p className="mt-4 text-3xl font-extrabold text-brand-700">
            {formatPrice(product.price)}
            <span className="ml-2 text-base font-medium text-stone-500">/ {formatWeight(product.weightGrams)}</span>
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white p-3">
              <dt className="text-stone-500">Xuất xứ</dt>
              <dd className="font-semibold text-stone-900">{product.origin ?? 'Đang cập nhật'}</dd>
            </div>
            <div className="rounded-xl bg-white p-3">
              <dt className="text-stone-500">Tình trạng</dt>
              <dd className={`font-semibold ${inStock ? 'text-brand-700' : 'text-danger'}`}>
                {!product.active ? 'Ngừng kinh doanh' : inStock ? `Còn hàng (${product.availableQuantity})` : 'Hết hàng'}
              </dd>
            </div>
          </dl>

          <p className="mt-6 leading-relaxed text-stone-700">{product.description}</p>

          {/* Keyed by product so the chosen quantity resets when navigating to another product */}
          <PurchaseBox key={product.id} product={product} />

          <section className="mt-10 rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="font-bold text-stone-900">Giá trị dinh dưỡng</h2>
            <p className="text-sm text-stone-500">Trên 100g sản phẩm</p>
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
