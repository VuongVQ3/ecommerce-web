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
  drawerOpen: boolean
}

type Action =
  | { type: 'view'; view: CartView }
  | { type: 'guest'; guest: GuestCart }
  | { type: 'loading'; loading: boolean }
  | { type: 'optimistic'; delta: number }
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
    case 'drawer':
      return { ...state, drawerOpen: action.open }
  }
}

const EMPTY_VIEW: CartView = {
  items: [],
  totalQuantity: 0,
  subtotal: 0,
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
  loading: boolean
  mode: 'guest' | 'user'
  addItem: (product: CartProductRef, quantity?: number) => Promise<CartResult>
  setQuantity: (productId: number, quantity: number) => Promise<CartResult>
  removeItem: (productId: number) => Promise<void>
  clear: () => Promise<void>
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

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

  const addItem = useCallback(
    (product: CartProductRef, quantity = 1): Promise<CartResult> =>
      withOptimistic(quantity, async () => {
        if (userId) {
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
    [userId, withOptimistic, applyView, saveGuest],
  )

  const setQuantity = useCallback(
    async (productId: number, quantity: number): Promise<CartResult> => {
      if (userId) {
        const res = await api.cartSetQuantity(productId, quantity)
        applyView(Promise.resolve(res.cart))
        return { warning: res.warning?.message ?? null }
      }
      const max = state.view?.items.find((l) => l.productId === productId)?.maxPurchasable ?? quantity
      const capped = Math.min(quantity, max)
      const items = readGuestCart().items
      await saveGuest(
        capped <= 0
          ? items.filter((i) => i.productId !== productId)
          : items.map((i) => (i.productId === productId ? { ...i, quantity: capped } : i)),
      )
      return { warning: quantity > max ? limitedMessage(max) : null }
    },
    [userId, applyView, saveGuest, state.view],
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

  const openDrawer = useCallback(() => dispatch({ type: 'drawer', open: true }), [])
  const closeDrawer = useCallback(() => dispatch({ type: 'drawer', open: false }), [])

  const confirmed =
    mode === 'guest'
      ? state.guest.items.reduce((sum, i) => sum + i.quantity, 0)
      : (state.view?.totalQuantity ?? 0)

  const value = useMemo<CartContextValue>(
    () => ({
      view: state.view,
      lines: state.view?.items ?? [],
      count: confirmed + state.optimistic,
      loading: state.loading,
      mode,
      addItem,
      setQuantity,
      removeItem,
      clear,
      drawerOpen: state.drawerOpen,
      openDrawer,
      closeDrawer,
    }),
    [state, confirmed, mode, addItem, setQuantity, removeItem, clear, openDrawer, closeDrawer],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
