export interface Category {
  id: number
  name: string
  slug: string
}

export interface ProductSummary {
  id: number
  name: string
  slug: string
  price: number
  weightGrams: number
  imageUrl: string | null
  calories: number
  protein: number
  inStock: boolean
  /** How many one shopper can put in the cart now (stock minus reserved, capped per item). */
  maxPurchasable: number
  category: Category
}

export interface Nutrition {
  calories: number
  protein: number
  fat: number
  carbs: number
  fiber: number
}

export interface ProductDetail {
  id: number
  name: string
  slug: string
  description: string
  origin: string | null
  price: number
  weightGrams: number
  /** False when discontinued: the page stays visible but the product cannot be bought. */
  active: boolean
  availableQuantity: number
  maxPurchasable: number
  imageUrl: string | null
  nutritionPer100g: Nutrition
  category: Category
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
  price: number
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

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string>
  /** Machine-readable error code from the backend, e.g. EMAIL_EXISTS. */
  readonly code?: string

  constructor(message: string, status: number, fieldErrors: Record<string, string> = {}, code?: string) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
    this.code = code
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
  if (init.body) headers.set('Content-Type', 'application/json')
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
    throw new ApiError(message, res.status, body?.errors ?? {}, body?.code)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

const post = (body?: unknown): RequestOptions => ({
  method: 'POST',
  body: body === undefined ? undefined : JSON.stringify(body),
})

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

  // Cart: guests (public). Same shape as a signed-in cart, priced by the server.
  cartValidate: (items: CartLineInput[], signal?: AbortSignal) =>
    apiRequest<CartView>('/api/cart/validate', { ...post({ items }), signal }),
}
