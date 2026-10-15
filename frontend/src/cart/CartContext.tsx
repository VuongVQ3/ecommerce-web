import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { api, type CartLine, type CartLineInput, type CartView } from '../lib/api'
import { clearGuestCart, readGuestCart, subscribeGuestCart, writeGuestCart, type GuestCart } from './cartStorage'

/** What the add button needs to know about a product (guests are capped client-side, then re-checked by the server). */
export interface CartProductRef {
  id: number
  name: string
  maxPurchasable: number
}

export interface CartResult {
  /** Set when the quantity had to be capped, e.g. "Chỉ còn 3 sản phẩm". */
  warning: string | null
}

interface State {
  /** Server-priced cart (signed-in cart, or the guest cart validated by the server). */
  view: CartView | null
  guest: GuestCart
  loading: boolean
  /** Units added but not yet confirmed by the server, so the header badge reacts instantly. */
  optimistic: number
  /** Signed in: quantities chosen with setQuantity, shown at once while the (debounced) request runs. */
  pending: Record<number, number>
  drawerOpen: boolean
}

type Action =
  | { type: 'view'; view: CartView }
  | { type: 'guest'; guest: GuestCart }
  | { type: 'loading'; loading: boolean }
  | { type: 'optimistic'; delta: number }
  | { type: 'pending'; productId: number; quantity: number }
  | { type: 'settled'; productId: number }
  | { type: 'drawer'; open: boolean }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'view':
      return { ...state, view: action.view, loading: false }
    case 'guest':
      return { ...state, guest: action.guest }
    case 'loading':
      return { ...state, loading: action.loading }
    case 'optimistic':
      return { ...state, optimistic: Math.max(0, state.optimistic + action.delta) }
    case 'pending':
      return { ...state, pending: { ...state.pending, [action.productId]: action.quantity } }
    case 'settled': {
      const pending = { ...state.pending }
      delete pending[action.productId]
      return { ...state, pending }
    }
    case 'drawer':
      return { ...state, drawerOpen: action.open }
  }
}

/** Signed-in quantity changes within this window are sent as one request (fast +/+/+ clicks). */
export const QUANTITY_DEBOUNCE_MS = 400

const EMPTY_VIEW: CartView = {
  items: [],
  totalQuantity: 0,
  subtotal: 0,
  discountTotal: 0,
  shippingFee: 0,
  amountToFreeShipping: 0,
  freeShippingThreshold: 0,
  total: 0,
  canCheckout: false,
}

