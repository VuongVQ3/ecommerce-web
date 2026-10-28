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
import { AddToCartControl, NutritionChips, ProductPrice, StockBadge } from './ProductInfo'
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
  // How many photos the slider shows (1 for the card's photo while the details load)
  const photoCount = detail ? Math.max(detail.images.length, detail.imageUrl ? 1 : 0) : summary?.imageUrl ? 1 : 0
  const notFound = error instanceof ApiError && error.status === 404
  const name = product?.name
  const detailLink = (
    <Link to={`/san-pham/${slug}`} className="inline-block font-semibold text-brand-700 hover:underline">
      Xem trang chi tiết →
    </Link>
  )
  // The quantity and "Thêm vào giỏ hàng" / "Hết hàng": pinned to the bottom of the sheet on phones, right under the
  // nutrition on desktop
  const buyBar = detail != null && !error
  const perOrderNote =
    detail && detail.active && detail.maxPurchasable > 0 && detail.stockStatus.status === 'IN_STOCK'
      ? `Tối đa ${detail.maxPurchasable} sản phẩm cho mỗi đơn.`
      : null

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
        // As tall as its content, at most the screen minus its margins (90% on phones); only then does the content
        // scroll inside. Phones: title row, scrolling content, buy bar. Desktop: photo | details, the buy bar under
        // the details.
        className={`relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-cream shadow-2xl md:grid md:max-h-[calc(100dvh-3rem)] md:max-w-[960px] md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:grid-rows-[minmax(0,1fr)_auto] md:rounded-3xl ${
          reduced ? '' : 'transition-transform duration-200'
        }`}
      >
        {/* Phones: a title row of its own above the photo (outside the scrolling part, so it stays), never over the
            photo's dots or counter. Desktop: `contents`, × in the panel's corner. */}
        <div className="relative flex h-11 shrink-0 items-center justify-center bg-cream md:contents">
          <span className="h-1.5 w-10 rounded-full bg-stone-300 md:hidden" aria-hidden="true" />
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label="Đóng xem nhanh"
            className="absolute top-0.5 right-2 z-10 flex size-10 items-center justify-center rounded-full bg-white/90 text-2xl leading-none text-stone-700 shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-brand-700 md:top-3 md:right-3 md:size-11"
          >
            ×
          </button>
        </div>

        {/* Phones: one scrolling column (photo, then details). Desktop: `contents`, the columns are grid cells. */}
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:contents">
          {/* Desktop: a cream column with padding, the square photo with rounded corners and thumbnails under it;
              one photo or none is centred vertically. Phones: a 4:3 cream band (at most 40% of the screen) with the
              whole photo in it, the dots and the counter in a strip under the photo. The slider marks the shown
              photo as the one "Thêm vào giỏ hàng" flies to the cart; key: another product starts at its first photo. */}
          <div
            className={`bg-cream md:row-span-2 md:flex md:min-h-0 md:flex-col md:overflow-y-auto md:p-6 ${
              photoCount > 1 ? 'md:justify-start' : 'md:justify-center'
            }`}
          >
            {product ? (
              <ProductImageSlider
                key={product.slug}
                name={product.name}
                images={detail?.images ?? []}
                fallbackUrl={product.imageUrl}
                categorySlug={product.category.slug}
                nav="quickview"
                frame="aspect-[4/3] max-h-[40vh] bg-cream md:aspect-square md:max-h-none md:bg-white"
                rounded="rounded-none md:rounded-2xl"
              />
            ) : (
              <Bar className="aspect-[4/3] max-h-[40vh] w-full rounded-none md:aspect-square md:max-h-none md:rounded-2xl" />
            )}
          </div>

          {/* One vertical gap between all the blocks */}
          <div
            className={`flex flex-col gap-5 p-5 md:col-start-2 md:row-start-1 md:min-h-0 md:overflow-y-auto md:overscroll-contain md:p-7 ${
              buyBar ? 'md:pb-5' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))]'
            }`}
          >
            {product ? (
              <div>
                <p className="text-xs font-medium tracking-wide text-brand-700 uppercase md:pr-12">{product.category.name}</p>
                <h2 id={titleId} className="mt-1 text-xl font-bold text-stone-900 md:pr-12 md:text-2xl">
                  {name}
                </h2>
                <ProductPrice product={product} size="compact" />
              </div>
            ) : (
              <div>
                <h2 id={titleId} className="sr-only">
                  Đang tải sản phẩm
                </h2>
                <Bar className="h-3 w-24" />
                <Bar className="mt-3 h-7 w-3/4" />
                <Bar className="mt-4 h-8 w-1/2" />
              </div>
            )}

            {notFound ? (
              <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700" role="alert">
                Sản phẩm không còn kinh doanh.
              </p>
            ) : error ? (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger" role="alert">
                <p>{error.message || 'Không tải được thông tin sản phẩm.'}</p>
                <button type="button" onClick={retry} className="mt-2 font-semibold underline">
                  Thử lại
                </button>
              </div>
            ) : detail ? (
              <>
                <StockBadge product={detail} className="" />
                {/* The short description (typed or derived, at most 160 characters) in full: 160 characters take at
                    most five lines here. The clamp is only a safety net on a tall enough desktop window; where the
                    details may scroll (phones, low windows) nothing is cut. */}
                {detail.shortDescription && (
                  <p className="leading-relaxed text-stone-700 qv-full:line-clamp-5" data-testid="quick-view-summary">
                    {detail.shortDescription}
                  </p>
                )}
                <NutritionChips nutrition={detail.nutritionPer100g} className="" />
                {/* Phones: the end of the scrolling part, above the buy bar (desktop shows them in the bar) */}
                <div className="flex flex-col gap-2 md:hidden">
                  {detailLink}
                  {perOrderNote && <p className="text-sm text-muted">{perOrderNote}</p>}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-5" aria-busy="true" aria-label="Đang tải thông tin sản phẩm">
                <div className="grid grid-cols-2 gap-3">
                  <Bar className="h-16" />
                  <Bar className="h-16" />
                </div>
                <div>
                  <Bar className="h-4 w-full" />
                  <Bar className="mt-2 h-4 w-full" />
                  <Bar className="mt-2 h-4 w-2/3" />
                </div>
                <Bar className="h-12 w-full rounded-full" />
              </div>
            )}

            {!buyBar && <div>{detailLink}</div>}
          </div>
        </div>

        {buyBar && (
          <div className="shrink-0 border-t border-stone-200 bg-cream px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:col-start-2 md:row-start-2 md:border-0 md:px-7 md:pt-0 md:pb-7">
            <AddToCartControl product={detail} className="" onAdded={setAdded} aside={detailLink} variant="quickview" />
            {/* Takes no room until there is something to say */}
            <p className="mt-2 text-sm font-medium text-success empty:mt-0" aria-live="polite">
              {added != null && `Đã thêm ${added} sản phẩm vào giỏ hàng`}
            </p>
          </div>
        )}
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
