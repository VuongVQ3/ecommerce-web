import { api, type ProductSuggestion } from './api'
import { foldTerm, matchRank } from './textFold'

/** At most this many products under the header search */
export const MAX_SUGGESTIONS = 6

/**
 * The products whose name contains the term (ignoring case, accents and extra spaces), best first: names starting
 * with it, then names with a word starting with it, then the rest; each group keeps the list's order. Blank → [].
 */
export function rankSuggestions<T extends { name: string }>(items: readonly T[], term: string, max = MAX_SUGGESTIONS): T[] {
  const needle = foldTerm(term)
  if (!needle) return []
  const groups: T[][] = [[], [], []]
  for (const item of items) {
    const rank = matchRank(item.name, needle)
    if (rank !== null) groups[rank].push(item)
  }
  return groups.flat().slice(0, max)
}

/** Fetch the list again on the next focus after this long (prices and the range change now and then) */
const INDEX_MAX_AGE_MS = 10 * 60_000

let cache: { at: number; request: Promise<ProductSuggestion[]>; items: ProductSuggestion[] | null } | null = null

/**
 * Every product on sale, compact, in the shop's order: fetched on first use and shared by every search box.
 * A failed fetch is forgotten, so the next call tries again.
 */
export function loadSuggestionIndex(): Promise<ProductSuggestion[]> {
  if (!cache || Date.now() - cache.at > INDEX_MAX_AGE_MS) {
    const entry: NonNullable<typeof cache> = { at: Date.now(), request: api.suggestionIndex(), items: null }
    entry.request.then(
      (items) => (entry.items = items),
      () => {
        if (cache === entry) cache = null
      },
    )
    // A refetch keeps answering with the older list until the new one is there
    if (cache?.items) entry.items = cache.items
    cache = entry
  }
  return cache.request
}

/** The list if it has been fetched already (a search box mounted later starts with it), else null. */
export const cachedSuggestionIndex = () => cache?.items ?? null

/** Tests: start without a cached list */
export function forgetSuggestionIndex() {
  cache = null
}
