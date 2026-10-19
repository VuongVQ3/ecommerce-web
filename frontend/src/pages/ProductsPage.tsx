import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import ProductCard from '../components/ProductCard'
import QuickViewHost from '../components/QuickView'
import { api, ApiError, type Category, type Page, type ProductSummary } from '../lib/api'
import { usePrefersReducedMotion } from '../lib/motion'
import { MIN_PRODUCTS_WITH_NUTRITION, withNutrition } from '../lib/nutrition'
import { sharedRequest } from '../lib/sharedRequest'
import { useAsync } from '../lib/useAsync'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import NotFoundPage from './NotFoundPage'

const PAGE_SIZE = 12

/** Mặc định = the shop's own order (sort_order) */
const SORT_OPTIONS = [
  { value: '', label: 'Mặc định' },
  { value: 'price_asc', label: 'Giá thấp → cao' },
  { value: 'price_desc', label: 'Giá cao → thấp' },
  { value: 'calories_asc', label: 'Ít calo nhất', nutrition: true },
  { value: 'protein_desc', label: 'Nhiều protein nhất', nutrition: true },
]

/**
 * The nutrition sorts are offered once at least 3 products on sale have their figures: products without figures
 * come last in the protein order, so the first 3 of that order tell.
 */
function useSortOptions() {
  const probe = useAsync(
    () =>
      sharedRequest(`products|protein_desc|${MIN_PRODUCTS_WITH_NUTRITION}`, () =>
        api.products({ sort: 'protein_desc', size: MIN_PRODUCTS_WITH_NUTRITION }),
      ),
    [],
  )
  const comparable = withNutrition(probe.data?.items ?? []).length >= MIN_PRODUCTS_WITH_NUTRITION
  return SORT_OPTIONS.filter((o) => !o.nutrition || comparable)
}

/** Sticks right under the measured header (Layout sets --header-h), below the iOS notch if any. */
const STICKY_TOP = 'calc(var(--header-h, 0px) + env(safe-area-inset-top, 0px))'

/**
 * Results already seen in this tab, by query. Going Back renders the list immediately at its full height, so the
 * router's scroll restoration lands where the shopper was (a fresh request still refreshes it).
 */
const cache = new Map<string, unknown>()

function useCached<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const state = useAsync(
    async (signal) => {
      const value = await load(signal)
      cache.set(key, value)
      return value
    },
    [key],
  )
  return { ...state, data: (cache.has(key) ? cache.get(key) : state.data) as T | undefined }
}

