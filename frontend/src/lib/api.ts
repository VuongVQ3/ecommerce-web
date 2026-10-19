import type { CancelReasonCode, CustomerCancelReasonCode } from './orderStatus'

export interface Category {
  id: number
  name: string
  slug: string
}

/** Sale price fields (see docs/pricing.md): price is what the buyer pays now. */
export interface Pricing {
  /** Current price: the sale price during a promotion */
  price: number
  /** Usual price; equal to price when not discounted */
  regularPrice: number
  /** Whole percent, null when not discounted */
  discountPercent: number | null
  /** End of the running promotion (exclusive), null when not discounted */
  promotionEndsAt: string | null
}

export interface ProductSummary extends Pricing {
  id: number
  name: string
  slug: string
  weightGrams: number
  imageUrl: string | null
  calories: number
  protein: number
  /** Public stock: an exact count only when very low (≤ 5). */
  stockStatus: StockStatus
  /** How many one shopper can put in the cart now (exact when ≤ 5 left, otherwise the per-item cap). */
  maxPurchasable: number
  category: Category
}

export type StockLevel = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'

export interface StockStatus {
  status: StockLevel
  /** Present only for LOW_STOCK. */
  quantity: number | null
}

export interface ProductImageInfo {
  url: string
  width: number | null
  height: number | null
}

export interface Nutrition {
  calories: number
  protein: number
  fat: number
  carbs: number
  fiber: number
}

export interface ProductDetail extends Pricing {
  id: number
  name: string
  slug: string
  description: string
  origin: string | null
  weightGrams: number
  /** False when discontinued: the page stays visible but the product cannot be bought. */
  active: boolean
  stockStatus: StockStatus
  maxPurchasable: number
  imageUrl: string | null
  /** Primary first. Empty when the product only has the legacy imageUrl (or none). */
  images: ProductImageInfo[]
  nutritionPer100g: Nutrition
  category: Category
  /** Present when the URL used an old slug: the current one (replace the URL with it). */
  redirectTo?: string
}

export interface Page<T> {
  items: T[]
  page: number
  size: number
  totalItems: number
  totalPages: number
}

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN'

export interface User {
  id: string
  email: string
  fullName: string
  phone: string | null
  role: Role
  /** False until the owner opens the link in the verification email (Google accounts are verified). */
  emailVerified: boolean
  /** Staff/admin password below the rules: the back office stays closed until it is changed. */
  passwordChangeRequired: boolean
}

export interface RegisterInput {
  fullName: string
  email: string
  password: string
  /** Normalized 0xxxxxxxxx, or omitted. */
  phone?: string
  /** Sent as true when the user clicks "Đăng ký" under the terms notice. */
  acceptTerms: true
  marketingConsent: boolean
  turnstileToken: string
  /** Honeypot: always empty for humans. */
  website: string
}

export interface LoginInput {
  email: string
  password: string
}

// ---- Cart (prices always come from the server; requests carry only product ids and quantities) ----

export type CartLineStatus = 'OK' | 'PRICE_CHANGED' | 'QTY_REDUCED' | 'OUT_OF_STOCK' | 'UNAVAILABLE'

export interface CartLine {
  productId: number
  name: string
  slug: string | null
  imageUrl: string | null
  categorySlug: string | null
  weightGrams: number | null
  /** Current unit price (sale price during a promotion) */
  price: number
  /** Regular unit price when discounted, otherwise null */
  regularPrice: number | null
  /** Price when added (signed-in carts only); differs from price when status is PRICE_CHANGED. */
  priceAtAdd: number | null
  /** Quantity counted in totals (may be lower than requestedQuantity). */
  quantity: number
  requestedQuantity: number
  maxPurchasable: number
  lineTotal: number
  status: CartLineStatus
}

export interface CartView {
  items: CartLine[]
  totalQuantity: number
  subtotal: number
  /** Σ (regular − sale price) × quantity: "Đã giảm" */
  discountTotal: number
  shippingFee: number
  amountToFreeShipping: number
  freeShippingThreshold: number
  total: number
  canCheckout: boolean
}

