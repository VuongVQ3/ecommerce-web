import { Link } from 'react-router'

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
export default function Pagination({ page, totalPages, href, onNavigate }: { page: number; totalPages: number; href: (n: number) => string; onNavigate: () => void }) {
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
