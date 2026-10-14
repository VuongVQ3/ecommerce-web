import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { ProductDetail, ProductSummary } from './api'

/** URL parameter holding the slug of the product shown in the quick view. */
export const QUICK_VIEW_PARAM = 'xem'

/** For the session: card data (shown at once) and full details (fetched once per slug). */
export const quickViewSummaries = new Map<string, ProductSummary>()
export const quickViewDetails = new Map<string, ProductDetail>()

/**
 * Product cards on screen, by slug: closing the quick view puts focus on the card it was about (looked up at close
 * time, so a re-rendered list still works).
 */
export const quickViewCards = new Map<string, HTMLElement>()

/** History state of the entry added by opening: closing then goes back instead of adding another entry. */
export interface QuickViewState {
  quickView: true
}

/** Opens the quick view: adds ?xem={slug} (keeping other parameters) as a new history entry, without scrolling. */
export function useOpenQuickView() {
  const [params, setParams] = useSearchParams()
  return useCallback(
    (product: ProductSummary) => {
      quickViewSummaries.set(product.slug, product)
      const next = new URLSearchParams(params)
      next.set(QUICK_VIEW_PARAM, product.slug)
      setParams(next, { preventScrollReset: true, state: { quickView: true } satisfies QuickViewState })
    },
    [params, setParams],
  )
}
