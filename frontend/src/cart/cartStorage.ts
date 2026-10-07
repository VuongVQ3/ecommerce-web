import type { CartLineInput } from '../lib/api'

/**
 * Guest cart in localStorage: product ids and quantities only (never prices or totals, those come from the
 * server). `mergeKey` identifies this exact content for POST /api/cart/merge: it changes on every edit, so a
 * retried merge of the same content is applied once, while a changed cart is merged as new.
 */
export interface GuestCart {
  mergeKey: string
  items: CartLineInput[]
}

export const GUEST_CART_KEY = 'hatlanh_cart_v1'

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

const isLine = (v: unknown): v is CartLineInput =>
  typeof v === 'object' &&
  v !== null &&
  Number.isInteger((v as CartLineInput).productId) &&
  Number.isInteger((v as CartLineInput).quantity) &&
  (v as CartLineInput).quantity > 0

/** Never throws: storage may be disabled (private mode) or hold garbage. */
export function readGuestCart(): GuestCart {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY)
    if (!raw) return { mergeKey: newKey(), items: [] }
    const parsed = JSON.parse(raw) as Partial<GuestCart>
    const items = Array.isArray(parsed.items) ? parsed.items.filter(isLine) : []
    return {
      mergeKey: typeof parsed.mergeKey === 'string' ? parsed.mergeKey : newKey(),
      items: items.map(({ productId, quantity }) => ({ productId, quantity })),
    }
  } catch {
    return { mergeKey: newKey(), items: [] }
  }
}

/** Saves new content with a fresh merge key. Returns the saved cart. */
export function writeGuestCart(items: CartLineInput[]): GuestCart {
  const cart: GuestCart = {
    mergeKey: newKey(),
    items: items.filter(isLine).map(({ productId, quantity }) => ({ productId, quantity })),
  }
  try {
    if (cart.items.length === 0) localStorage.removeItem(GUEST_CART_KEY)
    else localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart))
  } catch {
    // Storage unavailable: the cart lives in memory for this tab only
  }
  return cart
}

export function clearGuestCart() {
  try {
    localStorage.removeItem(GUEST_CART_KEY)
  } catch {
    // ignore
  }
}

/** Calls `onChange` when another tab edits the guest cart. Returns an unsubscribe function. */
export function subscribeGuestCart(onChange: (cart: GuestCart) => void): () => void {
  const listener = (e: StorageEvent) => {
    if (e.key === GUEST_CART_KEY || e.key === null) onChange(readGuestCart())
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}