export interface CartWarning {
  code: string
  message: string
  productId: number | null
  limitedTo: number | null
}

export interface CartLineInput {
  productId: number
  quantity: number
}

export interface ProductQuery {
  category?: string
  q?: string
  sort?: string
  page?: number
  size?: number
}

// ---- Orders (cash on delivery) ----

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED'

export interface OrderItem {
  productId: number
  productName: string
  /** What the buyer paid per unit */
  unitPrice: number
  /** Regular price at purchase time (higher than unitPrice when discounted) */
  regularUnitPrice: number
  weightGrams: number
  quantity: number
  lineTotal: number
}

export interface Order {
  code: string
  status: OrderStatus
  statusLabel: string
  canCancel: boolean
  createdAt: string
  customerName: string
  phone: string
  email: string | null
  province: string
  ward: string
  addressLine: string
  note: string | null
  paymentMethod: 'COD'
  items: OrderItem[]
  subtotal: number
  shippingFee: number
  total: number
  history: { status: OrderStatus; label: string; at: string; reason: string | null }[]
  /** Set once CANCELLED */
  cancelReasonCode: CancelReasonCode | null
  cancelReasonLabel: string | null
  /** Note given with the cancellation */
  cancelReason: string | null
  cancelledByType: 'STAFF' | 'CUSTOMER' | null
  /** Guest orders, only in the response that placed the order: secret of the tracking link. */
  accessToken?: string
  /** Guest orders, only in that response: SITE_URL/don-hang/{code}?t={accessToken} */
  trackingUrl?: string
}

/** What a guest tracking link shows. Phone and email are partly hidden; the address is shown in full. */
export interface TrackedOrder {
  code: string
  status: OrderStatus
  statusLabel: string
  createdAt: string
  customerName: string
  maskedPhone: string
  maskedEmail: string | null
  hasEmail: boolean
  province: string
  ward: string
  addressLine: string
  paymentMethod: 'COD'
  items: OrderItem[]
  subtotal: number
  shippingFee: number
  total: number
  carrier: string | null
  trackingNumber: string | null
  history: Order['history']
  canCancel: boolean
  /** Not attached to an account yet. */
  canClaim: boolean
  cancelReasonCode: Order['cancelReasonCode']
  cancelReasonLabel: string | null
  cancelReason: string | null
  cancelledByType: Order['cancelledByType']
}

/** What a customer sends to cancel: a reason code, and a note (required with OTHER, up to 300 characters). */
export interface CustomerCancelInput {
  reasonCode: CustomerCancelReasonCode
  reason?: string
}

export interface ClaimAccountInput {
  password: string
  acceptTerms: true
  marketingConsent: boolean
  /** Only when the order has no email. */
  email?: string
  /** Only when the name on the order is not a valid name. */
  fullName?: string
}

export interface OrderSummary {
  code: string
  status: OrderStatus
  statusLabel: string
  createdAt: string
  itemCount: number
  firstItemName: string | null
  total: number
}

export interface PlaceOrderInput {
  items: CartLineInput[]
  customerName: string
  phone: string
  email?: string
  provinceCode: number
  wardCode: number
  addressLine: string
  note?: string
  /** Generated once per checkout visit: resubmitting returns the same order. */
  idempotencyKey: string
}

/** One product that could not be reserved (409 OUT_OF_STOCK, property "items"). */
export interface Shortage {
  productId: number
  name: string
  requested: number
  available: number
}

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string>
  /** Machine-readable error code from the backend, e.g. EMAIL_EXISTS. */
  readonly code?: string
  /** The whole problem body, for errors that carry data (e.g. the out-of-stock "items"). */
  readonly details: Record<string, unknown>

  constructor(
    message: string,
    status: number,
    fieldErrors: Record<string, string> = {},
    code?: string,
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
    this.code = code
    this.details = details
  }
}

const GENERIC_ERROR = 'Đã có lỗi xảy ra. Vui lòng thử lại.'

export interface RequestOptions extends RequestInit {
  /**
   * When the session cannot be refreshed, notify the session-expired handler (which sends the user to the login
   * page). Default true; turned off for the silent "am I signed in?" check on page load.
   */
  redirectOnAuthFailure?: boolean
}

