import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { api, type ProductSuggestion } from '../lib/api'
import { formatPrice } from '../lib/format'
import { usePrefersReducedMotion } from '../lib/motion'
import { foldTerm, matchRange } from '../lib/textFold'
import { useTypewriterPlaceholder } from '../lib/useTypewriterPlaceholder'
import ProductImage from './ProductImage'

/** What the search box types by itself while it is empty and not focused */
const SEARCH_HINTS = [
  'Tìm mắc ca...',
  'Tìm hạt điều rang muối...',
  'Tìm óc chó đỏ...',
  'Tìm ngũ cốc hạt dinh dưỡng...',
  'Tìm mật ong hoa cà phê...',
] as const
const SEARCH_PLACEHOLDER = 'Tìm kiếm sản phẩm...'

/** Wait this long after the last keystroke before asking the server */
const SUGGEST_DEBOUNCE_MS = 300
/** The server answers [] below this many characters (same rule here, so no request is sent) */
const MIN_CHARS = 2

/** The product name with the part that matches the term (ignoring case and accents) in bold. */
function Highlighted({ text, term }: { text: string; term: string }) {
  const range = matchRange(text, term)
  if (!range) return <>{text}</>
  return (
    <>
      {text.slice(0, range[0])}
      <strong className="font-bold text-stone-900">{text.slice(range[0], range[1])}</strong>
      {text.slice(range[1])}
    </>
  )
}

/**
 * Header search (desktop header and the phone search row).
 * - Empty and not focused: types example searches with a blinking caret (an aria-hidden layer over the field);
 *   focused, filled in, or with reduced motion: the static placeholder.
 * - Typing: suggestions 300 ms after the last keystroke (an older request is aborted), up to 8 products under the
 *   field (ARIA combobox): picture, name with the match in bold, price; then "Xem tất cả kết quả cho '…'".
 *   ↑/↓ pick, Enter opens the picked product (or the search page), Esc closes; a click outside closes, focusing the
 *   field again reopens what was found.
 */
export default function SearchBox({ className = '', autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(autoFocus)
  const [open, setOpen] = useState(false)
  // Suggestions and the folded term they are for (a newer term keeps the old list until its answer arrives)
  const [found, setFound] = useState<{ term: string; items: ProductSuggestion[] } | null>(null)
  const [active, setActive] = useState(-1)
  const form = useRef<HTMLFormElement>(null)
  const listId = useId()
  const optionId = (i: number) => `${listId}-${i}`
  const reducedMotion = usePrefersReducedMotion()
  const typing = !focused && q === '' && !reducedMotion
  const hint = useTypewriterPlaceholder(SEARCH_HINTS, { active: typing })

  const term = foldTerm(q)
  const searchable = term.length >= MIN_CHARS
  const loading = searchable && found?.term !== term
  const items = searchable && found ? found.items : []
  const showList = open && searchable
  // The rows ↑/↓ move through: the products, then "Xem tất cả"
  const rowCount = loading && items.length === 0 ? 0 : items.length > 0 ? items.length + 1 : 0

  // Debounced request; the previous one is aborted when the term changes again
  useEffect(() => {
    if (!searchable) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      api.suggest(q.trim(), controller.signal).then(
        (result) => setFound({ term, items: result }),
        (err: unknown) => {
          if (!controller.signal.aborted) {
            // Not critical: the list shows "nothing found", the search page still works
            setFound({ term, items: [] })
            if (import.meta.env.DEV) console.warn('Search suggestions failed', err)
          }
        },
      )
    }, SUGGEST_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // q only matters through its folded term (same term → same request)
  }, [term, searchable]) // eslint-disable-line react-hooks/exhaustive-deps

  // A click/tap outside closes the list
  useEffect(() => {
    if (!showList) return
    const onPointer = (e: PointerEvent) => {
      if (!form.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [showList])

  const searchPage = () => {
    setOpen(false)
    navigate(q.trim() ? `/san-pham?q=${encodeURIComponent(q.trim())}` : '/san-pham')
  }

  const openProduct = (p: ProductSuggestion) => {
    setOpen(false)
    setQ('')
    setActive(-1)
    ;(document.activeElement as HTMLElement | null)?.blur()
    navigate(`/san-pham/${p.slug}`)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (showList && active >= 0 && active < items.length) openProduct(items[active])
    else searchPage()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && showList) {
      // Only the list closes (not the dialog or menu around it)
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      setActive(-1)
      return
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && searchable) {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (rowCount === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((a) => (a < 0 ? (step > 0 ? 0 : rowCount - 1) : (a + step + rowCount) % rowCount))
      return
    }
    if (e.key === 'Enter' && showList && active === items.length && items.length > 0) {
      e.preventDefault()
      searchPage()
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} role="search" className={`relative ${className}`}>
      <input
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 && active < rowCount ? optionId(active) : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => {
          setFocused(true)
          setOpen(true)
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        autoComplete="off"
        enterKeyHint="search"
        placeholder={typing ? '' : SEARCH_PLACEHOLDER}
        aria-label="Tìm sản phẩm"
        // 16px below lg: iOS Safari zooms into any field under 16px when it is focused, and stays zoomed after
        className="w-full rounded-full border border-stone-200 bg-white px-4 py-2 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 lg:text-sm"
      />
      {typing && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-4 left-4 flex items-center overflow-hidden text-base whitespace-nowrap text-stone-400 lg:text-sm"
        >
          {hint}
          <span className="typing-caret ml-px">|</span>
        </span>
      )}

      {showList && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white py-1 text-sm shadow-xl">
          {loading && items.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-3 text-stone-600" role="status">
              <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-stone-200 border-t-brand-600" />
              Đang tìm...
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-3 text-stone-600" role="status">
              Không tìm thấy sản phẩm phù hợp
            </p>
          ) : null}
          {/* aria-busy: an older list is still shown while the new term is being looked up */}
          <ul id={listId} role="listbox" aria-label="Gợi ý sản phẩm" aria-busy={loading || undefined} className={loading ? 'opacity-70' : ''}>
            {items.map((p, i) => (
              <li
                key={p.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                // Keep the focus in the field (a click would blur it first)
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => openProduct(p)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? 'bg-brand-50' : ''}`}
              >
                <ProductImage name="" imageUrl={p.imageUrl} categorySlug={p.categorySlug} size={40} className="size-10 shrink-0 rounded-lg [&>span]:text-xl" />
                <span className="min-w-0 flex-1 truncate text-stone-700">
                  <Highlighted text={p.name} term={q} />
                </span>
                <span className="shrink-0 font-semibold text-brand-700 tabular-nums">{formatPrice(p.price)}</span>
              </li>
            ))}
            {items.length > 0 && (
              <li
                id={optionId(items.length)}
                role="option"
                aria-selected={active === items.length}
                onMouseDown={(e) => e.preventDefault()}
                onClick={searchPage}
                onMouseEnter={() => setActive(items.length)}
                className={`mt-1 cursor-pointer truncate border-t border-stone-100 px-4 py-2.5 font-semibold text-brand-700 ${
                  active === items.length ? 'bg-brand-50' : ''
                }`}
              >
                Xem tất cả kết quả cho ‘{q.trim()}’
              </li>
            )}
          </ul>
        </div>
      )}
    </form>
  )
}
