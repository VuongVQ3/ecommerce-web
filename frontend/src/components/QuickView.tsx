import { useCallback, useEffect, useId, useRef, useState, type TouchEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { api, ApiError, type ProductDetail } from '../lib/api'
import { usePrefersReducedMotion } from '../lib/motion'
import {
  QUICK_VIEW_PARAM,
  quickViewCards,
  quickViewDetails,
  quickViewSummaries,
  type QuickViewState,
} from '../lib/quickView'
import { useFocusTrap } from '../lib/useFocusTrap'
import { AddToCartControl, NutritionTable, ProductPrice, StockBadge } from './ProductInfo'
import ProductImageSlider from './ProductImageSlider'

type Load = { detail?: ProductDetail; error?: Error }

/** Full details of `slug` (fixed for the component's life), fetched once per session. */
function useDetail(slug: string) {
  const [state, setState] = useState<Load>(() => ({ detail: quickViewDetails.get(slug) }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (quickViewDetails.has(slug)) return
    const controller = new AbortController()
    api.product(slug, controller.signal).then(
      (detail) => {
        quickViewDetails.set(slug, detail)
        setState({ detail })
      },
      (error: Error) => {
        if (!controller.signal.aborted) setState({ error })
      },
    )
    return () => controller.abort()
  }, [slug, attempt])

  const retry = () => {
    setState({})
    setAttempt((n) => n + 1)
  }
  return { ...state, retry }
}

function Bar({ className }: { className: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-stone-200 motion-reduce:animate-none ${className}`} />
}

/** How far the sheet must be dragged down (px) to close. */
const SWIPE_CLOSE = 90

function QuickView({ slug, onClose }: { slug: string; onClose: () => void }) {
  const summary = quickViewSummaries.get(slug)
  const { detail, error, retry } = useDetail(slug)
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  const [added, setAdded] = useState<number | null>(null)
  const [drag, setDrag] = useState(0)
  const dragStart = useRef<number | null>(null)

  useFocusTrap(true, panel, onClose)

  // The page keeps its scrollbar space while locked, so nothing shifts sideways. On close (×, backdrop, Esc, Back)
  // focus goes to the product's card, not the button: declared after useFocusTrap, so this cleanup runs after the
  // trap's own focus restore and wins in the same task (nothing is painted in between). No card on the page (opened
  // from a link): focus stays where the trap left it.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.scrollbarGutter
    root.style.scrollbarGutter = 'stable'
    return () => {
      root.style.scrollbarGutter = previous
      quickViewCards.get(slug)?.focus({ preventScroll: true })
    }
  }, [slug])

  // Phones: drag the sheet down (from the top of its content) to close
  const onTouchStart = (e: TouchEvent) => {
    const sheet = !window.matchMedia?.('(min-width: 768px)').matches
    dragStart.current = sheet && (scroller.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null
  }
  const onTouchMove = (e: TouchEvent) => {
    if (dragStart.current == null) return
    const dy = e.touches[0].clientY - dragStart.current
    setDrag(dy > 0 ? dy : 0)
  }
  const onTouchEnd = () => {
    if (dragStart.current == null) return
    dragStart.current = null
    if (drag > SWIPE_CLOSE) onClose()
    else setDrag(0)
  }

  const product = detail ?? summary
  const notFound = error instanceof ApiError && error.status === 404
  const name = product?.name

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 bg-stone-900/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        className={`relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-cream shadow-2xl md:max-w-[880px] md:rounded-3xl ${
          reduced ? '' : 'transition-transform duration-200'
        }`}
      >
        <div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-2 md:hidden" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-stone-300" />
        </div>
        <button
          type="button"
          data-autofocus
          onClick={onClose}
          aria-label="Đóng xem nhanh"
          className="absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-full bg-white/90 text-2xl leading-none text-stone-700 shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-brand-700"
        >
          ×
        </button>

        <div ref={scroller} className="min-h-0 overflow-y-auto overscroll-contain md:flex md:overflow-hidden">
          {/* A square column (never stretched to the popup's height); the slider marks the shown photo as the one
              "Thêm vào giỏ hàng" flies to the cart. key: another product starts at its first photo. */}
          <div className="bg-white md:w-1/2 md:shrink-0 md:self-start">
            {product ? (
              <ProductImageSlider
                key={product.slug}
                name={product.name}
                images={detail?.images ?? []}
                fallbackUrl={product.imageUrl}
                categorySlug={product.category.slug}
                nav="dots"
                rounded="rounded-none"
              />
            ) : (
              <Bar className="aspect-square w-full rounded-none" />
            )}
          </div>

          <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:w-1/2 md:overflow-y-auto md:overscroll-contain md:p-7">
            {product ? (
              <>
                <p className="pr-12 text-xs font-medium tracking-wide text-brand-700 uppercase">{product.category.name}</p>
                <h2 id={titleId} className="mt-1 pr-12 text-2xl font-bold text-stone-900">
                  {name}
                </h2>
                <ProductPrice product={product} size="compact" />
              </>
            ) : (
              <>
                <h2 id={titleId} className="sr-only">
                  Đang tải sản phẩm
                </h2>
                <Bar className="h-3 w-24" />
                <Bar className="mt-3 h-7 w-3/4" />
                <Bar className="mt-4 h-8 w-1/2" />
              </>
            )}

            {notFound ? (
              <p className="mt-6 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700" role="alert">
                Sản phẩm không còn kinh doanh.
              </p>
            ) : error ? (
              <div className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-danger" role="alert">
                <p>{error.message || 'Không tải được thông tin sản phẩm.'}</p>
                <button type="button" onClick={retry} className="mt-2 font-semibold underline">
                  Thử lại
                </button>
              </div>
            ) : detail ? (
              <>
                <StockBadge product={detail} className="mt-5" />
                <p className="mt-5 leading-relaxed text-stone-700">{detail.description}</p>
                <NutritionTable nutrition={detail.nutritionPer100g} serving className="mt-6" />
                <AddToCartControl product={detail} className="mt-6" onAdded={setAdded} />
                <p className="mt-2 min-h-5 text-sm font-medium text-success" aria-live="polite">
                  {added != null && `Đã thêm ${added} sản phẩm vào giỏ hàng`}
                </p>
              </>
            ) : (
              <div aria-busy="true" aria-label="Đang tải thông tin sản phẩm">
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Bar className="h-16" />
                  <Bar className="h-16" />
                </div>
                <Bar className="mt-5 h-4 w-full" />
                <Bar className="mt-2 h-4 w-full" />
                <Bar className="mt-2 h-4 w-2/3" />
                <Bar className="mt-6 h-40 w-full" />
                <Bar className="mt-6 h-12 w-full rounded-full" />
              </div>
            )}

            <Link
              to={`/san-pham/${slug}`}
              className="mt-4 inline-block font-semibold text-brand-700 hover:underline"
            >
              Xem trang chi tiết →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Shows the quick view while the URL has ?xem={slug}. Closing goes back when the view was opened from this page
 * (so Back and × behave the same), otherwise it just removes the parameter.
 */
export default function QuickViewHost() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const slug = params.get(QUICK_VIEW_PARAM)
  const openedHere = (location.state as QuickViewState | null)?.quickView === true

  const close = useCallback(() => {
    if (openedHere) {
      navigate(-1)
      return
    }
    const next = new URLSearchParams(params)
    next.delete(QUICK_VIEW_PARAM)
    setParams(next, { replace: true, preventScrollReset: true })
  }, [openedHere, navigate, params, setParams])

  if (!slug) return null
  return <QuickView key={slug} slug={slug} onClose={close} />
}
