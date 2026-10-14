import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import ProductCard from '../components/ProductCard'
import { api, type Category, type Page, type ProductSummary } from '../lib/api'
import { usePrefersReducedMotion } from '../lib/motion'
import { useAsync } from '../lib/useAsync'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import NotFoundPage from './NotFoundPage'

const PAGE_SIZE = 12

const SORT_OPTIONS = [
  { value: '', label: 'Mặc định' },
  { value: 'price_asc', label: 'Giá thấp → cao' },
  { value: 'price_desc', label: 'Giá cao → thấp' },
  { value: 'calories_asc', label: 'Ít calo nhất' },
  { value: 'protein_desc', label: 'Nhiều protein nhất' },
]

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
function SortSheet({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
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
          {SORT_OPTIONS.map((o) => (
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

const chipClass = (active: boolean) =>
  `shrink-0 snap-start rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition ${
    active ? 'bg-brand-600 text-white' : 'border border-stone-200 bg-white text-stone-700 hover:bg-brand-50'
  }`

export default function ProductsPage() {
  const [params, setParams] = useSearchParams()
  // /danh-muc/:slug is the category page; the old ?category= link is redirected there
  const { slug: category = '' } = useParams()
  const legacyCategory = params.get('category')
  const q = params.get('q') ?? ''
  const sort = params.get('sort') ?? ''
  const page = Math.max(0, Number(params.get('page') ?? '0') || 0)
  const reducedMotion = usePrefersReducedMotion()
  const [sortOpen, setSortOpen] = useState(false)
  const listRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLUListElement>(null)

  const categories = useCached<Category[]>('categories', (signal) => api.categories(signal))
  const products = useCached<Page<ProductSummary>>(`products|${category}|${q}|${sort}|${page}`, (signal) =>
    api.products({ category, q, sort, page, size: PAGE_SIZE }, signal),
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

  // Keep the selected chip in the middle of the horizontal row (without scrolling the page)
  useEffect(() => {
    const row = chipsRef.current
    const chip = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!row || !chip) return
    row.scrollTo?.({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [category, categories.data, reducedMotion])

  const activeCategory = categories.data?.find((c) => c.slug === category)
  const title = activeCategory?.name ?? 'Tất cả sản phẩm'
  usePageMeta(category && !activeCategory ? null : `${title} | ${BRAND}`)

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
  if (category && categories.data && !activeCategory) return <NotFoundPage />

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
            {SORT_OPTIONS.map((o) => (
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

        <div className="min-w-0">
          {/* Phone/tablet: one sticky row of chips + sort button (in the flow from the start: no layout shift) */}
          <div
            ref={barRef}
            className="sticky z-10 -mx-4 mb-4 flex items-center gap-2 border-b border-stone-200 bg-cream py-2 pl-4 lg:hidden"
            style={{ top: STICKY_TOP }}
          >
            <nav aria-label="Danh mục sản phẩm" className="min-w-0 flex-1">
              <ul
                ref={chipsRef}
                className="flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {allCategories.map((c) => (
                  <li key={c.slug} className="shrink-0">
                    {categoryLink(c, chipClass(c.slug === category))}
                  </li>
                ))}
              </ul>
            </nav>
            <button
              type="button"
              onClick={() => setSortOpen(true)}
              aria-haspopup="dialog"
              className="mr-4 flex shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-2 text-sm font-semibold text-stone-800"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 4v12m0 0-3-3m3 3 3-3M14 16V4m0 0-3 3m3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sắp xếp
              <span className="sr-only">: {sortLabel}</span>
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
                <div className={`grid grid-cols-2 gap-4 lg:grid-cols-3 ${products.loading ? 'opacity-60' : ''}`}>
                  {products.data.items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
                {products.data.totalPages > 1 && (
                  <nav className="mt-8 flex flex-wrap justify-center gap-2" aria-label="Phân trang">
                    {Array.from({ length: products.data.totalPages }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => update({ page: i ? String(i) : '' })}
                        aria-current={i === page ? 'page' : undefined}
                        className={`size-10 rounded-full text-sm font-medium ${
                          i === page ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 hover:bg-brand-50'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </nav>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {sortOpen && (
        <SortSheet
          value={sort}
          onClose={() => setSortOpen(false)}
          onChange={(value) => {
            setSortOpen(false)
            update({ sort: value })
          }}
        />
      )}
    </div>
  )
}
