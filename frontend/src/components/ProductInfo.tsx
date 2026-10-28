import { useState, type ReactNode } from 'react'
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

/**
 * Per 100g as compact tiles (figure and unit on top, name underneath); with `serving` each tile also gives one 30g
 * handful. Nothing at all while the figures are not known (null).
 * A <dl>: each tile is a name (dt) and its figure (dd), read in that order; only the display puts the figure first.
 * Tiles: 2 per row on phones (energy across the first row, so no tile is left alone), 3 from sm and in the lg
 * column (five in a row would squeeze "Chất bột đường (Carb)" to under 70px).
 */
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
    <section className={`${className} rounded-2xl border border-stone-200 bg-white p-5`} aria-labelledby="nutrition-title">
      <h2 id="nutrition-title" className="font-bold text-stone-900">
        Giá trị dinh dưỡng
      </h2>
      <p className="text-sm text-muted">Trên 100g sản phẩm{serving && ` · dòng nhỏ: một nắm ${SERVING_GRAMS}g`}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {NUTRITION_ROWS.map((row, i) => (
          <div
            key={row.key}
            className={`flex flex-col-reverse justify-end rounded-xl bg-stone-50 p-3 ${i === 0 ? 'col-span-2 sm:col-span-1' : ''}`}
          >
            <dt className="mt-0.5 text-xs text-muted">{row.label}</dt>
            <dd className="font-semibold text-stone-900 tabular-nums">
              <span className="text-lg">{nutrition[row.key]}</span> {row.unit}
              {serving && (
                <span className="block text-xs font-normal text-muted">
                  {SERVING_GRAMS}g: {perServing(row.key, nutrition[row.key])} {row.unit}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const CHIPS: { key: keyof Nutrition; label: (v: number) => string }[] = [
  { key: 'calories', label: (v) => `${v} kcal` },
  { key: 'protein', label: (v) => `Protein ${v}g` },
  { key: 'fat', label: (v) => `Fat ${v}g` },
  { key: 'carbs', label: (v) => `Carbs ${v}g` },
  { key: 'fiber', label: (v) => `Fiber ${v}g` },
]

/**
 * Compact per-100g figures as small chips (quick view), short English labels and whole numbers (older figures may
 * still have decimals); nothing while the figures are not known. The product page table keeps both languages.
 */
export function NutritionChips({ nutrition, className = 'mt-6' }: { nutrition: Nutrition | null; className?: string }) {
  if (!nutrition) return null
  return (
    <section lang="en" className={className} aria-labelledby="nutrition-chips-title">
      <h3 id="nutrition-chips-title" className="text-sm font-semibold text-stone-900">
        Nutrition <span className="font-normal text-muted">/ 100g</span>
      </h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <li
            key={c.key}
            className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-medium text-stone-800 tabular-nums"
          >
            {c.label(Math.round(nutrition[c.key]))}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Quantity picker + add button: the quantity is what will be added, bounded by what the cart can still take
 * (maxPurchasable minus what is already in it). Shows how many are already in the cart. Discontinued products get a
 * notice instead. `aside` (e.g. a link) ends the button's row from md up when it fits, and goes under it otherwise.
 * `quickview`: below md it is the quick view's buy bar, quantity and button on one row (the button takes the rest);
 * `aside` and the notes are left out there (the quick view shows them above the bar).
 */
export function AddToCartControl({
  product,
  className = 'mt-8',
  onAdded,
  aside,
  variant = 'page',
}: {
  product: Pick<ProductDetail, 'id' | 'name' | 'active' | 'maxPurchasable' | 'stockStatus'>
  className?: string
  onAdded?: (quantity: number) => void
  aside?: ReactNode
  variant?: 'page' | 'quickview'
}) {
  const bar = variant === 'quickview'
  // Below md in the quick view: shown above the buy bar instead
  const belowBar = bar ? 'max-md:hidden' : ''
  const [quantity, setQuantity] = useState(1)
  const { getQuantity } = useCart()
  const inCart = getQuantity(product.id)
  const room = Math.max(product.maxPurchasable - inCart, 0)
  const full = product.maxPurchasable > 0 && room === 0
  const chosen = Math.max(Math.min(quantity, room), 1)

  if (!product.active) {
    const note = (
      <p className={`${aside ? '' : className} rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700`} role="note">
        Sản phẩm này đã ngừng kinh doanh.
      </p>
    )
    return aside ? (
      <div className={className}>
        {note}
        <div className={`mt-3 ${belowBar}`}>{aside}</div>
      </div>
    ) : (
      note
    )
  }

  const ref = { id: product.id, name: product.name, maxPurchasable: product.maxPurchasable }
  return (
    <div className={`${className} flex items-center gap-3 ${bar ? 'md:flex-wrap' : 'flex-wrap'}`}>
      {product.maxPurchasable > 0 && (
        <QuantityStepper value={chosen} max={Math.max(room, 1)} onChange={setQuantity} label={product.name} disabled={full} />
      )}
      {/* Quick view: the button grows into the free room but never shrinks below its one-line label (basis auto, so
          a row too narrow wraps the link under it instead of squeezing the button), filling its slot (! beats the
          button's own sm:w-auto); below md it fills the bar */}
      <div className={bar ? 'flex-[1_0_auto] *:w-full! max-md:*:px-4' : 'w-full sm:w-auto sm:flex-1'}>
        {full ? (
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-full bg-stone-200 px-6 py-3 font-semibold whitespace-nowrap text-stone-600 sm:w-auto"
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
      {/* At the row's end when it fits (the button takes the room before it), else on the next line, left-aligned */}
      {aside && <div className={`w-full md:w-auto ${belowBar}`}>{aside}</div>}
      {inCart > 0 && (
        <p className={`w-full text-sm text-stone-700 ${belowBar}`} aria-live="polite">
          <span className="font-semibold text-success">✓ Đã có {inCart} trong giỏ</span>
          {' · '}
          <Link to="/gio-hang" className="font-semibold text-brand-700 underline hover:text-brand-800">
            Xem giỏ hàng
          </Link>
        </p>
      )}
      {product.maxPurchasable > 0 && product.stockStatus.status === 'IN_STOCK' && (
        <p className={`w-full text-sm text-muted ${belowBar}`}>Tối đa {product.maxPurchasable} sản phẩm cho mỗi đơn.</p>
      )}
    </div>
  )
}