// Empty in development (Vite proxies /api); set VITE_API_URL when the API lives on another domain.
const API_BASE = import.meta.env.VITE_API_URL ?? ''

/** Auth endpoints whose 401 means "wrong credentials / no session", never "access token expired". */
const NO_REFRESH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/google',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
])

let refreshInFlight: Promise<boolean> | null = null
let sessionExpiredHandler: (() => void) | null = null

/** Registers what to do when the session is gone for good. Returns an unsubscribe function. */
export function onSessionExpired(handler: () => void): () => void {
  sessionExpiredHandler = handler
  return () => {
    if (sessionExpiredHandler === handler) sessionExpiredHandler = null
  }
}

/**
 * Tokens live in httpOnly cookies, so every request sends credentials. X-Requested-With is required by the
 * backend on state-changing requests (CSRF protection).
 */
async function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  // FormData (file uploads) sets its own multipart Content-Type with the boundary
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  headers.set('X-Requested-With', 'XMLHttpRequest')
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' })
  } catch (err) {
    if (init.signal?.aborted) throw err
    throw new ApiError('Không kết nối được máy chủ. Vui lòng thử lại.', 0)
  }
}

/**
 * Concurrent 401s share one refresh call. The backend rotates refresh tokens and treats a second use of the same
 * token as theft, so two parallel refreshes would sign the user out everywhere.
 */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= send('/api/auth/refresh', { method: 'POST' })
    .then(
      (res) => res.ok,
      () => false,
    )
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { redirectOnAuthFailure = true, ...init } = options

  let res = await send(path, init)
  if (res.status === 401 && !NO_REFRESH_PATHS.has(path)) {
    if (await refreshSession()) res = await send(path, init)
    if (res.status === 401 && redirectOnAuthFailure) sessionExpiredHandler?.()
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    // 5xx details are not written for users (and may be English): show a generic message instead.
    // 503 is the exception: the backend uses it for "try again later" messages meant for users.
    const message = res.status >= 500 && res.status !== 503 ? GENERIC_ERROR : (body?.detail ?? GENERIC_ERROR)
    throw new ApiError(message, res.status, body?.errors ?? {}, body?.code, body ?? {})
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const post = (body?: unknown): RequestOptions => ({
  method: 'POST',
  body: body === undefined ? undefined : JSON.stringify(body),
})

function trackPath(code: string, token: string, suffix = ''): string {
  return `/api/orders/track/${encodeURIComponent(code)}${suffix}?t=${encodeURIComponent(token)}`
}

function toQueryString(query: ProductQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  categories: (signal?: AbortSignal) => apiRequest<Category[]>('/api/categories', { signal }),

  products: (query: ProductQuery, signal?: AbortSignal) =>
    apiRequest<Page<ProductSummary>>(`/api/products${toQueryString(query)}`, { signal }),

  product: (slug: string, signal?: AbortSignal) =>
    apiRequest<ProductDetail>(`/api/products/${encodeURIComponent(slug)}`, { signal }),

  register: (input: RegisterInput) => apiRequest<User>('/api/auth/register', post(input)),

  login: (input: LoginInput) => apiRequest<User>('/api/auth/login', post(input)),

  loginWithGoogle: (credential: string) => apiRequest<User>('/api/auth/google', post({ credential })),

  logout: () => apiRequest<void>('/api/auth/logout', post()),

  /** Always resolves with the same message whether or not the email has an account. */
  forgotPassword: (email: string) => apiRequest<{ message: string }>('/api/auth/forgot-password', post({ email })),

  resetPassword: (token: string, newPassword: string) =>
    apiRequest<void>('/api/auth/reset-password', post({ token, newPassword })),

  /** Silent session check: a missing session is not an error worth redirecting for. */
  me: (signal?: AbortSignal) => apiRequest<User>('/api/auth/me', { signal, redirectOnAuthFailure: false }),

  authProviders: (signal?: AbortSignal) =>
    apiRequest<{ googleClientId: string | null }>('/api/auth/providers', { signal }),

  // Cart: signed-in users
  cart: (signal?: AbortSignal) => apiRequest<CartView>('/api/cart', { signal }),

  cartAdd: (productId: number, quantity: number) =>
    apiRequest<{ cart: CartView; warning: CartWarning | null }>('/api/cart/items', post({ productId, quantity })),

  cartSetQuantity: (productId: number, quantity: number) =>
    apiRequest<{ cart: CartView; warning: CartWarning | null }>(`/api/cart/items/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),

  cartRemove: (productId: number) => apiRequest<CartView>(`/api/cart/items/${productId}`, { method: 'DELETE' }),

  cartClear: () => apiRequest<CartView>('/api/cart', { method: 'DELETE' }),

  /** Idempotent per mergeKey: retrying never adds the guest items twice. */
  cartMerge: (mergeKey: string, items: CartLineInput[]) =>
    apiRequest<{ cart: CartView; skipped: { productId: number; code: string; message: string }[]; alreadyMerged: boolean }>(
      '/api/cart/merge',
      post({ mergeKey, items }),
    ),

  /**
   * Public; a signed-in buyer's cookie links the order to their account. A guest with a stale cookie must not be
   * sent to the login page: if the session cannot be refreshed (server then clears the cookies) we simply retry
   * once as a guest. The idempotencyKey makes the retry safe.
   */
  placeOrder: async (input: PlaceOrderInput): Promise<Order> => {
    const send = () => apiRequest<Order>('/api/orders', { ...post(input), redirectOnAuthFailure: false })
    try {
      return await send()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return send()
      throw err
    }
  },

  myOrders: (page = 0, signal?: AbortSignal) =>
    apiRequest<Page<OrderSummary>>(`/api/orders/me?page=${page}&size=10`, { signal }),

  myOrder: (code: string, signal?: AbortSignal) =>
    apiRequest<Order>(`/api/orders/me/${encodeURIComponent(code)}`, { signal }),

  cancelOrder: (code: string, input: CustomerCancelInput) =>
    apiRequest<Order>(`/api/orders/me/${encodeURIComponent(code)}/cancel`, post(input)),

  /** Code + phone (in the body, never the URL) → a 24-hour tracking link for /don-hang/{code}?t={token}. */
  lookupOrder: (code: string, phone: string) => apiRequest<{ code: string; token: string }>('/api/orders/lookup', post({ code, phone })),

  // Guest tracking links: the token is the proof (public)
  trackOrder: (code: string, token: string, signal?: AbortSignal) =>
    apiRequest<TrackedOrder>(trackPath(code, token), { signal, redirectOnAuthFailure: false }),

  cancelTrackedOrder: (code: string, token: string, input: CustomerCancelInput) =>
    apiRequest<TrackedOrder>(trackPath(code, token, '/cancel'), post(input)),

  /** Creates the account from the order, attaches it and signs in (cookies). */
  claimAccount: (code: string, token: string, input: ClaimAccountInput) =>
    apiRequest<User>(trackPath(code, token, '/claim-account'), post(input)),

  /** Signed in: attach the browser's recent guest orders to the account. */
  claimOrders: (items: { code: string; token: string }[]) =>
    apiRequest<{ claimed: string[]; skipped: string[] }>('/api/orders/claim', {
      ...post(items),
      redirectOnAuthFailure: false,
    }),

  verifyEmail: (token: string) =>
    apiRequest<{ email: string; attachedOrders: number }>('/api/auth/verify-email', post({ token })),

  resendVerification: () => apiRequest<void>('/api/auth/verify-email/resend', post()),

  /** Signed in. Other sessions are signed out; this browser gets new cookies. */
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<User>('/api/auth/change-password', post({ currentPassword, newPassword })),

  /** First password of an invited staff account (public: the token is the proof). */
  acceptInvite: (token: string, newPassword: string) =>
    apiRequest<void>('/api/auth/accept-invite', post({ token, newPassword, acceptTerms: true })),

  // Cart: guests (public). Same shape as a signed-in cart, priced by the server.
  cartValidate: (items: CartLineInput[], signal?: AbortSignal) =>
    apiRequest<CartView>('/api/cart/validate', { ...post({ items }), signal }),
}