interface CartContextValue {
  view: CartView | null
  lines: CartLine[]
  /** Badge count: confirmed units plus units still being added. */
  count: number
  /** Units of a product in the cart as shown right now (includes changes not confirmed yet). No request. */
  getQuantity: (productId: number) => number
  loading: boolean
  mode: 'guest' | 'user'
  addItem: (product: CartProductRef, quantity?: number) => Promise<CartResult>
  /**
   * 0 removes the line. Shown at once; signed in, changes made within QUANTITY_DEBOUNCE_MS are sent as one request
   * (all callers get its result). On failure the line goes back to the server's quantity and the promise rejects.
   */
  setQuantity: (productId: number, quantity: number) => Promise<CartResult>
  removeItem: (productId: number) => Promise<void>
  clear: () => Promise<void>
  /** After an order: empty the local cart (the server already emptied a signed-in user's cart). */
  resetAfterOrder: () => void
  /** Re-price the cart from the server (e.g. after an out-of-stock answer at checkout). */
  refresh: () => Promise<void>
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

interface QueuedChange {
  quantity: number
  timer: ReturnType<typeof setTimeout>
  waiters: { resolve: (r: CartResult) => void; reject: (e: unknown) => void }[]
}

const limitedMessage = (n: number) => `Chỉ còn ${n} sản phẩm`

/**
 * One cart API for the whole app. Guests: localStorage (ids + quantities only), priced via POST /api/cart/validate
 * and synced across tabs. Signed in: the server cart. Right after sign-in the guest cart is merged into the server
 * cart; localStorage is cleared only once that succeeded, so nothing is lost on failure (retried next time).
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const toast = useToast()
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    view: null,
    guest: readGuestCart(),
    loading: true,
    optimistic: 0,
    pending: {},
    drawerOpen: false,
  }))
  const mode: 'guest' | 'user' = user ? 'user' : 'guest'
  const userId = user?.id ?? null

  // Only the newest pricing request may update the view (fast clicks can overtake each other)
  const requestSeq = useRef(0)
  const applyView = useCallback((promise: Promise<CartView>) => {
    const seq = ++requestSeq.current
    return promise.then((view) => {
      if (seq === requestSeq.current) dispatch({ type: 'view', view })
      return view
    })
  }, [])

  const priceGuestCart = useCallback(
    (items: CartLineInput[]) =>
      items.length === 0 ? applyView(Promise.resolve(EMPTY_VIEW)) : applyView(api.cartValidate(items)),
    [applyView],
  )

  // Other tabs editing the guest cart: take their content and re-price it (guests only)
  const isGuest = useRef(false)
  useEffect(() => {
    isGuest.current = !authLoading && !userId
  })
  useEffect(
    () =>
      subscribeGuestCart((guest) => {
        dispatch({ type: 'guest', guest })
        if (isGuest.current) priceGuestCart(guest.items).catch(() => {})
      }),
    [priceGuestCart],
  )

  // Guest (first load, or after signing out): price what is stored. Edits re-price themselves in saveGuest.
  useEffect(() => {
    if (authLoading || userId) return
    const guest = readGuestCart()
    dispatch({ type: 'guest', guest })
    priceGuestCart(guest.items).catch(() => dispatch({ type: 'loading', loading: false }))
  }, [authLoading, userId, priceGuestCart])

  // Signed in: merge the guest cart once, then load the server cart
  useEffect(() => {
    if (authLoading || !userId) return
    let cancelled = false
    dispatch({ type: 'loading', loading: true })
    ;(async () => {
      const local = readGuestCart()
      if (local.items.length > 0) {
        try {
          const result = await api.cartMerge(local.mergeKey, local.items)
          if (cancelled) return
          clearGuestCart()
          dispatch({ type: 'guest', guest: { mergeKey: local.mergeKey, items: [] } })
          applyView(Promise.resolve(result.cart))
          if (result.skipped.length > 0) {
            toast({
              tone: 'info',
              message: `${result.skipped.length} sản phẩm trong giỏ không còn bán nên đã được bỏ ra.`,
              duration: 6000,
            })
          }
          return
        } catch {
          if (cancelled) return
          toast({
            tone: 'error',
            message: 'Chưa gộp được giỏ hàng trước khi đăng nhập. Sản phẩm vẫn được giữ, chúng tôi sẽ thử lại.',
            duration: 6000,
          })
        }
      }
      await applyView(api.cart()).catch(() => !cancelled && dispatch({ type: 'loading', loading: false }))
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, userId, applyView, toast])

  const withOptimistic = useCallback(async <T,>(delta: number, run: () => Promise<T>): Promise<T> => {
    dispatch({ type: 'optimistic', delta })
    try {
      return await run()
    } finally {
      dispatch({ type: 'optimistic', delta: -delta })
    }
  }, [])

  const saveGuest = useCallback(
    async (items: CartLineInput[]) => {
      const guest = writeGuestCart(items)
      dispatch({ type: 'guest', guest })
      await priceGuestCart(guest.items)
    },
    [priceGuestCart],
  )

  // Signed in: one timer per product; every caller waiting on it gets the result of the single request
  const queued = useRef(new Map<number, QueuedChange>())
  useEffect(() => {
    const map = queued.current
    return () => {
      // Signed out or another account: drop what was waiting
      map.forEach((q) => clearTimeout(q.timer))
      map.clear()
    }
  }, [userId])

  const flush = useCallback(
    async (productId: number) => {
      const entry = queued.current.get(productId)
      if (!entry) return
      queued.current.delete(productId)
      const stillLatest = () => !queued.current.has(productId)
      try {
        const res = await api.cartSetQuantity(productId, entry.quantity)
        await applyView(Promise.resolve(res.cart))
        if (stillLatest()) dispatch({ type: 'settled', productId })
        entry.waiters.forEach((w) => w.resolve({ warning: res.warning?.message ?? null }))
      } catch (err) {
        // Back to what the server really has
        if (stillLatest()) dispatch({ type: 'settled', productId })
        await applyView(api.cart()).catch(() => {})
        entry.waiters.forEach((w) => w.reject(err))
      }
    },
    [applyView],
  )

  const addItem = useCallback(
    (product: CartProductRef, quantity = 1): Promise<CartResult> =>
      withOptimistic(quantity, async () => {
        if (userId) {
          // A +/− change still waiting for its timer goes first, so the server adds to the right quantity
          const waiting = queued.current.get(product.id)
          if (waiting) {
            clearTimeout(waiting.timer)
            await flush(product.id)
          }
          const res = await api.cartAdd(product.id, quantity)
          applyView(Promise.resolve(res.cart))
          return { warning: res.warning?.message ?? null }
        }
        if (product.maxPurchasable <= 0) throw new Error(`Sản phẩm "${product.name}" đã hết hàng`)
        const items = readGuestCart().items
        const existing = items.find((i) => i.productId === product.id)?.quantity ?? 0
        const next = Math.min(existing + quantity, product.maxPurchasable)
        await saveGuest([...items.filter((i) => i.productId !== product.id), { productId: product.id, quantity: next }])
        return { warning: existing + quantity > product.maxPurchasable ? limitedMessage(product.maxPurchasable) : null }
      }),
    [userId, withOptimistic, applyView, saveGuest, flush],
  )

  const setQuantity = useCallback(
    async (productId: number, quantity: number): Promise<CartResult> => {
      if (userId) {
        dispatch({ type: 'pending', productId, quantity })
        return new Promise<CartResult>((resolve, reject) => {
          const previous = queued.current.get(productId)
          if (previous) clearTimeout(previous.timer)
          queued.current.set(productId, {
            quantity,
            waiters: [...(previous?.waiters ?? []), { resolve, reject }],
            timer: setTimeout(() => void flush(productId), QUANTITY_DEBOUNCE_MS),
          })
        })
      }
      const max = state.view?.items.find((l) => l.productId === productId)?.maxPurchasable ?? quantity
      const capped = Math.min(quantity, max)
      const items = readGuestCart().items
      const present = items.some((i) => i.productId === productId)
      await saveGuest(
        capped <= 0
          ? items.filter((i) => i.productId !== productId)
          : present
            ? items.map((i) => (i.productId === productId ? { ...i, quantity: capped } : i))
            : [...items, { productId, quantity: capped }],
      )
      return { warning: quantity > max ? limitedMessage(max) : null }
    },
    [userId, saveGuest, state.view, flush],
  )

  const removeItem = useCallback(
    async (productId: number) => {
      if (userId) {
        await applyView(api.cartRemove(productId))
        return
      }
      await saveGuest(readGuestCart().items.filter((i) => i.productId !== productId))
    },
    [userId, applyView, saveGuest],
  )

  const clear = useCallback(async () => {
    if (userId) {
      await applyView(api.cartClear())
      return
    }
    await saveGuest([])
  }, [userId, applyView, saveGuest])

  const resetAfterOrder = useCallback(() => {
    clearGuestCart()
    dispatch({ type: 'guest', guest: { mergeKey: readGuestCart().mergeKey, items: [] } })
    applyView(Promise.resolve(EMPTY_VIEW))
  }, [applyView])

  const refresh = useCallback(async () => {
    await (userId ? applyView(api.cart()) : priceGuestCart(readGuestCart().items))
  }, [userId, applyView, priceGuestCart])

  const openDrawer = useCallback(() => dispatch({ type: 'drawer', open: true }), [])
  const closeDrawer = useCallback(() => dispatch({ type: 'drawer', open: false }), [])

  // One source for every quantity on screen (cards, product page, badge, quick cart, cart page): the stored guest
  // cart, or the server cart with the changes still on their way
  const quantities = useMemo(() => {
    const map = new Map<number, number>()
    if (mode === 'guest') state.guest.items.forEach((i) => map.set(i.productId, i.quantity))
    else state.view?.items.forEach((l) => map.set(l.productId, l.quantity))
    Object.entries(state.pending).forEach(([id, q]) => map.set(Number(id), q))
    return map
  }, [mode, state.guest, state.view, state.pending])

  const shownView = useMemo<CartView | null>(() => {
    const view = state.view
    if (!view) return null
    let changed = false
    const items: CartLine[] = []
    for (const line of view.items) {
      const q = quantities.get(line.productId) ?? 0
      if (q === line.quantity) items.push(line)
      else {
        changed = true
        if (q > 0) items.push({ ...line, quantity: q, requestedQuantity: q, lineTotal: line.price * q })
      }
    }
    return changed ? { ...view, items, totalQuantity: items.reduce((sum, l) => sum + l.quantity, 0) } : view
  }, [state.view, quantities])

  const getQuantity = useCallback((productId: number) => quantities.get(productId) ?? 0, [quantities])

  const confirmed = [...quantities.values()].reduce((sum, q) => sum + q, 0)

  const value = useMemo<CartContextValue>(
    () => ({
      view: shownView,
      lines: shownView?.items ?? [],
      count: confirmed + state.optimistic,
      getQuantity,
      loading: state.loading,
      mode,
      addItem,
      setQuantity,
      removeItem,
      clear,
      resetAfterOrder,
      refresh,
      drawerOpen: state.drawerOpen,
      openDrawer,
      closeDrawer,
    }),
    [
      state,
      shownView,
      confirmed,
      getQuantity,
      mode,
      addItem,
      setQuantity,
      removeItem,
      clear,
      resetAfterOrder,
      refresh,
      openDrawer,
      closeDrawer,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
