import { useState } from 'react'
import { Link } from 'react-router'
import AddToCartButton from '../cart/AddToCartButton'
import { useCart } from '../cart/CartContext'
import QuantityStepper from '../cart/QuantityStepper'
import type { Nutrition, Pricing, ProductDetail } from '../lib/api'
import { formatPrice, formatPromotionEnd, formatWeight } from '../lib/format'
import { stockLabel } from '../lib/images'
import { NUTRIENTS, nutrientLabel } from '../lib/nutrition'
import { DiscountBadge, PriceTag } from './Price'

/** Shared by the product page and the quick view. */

/** Price (struck-through regular price and "-x%" during a promotion) per pack weight, plus the promotion's end. */
export function ProductPrice({
  product,
  size = 'page',
}: {
  product: Pricing & { weightGrams: number }
  size?: 'page' | 'compact'
}) {
  const page = size === 'page'
  return (
    <>
      <div className={`${page ? 'mt-4' : 'mt-3'} flex flex-wrap items-baseline gap-x-3 gap-y-1`}>
        <PriceTag
          price={product.price}
          regularPrice={product.regularPrice}
          className={page ? 'text-3xl font-extrabold' : 'text-2xl font-extrabold'}
          regularClassName={page ? 'text-lg text-muted' : 'text-base text-muted'}
        />
        <span className="text-base font-medium text-muted">/ {formatWeight(product.weightGrams)}</span>
        <DiscountBadge percent={product.discountPercent} />
      </div>
      {product.discountPercent && product.promotionEndsAt && (
        <p className="mt-2 text-sm text-stone-700">
          <span className="font-semibold text-success">Tiết kiệm {formatPrice(product.regularPrice - product.price)}</span>
          {' · '}Khuyến mại {formatPromotionEnd(product.promotionEndsAt, { year: false }).toLowerCase()}
        </p>
      )}
    </>
  )
}

/** Origin and stock state side by side. */
export function StockBadge({ product, className = 'mt-6' }: { product: ProductDetail; className?: string }) {
  const inStock = product.active && product.stockStatus.status !== 'OUT_OF_STOCK'
  return (
    <dl className={`${className} grid grid-cols-2 gap-3 text-sm`}>
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
  )
}

const NUTRITION_ROWS = NUTRIENTS.map((n) => ({ key: n.key, label: nutrientLabel(n.key), unit: n.unit }))

const SERVING_GRAMS = 30

/** 100g → one 30g handful: kcal as a whole number, the rest to one decimal. */
const perServing = (key: keyof Nutrition, per100: number) => {
  const value = (per100 * SERVING_GRAMS) / 100
  return key === 'calories' ? Math.round(value) : Math.round(value * 10) / 10
}

/** Per 100g; with `serving` also per 30g (a handful). Nothing at all while the figures are not known (null). */
export function NutritionTable({
  nutrition,
  serving = false,
  className = 'mt-10',
}: {
  nutrition: Nutrition | null
  serving?: boolean
  className?: string
}) {
  if (!nutrition) return null
  return (
    <section className={`${className} rounded-2xl border border-stone-200 bg-white p-5`}>
      <h2 className="font-bold text-stone-900">Giá trị dinh dưỡng</h2>
      {!serving && <p className="text-sm text-muted">Trên 100g sản phẩm</p>}
      <table className="mt-4 w-full text-sm">
        {serving && (
          <thead>
            <tr className="text-muted">
              <th scope="col" className="pb-2 text-left font-medium">
                <span className="sr-only">Thành phần</span>
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                100g
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                {SERVING_GRAMS}g
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {NUTRITION_ROWS.map((row) => (
            <tr key={row.key} className="border-t border-stone-100">
              <th scope="row" className="py-2.5 text-left font-medium text-stone-600">
                {row.label}
              </th>
              <td className="py-2.5 text-right font-semibold text-stone-900 tabular-nums">
                {nutrition[row.key]} {row.unit}
              </td>
              {serving && (
                <td className="py-2.5 text-right font-semibold text-stone-900 tabular-nums">
                  {perServing(row.key, nutrition[row.key])} {row.unit}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

const CHIPS: { key: keyof Nutrition; label: (v: number) => string }[] = [
  { key: 'calories', label: (v) => `${v} kcal` },
  { key: 'protein', label: (v) => `Protein ${v}g` },
  { key: 'fat', label: (v) => `Béo ${v}g` },
  { key: 'carbs', label: (v) => `Carb ${v}g` },
  { key: 'fiber', label: (v) => `Xơ ${v}g` },
]

/** Compact per-100g figures as small chips (quick view); nothing while the figures are not known. */
export function NutritionChips({ nutrition, className = 'mt-6' }: { nutrition: Nutrition | null; className?: string }) {
  if (!nutrition) return null
  return (
    <section className={className} aria-labelledby="nutrition-chips-title">
      <h3 id="nutrition-chips-title" className="text-sm font-semibold text-stone-900">
        Dinh dưỡng <span className="font-normal text-muted">/ 100g</span>
      </h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <li
            key={c.key}
            className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-medium text-stone-800 tabular-nums"
          >
            {c.label(nutrition[c.key])}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Quantity picker + add button: the quantity is what will be added, bounded by what the cart can still take
 * (maxPurchasable minus what is already in it). Shows how many are already in the cart. Discontinued products get a
 * notice instead.
 */
export function AddToCartControl({
  product,
  className = 'mt-8',
  onAdded,
}: {
  product: Pick<ProductDetail, 'id' | 'name' | 'active' | 'maxPurchasable' | 'stockStatus'>
  className?: string
  onAdded?: (quantity: number) => void
}) {
  const [quantity, setQuantity] = useState(1)
  const { getQuantity } = useCart()
  const inCart = getQuantity(product.id)
  const room = Math.max(product.maxPurchasable - inCart, 0)
  const full = product.maxPurchasable > 0 && room === 0
  const chosen = Math.max(Math.min(quantity, room), 1)

  if (!product.active) {
    return (
      <p className={`${className} rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700`} role="note">
        Sản phẩm này đã ngừng kinh doanh.
      </p>
    )
  }

  const ref = { id: product.id, name: product.name, maxPurchasable: product.maxPurchasable }
  return (
    <div className={`${className} flex flex-wrap items-center gap-3`}>
      {product.maxPurchasable > 0 && (
        <QuantityStepper value={chosen} max={Math.max(room, 1)} onChange={setQuantity} label={product.name} disabled={full} />
      )}
      <div className="w-full sm:w-auto sm:flex-1">
        {full ? (
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-full bg-stone-200 px-6 py-3 font-semibold text-stone-600 sm:w-auto"
          >
            Đã đạt số lượng tối đa
          </button>
        ) : (
          <AddToCartButton
            product={ref}
            quantity={chosen}
            variant="page"
            onAdded={() => {
              onAdded?.(chosen)
              setQuantity(1)
            }}
          />
        )}
      </div>
      {inCart > 0 && (
        <p className="w-full text-sm text-stone-700" aria-live="polite">
          <span className="font-semibold text-success">✓ Đã có {inCart} trong giỏ</span>
          {' · '}
          <Link to="/gio-hang" className="font-semibold text-brand-700 underline hover:text-brand-800">
            Xem giỏ hàng
          </Link>
        </p>
      )}
      {product.maxPurchasable > 0 && product.stockStatus.status === 'IN_STOCK' && (
        <p className="w-full text-sm text-muted">Tối đa {product.maxPurchasable} sản phẩm cho mỗi đơn.</p>
      )}
    </div>
  )
}