/** Mobile sort picker: a bottom sheet on the native <dialog> (focus trapped, Esc closes). */
function SortSheet({
  value,
  options,
  onChange,
  onClose,
}: {
  value: string
  options: typeof SORT_OPTIONS
  onChange: (v: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement as HTMLElement | null
    dialog?.showModal?.()
    return () => {
      dialog?.close?.()
      opener?.focus?.()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby="sort-sheet-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-white p-0 pb-[env(safe-area-inset-bottom)] backdrop:bg-stone-900/40"
    >
      <div className="p-5">
        <div className="flex items-center justify-between">
          <h2 id="sort-sheet-title" className="text-lg font-bold text-stone-900">
            Sắp xếp theo
          </h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex size-10 items-center justify-center rounded-full text-2xl text-stone-600 hover:bg-stone-100">
            ×
          </button>
        </div>
        <ul className="mt-2">
          {options.map((o) => (
            <li key={o.value}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-3 text-base text-stone-800 hover:bg-stone-50">
                <input
                  type="radio"
                  name="sort"
                  checked={value === o.value}
                  onChange={() => onChange(o.value)}
                  className="size-5 accent-brand-600"
                />
                {o.label}
              </label>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  )
}

/** 36px high whether selected or not (the selected chip keeps a transparent border); focus ring fits in the row's padding */
const chipClass = (active: boolean) =>
  `inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
    active ? 'border-transparent bg-brand-600 text-white' : 'border-stone-200 bg-white text-stone-700 hover:bg-brand-50'
  }`

/** Width of the faded edge of the chip row */
const FADE = '24px'
/** First visit in this tab: the chip row slides this far and back to show it scrolls sideways */
const HINT_KEY = 'hl-chip-hint'
const HINT_PX = 40
const HINT_MS = 600

/** Fades the edge(s) of the row that have more chips beyond them (CSS mask, no re-render). */
function updateFade(row: HTMLElement) {
  const left = row.scrollLeft > 1
  const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1
  const start = left ? `transparent, #000 ${FADE}` : '#000, #000'
  const end = right ? `#000 calc(100% - ${FADE}), transparent` : '#000, #000'
  const mask = left || right ? `linear-gradient(to right, ${start}, ${end})` : ''
  row.style.maskImage = mask
  row.style.setProperty('-webkit-mask-image', mask)
}

/** Slides the row HINT_PX to the right and back, once per tab, if some chips are out of view. */
function hintSideScroll(row: HTMLElement) {
  try {
    if (sessionStorage.getItem(HINT_KEY)) return
    sessionStorage.setItem(HINT_KEY, '1')
  } catch {
    return
  }
  if (row.scrollLeft + row.clientWidth >= row.scrollWidth - 1) return
  const from = row.scrollLeft
  const started = performance.now()
  let frame = 0
  const stop = () => {
    cancelAnimationFrame(frame)
    row.removeEventListener('pointerdown', stop)
    row.scrollLeft = from
  }
  const step = (now: number) => {
    const t = Math.min(1, (now - started) / HINT_MS)
    row.scrollLeft = from + HINT_PX * Math.sin(Math.PI * t)
    if (t < 1) frame = requestAnimationFrame(step)
    else stop()
  }
  row.addEventListener('pointerdown', stop, { passive: true })
  frame = requestAnimationFrame(step)
}

/**
 * Page numbers to show (at most 7): first, last, current ± 1; a run of hidden pages becomes a gap ("…"), except a
 * single page, which is shown instead. Page 6 of 12: 1 … 5 6 7 … 12.
 */
function pageItems(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const keep = new Set([1, total, current - 1, current, current + 1])
  const items: (number | 'gap')[] = []
  let previous = 0
  for (let n = 1; n <= total; n++) {
    if (!keep.has(n)) continue
    if (n - previous === 2) items.push(previous + 1)
    else if (n - previous > 2) items.push('gap')
    items.push(n)
    previous = n
  }
  return items
}

const pageButtonClass = 'flex size-10 items-center justify-center rounded-full text-sm font-medium'
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

/** ‹ / ›: a link, or (first/last page) a dimmed placeholder that keeps the layout in place. */
function PageArrow({ dir, to, onNavigate }: { dir: 'prev' | 'next'; to: string | null; onNavigate: () => void }) {
  const label = dir === 'prev' ? 'Trang trước' : 'Trang sau'
  const icon = (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`size-4 transition-transform ${dir === 'prev' ? 'motion-safe:group-hover:-translate-x-0.5' : 'motion-safe:group-hover:translate-x-0.5'}`}
    >
      <path d={dir === 'prev' ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  if (!to) {
    return (
      <span role="link" aria-disabled="true" aria-label={label} className={`${pageButtonClass} cursor-not-allowed bg-white text-stone-700 opacity-40`}>
        {icon}
      </span>
    )
  }
  return (
    <Link
      to={to}
      preventScrollReset
      onClick={onNavigate}
      aria-label={label}
      rel={dir}
      className={`group ${pageButtonClass} bg-white text-stone-700 transition hover:bg-brand-50 ${focusRing}`}
    >
      {icon}
    </Link>
  )
}

/**
 * ‹ 1 2 … › as links (?page=N, so Back/Forward and reloads keep the page). Phones with more than 5 pages: ‹ 2 / 9 ›.
 */
function Pagination({ page, totalPages, href, onNavigate }: { page: number; totalPages: number; href: (n: number) => string; onNavigate: () => void }) {
  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Phân trang">
      <PageArrow dir="prev" to={page > 1 ? href(page - 1) : null} onNavigate={onNavigate} />
      <ul className={`items-center gap-2 ${totalPages > 5 ? 'hidden sm:flex' : 'flex'}`}>
        {pageItems(page, totalPages).map((n, i) =>
          n === 'gap' ? (
            <li key={`gap${i}`} aria-hidden="true" className={`${pageButtonClass} text-stone-500`}>
              …
            </li>
          ) : (
            <li key={n}>
              <Link
                to={href(n)}
                preventScrollReset
                onClick={onNavigate}
                aria-current={n === page ? 'page' : undefined}
                className={`${pageButtonClass} transition ${focusRing} ${n === page ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 hover:bg-brand-50'}`}
              >
                {n}
              </Link>
            </li>
          ),
        )}
      </ul>
      {totalPages > 5 && (
        <span aria-hidden="true" className="px-2 text-sm font-medium text-stone-700 tabular-nums sm:hidden">
          {page} / {totalPages}
        </span>
      )}
      <PageArrow dir="next" to={page < totalPages ? href(page + 1) : null} onNavigate={onNavigate} />
      <p className="sr-only" aria-live="polite">
        Trang {page} trên {totalPages}
      </p>
    </nav>
  )
}

/**
 * /danh-muc/{slug} for a category that is not in the storefront list: a real category with nothing on sale (yet)
 * says so, an unknown slug is a 404.
 */
function CategoryWithoutProducts({ slug }: { slug: string }) {
  const found = useAsync((signal) => api.category(slug, signal), [slug])
  usePageMeta(found.data ? `${found.data.name} | ${BRAND}` : null)
  if (found.error) {
    return found.error instanceof ApiError && found.error.status === 404 ? (
      <NotFoundPage />
    ) : (
      <ErrorMessage message={found.error.message} onRetry={found.reload} />
    )
  }
  if (!found.data) return <Spinner />
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-stone-900">{found.data.name}</h1>
      <p className="mt-4 text-stone-700">Danh mục chưa có sản phẩm. Mời bạn xem các sản phẩm khác của Hạt Lành.</p>
      <Link
        to="/san-pham"
        className="mt-6 inline-block rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
      >
        Xem tất cả sản phẩm
      </Link>
    </div>
  )
}

export default function ProductsPage() {
  const [params, setParams] = useSearchParams()
  // /danh-muc/:slug is the category page; the old ?category= link is redirected there
  const { slug: category = '' } = useParams()
  const legacyCategory = params.get('category')
  const q = params.get('q') ?? ''
  const sort = params.get('sort') ?? ''
  const { pathname } = useLocation()
  // ?page=N counts from 1 (page 1 has no parameter); anything else is sent back to page 1 below
  const rawPage = params.get('page')
  const pageValid = rawPage === null || (/^\d+$/.test(rawPage) && Number(rawPage) >= 2)
  const page = pageValid && rawPage !== null ? Number(rawPage) : 1
  const reducedMotion = usePrefersReducedMotion()
  const [sortOpen, setSortOpen] = useState(false)
  const offeredSorts = useSortOptions()
  const listRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLUListElement>(null)
  const stuckRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  const categories = useCached<Category[]>('categories', (signal) => api.categories(signal))
  const products = useCached<Page<ProductSummary>>(`products|${category}|${q}|${sort}|${page}`, (signal) =>
    api.products({ category, q, sort, page: page - 1, size: PAGE_SIZE }, signal),
  )

  /** Back to the top of the results (not the page), only if the shopper had scrolled past it. */
  const scrollToList = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0
    const bar = barRef.current && getComputedStyle(barRef.current).display !== 'none' ? barRef.current.offsetHeight : 0
    const top = list.getBoundingClientRect().top + window.scrollY - header - bar - 12
    if (window.scrollY > top) window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [reducedMotion])

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { preventScrollReset: true })
    scrollToList()
  }

  // Keep the selected chip in the middle of the horizontal row (block 'nearest': the bar is on screen, so the page
  // does not move); the first time in this tab, hint that the row scrolls sideways
  const hinted = useRef(false)
  useEffect(() => {
    const row = chipsRef.current
    const chip = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!row || !chip) return
    chip.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
    if (hinted.current || reducedMotion || !categories.data) return
    hinted.current = true
    const timer = window.setTimeout(() => hintSideScroll(row), 400)
    return () => window.clearTimeout(timer)
  }, [category, categories.data, reducedMotion])

  // Faded edges where more chips hide: checked once per frame while the row scrolls, and when its size changes
  useEffect(() => {
    const row = chipsRef.current
    if (!row) return
    let frame = 0
    const refresh = () => {
      frame = 0
      updateFade(row)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(refresh)
    }
    updateFade(row)
    row.addEventListener('scroll', onScroll, { passive: true })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onScroll) : null
    observer?.observe(row)
    return () => {
      cancelAnimationFrame(frame)
      row.removeEventListener('scroll', onScroll)
      observer?.disconnect()
    }
  }, [categories.data])

  // Shadow under the bar only while it is stuck: a marker one header height above the bar's place leaves the screen
  useEffect(() => {
    const marker = stuckRef.current
    if (!marker || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0))
    observer.observe(marker)
    return () => observer.disconnect()
  }, [])

  const activeCategory = categories.data?.find((c) => c.slug === category)
  const title = activeCategory?.name ?? 'Tất cả sản phẩm'
  usePageMeta(category && !activeCategory ? null : `${title}${page > 1 ? ` – Trang ${page}` : ''} | ${BRAND}`)

  // canonical / prev / next for this page of results (the server writes the plain category URL on first load)
  const totalPages = products.data?.totalPages
  useEffect(() => {
    if (!totalPages) return
    const url = (n: number) => `${window.location.origin}${pathname}${n > 1 ? `?page=${n}` : ''}`
    const added: HTMLLinkElement[] = []
    const link = (rel: string, n: number) => {
      const el = document.createElement('link')
      el.rel = rel
      el.href = url(n)
      document.head.append(el)
      added.push(el)
    }
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const previousCanonical = canonical?.getAttribute('href')
    if (canonical) canonical.setAttribute('href', url(page))
    else link('canonical', page)
    if (page > 1) link('prev', page - 1)
    if (page < totalPages) link('next', page + 1)
    return () => {
      for (const el of added) el.remove()
      if (canonical && previousCanonical != null) canonical.setAttribute('href', previousCanonical)
    }
  }, [pathname, page, totalPages])

  /** Page links keep the category, search and sort; page 1 has no ?page. */
  const pageHref = (n: number) => {
    const next = new URLSearchParams(params)
    if (n > 1) next.set('page', String(n))
    else next.delete('page')
    const query = next.toString()
    return pathname + (query ? `?${query}` : '')
  }

  /** Category links keep the current search and sort, but start again from page 1. */
  const categoryHref = (slug: string) => {
    const next = new URLSearchParams(params)
    next.delete('page')
    next.delete('category')
    const query = next.toString()
    return (slug ? `/danh-muc/${slug}` : '/san-pham') + (query ? `?${query}` : '')
  }

  if (legacyCategory) {
    const next = new URLSearchParams(params)
    next.delete('category')
    return <Navigate to={`/danh-muc/${encodeURIComponent(legacyCategory)}${next.size ? `?${next}` : ''}`} replace />
  }
  if (category && categories.data && !activeCategory) return <CategoryWithoutProducts slug={category} />
  // ?page=abc, ?page=1, or past the last page (once its results are in) → page 1
  if (!pageValid || rawPage === '1' || (products.data && !products.loading && page > Math.max(1, products.data.totalPages))) {
    return <Navigate to={pageHref(1)} replace />
  }

  const allCategories = [{ slug: '', name: 'Tất cả' }, ...(categories.data ?? [])]
  const categoryLink = (c: { slug: string; name: string }, className: string) => (
    <Link
      to={categoryHref(c.slug)}
      preventScrollReset
      onClick={scrollToList}
      aria-current={c.slug === category ? 'page' : undefined}
      className={className}
    >
      {c.name}
    </Link>
  )
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Mặc định'
  // A link with ?sort=protein_desc still works; the option is listed while it is the current one
  const sortOptions = SORT_OPTIONS.filter((o) => offeredSorts.includes(o) || o.value === sort)

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-10 lg:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-stone-900">{title}</h1>
          {q && (
            <p className="mt-1 text-stone-600">
              Kết quả cho “<strong className="break-words">{q}</strong>”{' '}
              <button type="button" onClick={() => update({ q: '' })} className="text-brand-700 underline">
                Xóa tìm kiếm
              </button>
            </p>
          )}
        </div>
        <label className="hidden items-center gap-2 text-sm text-stone-600 lg:flex">
          Sắp xếp
          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-brand-500"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        {/* Desktop: sticky column, scrolls on its own if taller than the screen */}
        <nav
          aria-label="Danh mục sản phẩm"
          className="hidden self-start overflow-y-auto overscroll-contain lg:sticky lg:block"
          style={{ top: `calc(${STICKY_TOP} + 1rem)`, maxHeight: `calc(100dvh - ${STICKY_TOP} - 2rem)` }}
        >
          <p className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Danh mục</p>
          <ul className="flex flex-col gap-1">
            {allCategories.map((c) => (
              <li key={c.slug}>
                {categoryLink(
                  c,
                  `block rounded-lg px-4 py-2 text-sm font-medium transition ${
                    c.slug === category ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 hover:bg-brand-50'
                  }`,
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="relative min-w-0">
          {/* One header height above the bar's place: off screen exactly when the bar sticks */}
          <div
            ref={stuckRef}
            aria-hidden
            className="pointer-events-none absolute h-px w-px lg:hidden"
            style={{ top: `calc(-1 * ${STICKY_TOP} - 1px)` }}
          />
          {/* Phone/tablet: one sticky 56px row of chips + sort button (in the flow from the start: no layout shift) */}
          <div
            ref={barRef}
            data-stuck={stuck ? '' : undefined}
            className="sticky z-10 -mx-4 mb-4 flex h-14 items-center gap-1 border-b border-stone-200 bg-cream transition-shadow data-stuck:shadow-[0_6px_12px_-8px_rgb(0_0_0/0.25)] lg:hidden"
            style={{ top: STICKY_TOP }}
          >
            <nav aria-label="Danh mục sản phẩm" className="min-w-0 flex-1">
              <ul
                ref={chipsRef}
                className="flex scroll-px-4 items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {allCategories.map((c) => (
                  <li key={c.slug} className="shrink-0">
                    {categoryLink(c, chipClass(c.slug === category))}
                  </li>
                ))}
              </ul>
            </nav>
            {/* Phones: icon only, with a dot when not in the default order; the word "Sắp xếp" from 640px */}
            <button
              type="button"
              onClick={() => setSortOpen(true)}
              aria-haspopup="dialog"
              aria-label={`Sắp xếp: ${sortLabel}`}
              className="relative mr-4 flex size-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:w-auto sm:px-3.5"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 4v12m0 0-3-3m3 3 3-3M14 16V4m0 0-3 3m3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">Sắp xếp</span>
              {sort && <span aria-hidden className="absolute top-0 right-0 size-2.5 rounded-full border-2 border-cream bg-brand-600 sm:hidden" />}
            </button>
          </div>

          <section ref={listRef} aria-live="polite" aria-labelledby="product-list-title" className="scroll-mt-4">
            <h2 id="product-list-title" className="sr-only">
              Danh sách sản phẩm
            </h2>
            {products.error && !products.data ? (
              <ErrorMessage message={products.error.message} onRetry={products.reload} />
            ) : !products.data ? (
              <Spinner />
            ) : products.data.items.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-300 py-16 text-center text-muted">
                Không tìm thấy sản phẩm phù hợp.
              </p>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted">
                  {products.data.totalItems} sản phẩm{sort && <span className="lg:hidden"> · {sortLabel}</span>}
                </p>
                <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 ${products.loading ? 'opacity-60' : ''}`}>
                  {products.data.items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
                {products.data.totalPages > 1 && (
                  <Pagination page={page} totalPages={products.data.totalPages} href={pageHref} onNavigate={scrollToList} />
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {sortOpen && (
        <SortSheet
          value={sort}
          options={sortOptions}
          onClose={() => setSortOpen(false)}
          onChange={(value) => {
            setSortOpen(false)
            update({ sort: value })
          }}
        />
      )}
      <QuickViewHost />
    </div>
  )
}
