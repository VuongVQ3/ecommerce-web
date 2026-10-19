import { apiRequest, post, type Order, type OrderStatus, type Page, type Role } from './api'
import type { CancelReasonCode } from './orderStatus'

export type OrderAction = 'CONFIRM' | 'SHIP' | 'COMPLETE' | 'CANCEL'

export interface AdminOrderRow {
  code: string
  status: OrderStatus
  statusLabel: string
  createdAt: string
  customerName: string
  phone: string
  itemCount: number
  total: number
  /** Set when the phone number is flagged */
  flagLevel: PhoneFlagLevel | null
  flagReason: string | null
}

export interface AdminOrderNote {
  body: string
  createdAt: string
  authorName: string
}

export interface AdminOrderDetail {
  order: Order
  guest: boolean
  /** Who placed it while signed in; null for a guest order (or a deleted account) */
  account: { id: string; fullName: string; email: string; role: Role } | null
  /** True only when the backend says the owning account no longer exists (missing = unknown, e.g. older API) */
  accountDeleted?: boolean
  carrier: string | null
  trackingNumber: string | null
  notes: AdminOrderNote[]
  /** What the current status allows: the UI only offers these. */
  allowedActions: OrderAction[]
  cancelReasonCode: CancelReasonCode | null
}

export interface OrderFilters {
  status?: OrderStatus | ''
  from?: string
  to?: string
  q?: string
  /** Only orders cancelled with this reason */
  cancelReasonCode?: CancelReasonCode | ''
  page?: number
}

export interface StockRow {
  id: number
  name: string
  slug: string
  active: boolean
  onHand: number
  reserved: number
  available: number
  lowStockThreshold: number
  lowStock: boolean
}

export type MovementType = 'ORDER_RESERVE' | 'ORDER_CANCEL' | 'ORDER_SHIP' | 'IMPORT' | 'ADJUST' | 'RETURN'

export interface MovementRow {
  id: string
  type: MovementType
  quantity: number
  note: string | null
  unitCost: number | null
  supplier: string | null
  orderCode: string | null
  actorName: string | null
  createdAt: string
}

export interface StocktakeResult {
  stock: StockRow
  previousOnHand: number
  counted: number
  difference: number
}

/** Needs doing now, whatever day the dashboard shows */
export interface DashboardNow {
  pendingCount: number
  pendingOver24h: number
  lowStockCount: number
  lowStock: StockRow[]
}

/** One Vietnam day: orders created, their value (cancelled left out), revenue completed, orders cancelled */
export interface DashboardDayTotals {
  ordersCreated: number
  grossValue: number
  revenue: number
  cancelled: number
  /** Most common reason among the day's cancellations (label), null when none */
  topCancelReason: string | null
}

export interface DashboardDay extends DashboardDayTotals {
  /** yyyy-MM-dd */
  date: string
  previous: DashboardDayTotals
  topProducts: { productId: number; name: string; quantity: number; amount: number }[]
  /** Newest first, at most 20 */
  orders: { code: string; createdAt: string; customerName: string; total: number; status: OrderStatus; statusLabel: string }[]
  /** 7 days ending on date: revenue from orders completed that day */
  last7Days: { date: string; revenue: number; orders: number }[]
}

export interface AdminProductRow {
  id: number
  name: string
  slug: string
  categoryName: string
  price: number
  active: boolean
  onHand: number
  reserved: number
  available: number
  lowStockThreshold: number
  lowStock: boolean
  imageUrl: string | null
}

export interface AdminImage {
  id: string
  url: string
  width: number | null
  height: number | null
  primary: boolean
}

export interface ProductInput {
  name: string
  /** Empty: generated from the name. */
  slug: string
  categoryId: number
  description: string
  origin: string
  price: number
  weightGrams: number
  calories: number
  protein: number
  fat: number
  carbs: number
  fiber: number
  lowStockThreshold: number
}

export interface AdminProduct extends Omit<ProductInput, 'origin'> {
  id: number
  origin: string | null
  active: boolean
  onHand: number
  reserved: number
  available: number
  images: AdminImage[]
  /** End (exclusive) of the last running or upcoming promotion: the regular price cannot change until then */
  priceLockedUntil: string | null
}

export interface AdminCategory {
  id: number
  name: string
  slug: string
  productCount: number
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

const put = (body: unknown) => ({ method: 'PUT', body: JSON.stringify(body) })
const order = (code: string) => `/api/admin/orders/${encodeURIComponent(code)}`

export const adminApi = {
  dashboardNow: (signal?: AbortSignal) => apiRequest<DashboardNow>('/api/admin/dashboard/now', { signal }),
  dashboardDay: (date: string, signal?: AbortSignal) =>
    apiRequest<DashboardDay>(`/api/admin/dashboard/day${query({ date })}`, { signal }),

  orders: (f: OrderFilters, signal?: AbortSignal) =>
    apiRequest<{ page: Page<AdminOrderRow>; pendingCount: number }>(
      `/api/admin/orders${query({ status: f.status, from: f.from, to: f.to, q: f.q, cancelReasonCode: f.cancelReasonCode, page: f.page })}`,
      { signal },
    ),
  order: (code: string, signal?: AbortSignal) => apiRequest<AdminOrderDetail>(order(code), { signal }),
  /** UNREACHABLE only writes the note; the order stays PENDING. */
  confirm: (code: string, contact: ContactResult, note: string) =>
    apiRequest<AdminOrderDetail>(`${order(code)}/confirm`, post({ contact, note: note || undefined })),
  ship: (code: string, carrier: string, trackingNumber: string) =>
    apiRequest<AdminOrderDetail>(`${order(code)}/ship`, post({ carrier, trackingNumber })),
  complete: (code: string) => apiRequest<AdminOrderDetail>(`${order(code)}/complete`, post()),
  cancel: (code: string, reasonCode: CancelReasonCode, reason: string) =>
    apiRequest<AdminOrderDetail>(`${order(code)}/cancel`, post({ reasonCode, reason })),

  customerStats: (phone: string, excludeCode: string, signal?: AbortSignal) =>
    apiRequest<CustomerStats>(
      `/api/admin/customers/by-phone/${encodeURIComponent(phone)}/stats?exclude=${encodeURIComponent(excludeCode)}`,
      { signal },
    ),
  phoneFlags: (level: PhoneFlagLevel | '', q: string, page: number, signal?: AbortSignal) =>
    apiRequest<Page<PhoneFlagView>>(`/api/admin/phone-flags${query({ level, q, page })}`, { signal }),
  setPhoneFlag: (phone: string, level: PhoneFlagLevel, reason: string) =>
    apiRequest<PhoneFlagView>(`/api/admin/phone-flags/${encodeURIComponent(phone)}`, put({ level, reason })),
  removePhoneFlag: (phone: string, reason: string) =>
    apiRequest<void>(`/api/admin/phone-flags/${encodeURIComponent(phone)}/remove`, post({ reason })),
  addNote: (code: string, body: string) => apiRequest<AdminOrderDetail>(`${order(code)}/notes`, post({ body })),

  inventory: (q: string, low: boolean, signal?: AbortSignal) =>
    apiRequest<Page<StockRow>>(`/api/admin/inventory${query({ q, low, size: 100 })}`, { signal }),
  importStock: (productId: number, input: { quantity: number; unitCost?: number; supplier?: string; note?: string }) =>
    apiRequest<StockRow>(`/api/admin/inventory/${productId}/import`, post(input)),
  stocktake: (productId: number, counted: number, reason: string) =>
    apiRequest<StocktakeResult>(`/api/admin/inventory/${productId}/stocktake`, post({ counted, reason })),
  movements: (productId: number, page: number, signal?: AbortSignal) =>
    apiRequest<Page<MovementRow>>(`/api/admin/inventory/${productId}/movements${query({ page })}`, { signal }),

  products: (q: string, active: '' | 'true' | 'false', page: number, signal?: AbortSignal) =>
    apiRequest<Page<AdminProductRow>>(`/api/admin/products${query({ q, active, page })}`, { signal }),
  product: (id: number, signal?: AbortSignal) => apiRequest<AdminProduct>(`/api/admin/products/${id}`, { signal }),
  createProduct: (input: ProductInput) => apiRequest<AdminProduct>('/api/admin/products', post(input)),
  updateProduct: (id: number, input: ProductInput) => apiRequest<AdminProduct>(`/api/admin/products/${id}`, put(input)),
  setActive: (id: number, active: boolean) =>
    apiRequest<AdminProduct>(`/api/admin/products/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  uploadImage: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiRequest<AdminProduct>(`/api/admin/products/${id}/images`, { method: 'POST', body: form })
  },
  deleteImage: (id: number, imageId: string) =>
    apiRequest<AdminProduct>(`/api/admin/products/${id}/images/${imageId}`, { method: 'DELETE' }),
  makePrimary: (id: number, imageId: string) =>
    apiRequest<AdminProduct>(`/api/admin/products/${id}/images/${imageId}/primary`, post()),

  categories: (signal?: AbortSignal) => apiRequest<AdminCategory[]>('/api/admin/categories', { signal }),
  createCategory: (name: string, slug: string) =>
    apiRequest<AdminCategory>('/api/admin/categories', post({ name, slug: slug || null })),
  renameCategory: (id: number, name: string, slug: string) =>
    apiRequest<AdminCategory>(`/api/admin/categories/${id}`, put({ name, slug: slug || null })),
}

// ---- Promotions (ADMIN) ----

export type PromotionStatus = 'UPCOMING' | 'RUNNING' | 'ENDED' | 'CANCELLED'

export interface PromotionRow {
  id: string
  productId: number
  productName: string
  productSlug: string
  /** Current regular price of the product */
  regularPrice: number
  salePrice: number
  discountPercent: number
  startsAt: string
  /** Exclusive */
  endsAt: string
  status: PromotionStatus
  /** Promotion days of this product in the current year */
  productDaysThisYear: number
}

export interface PromotionUsage {
  year: number
  maxDaysPerYear: number
  maxDiscountPercent: number
  products: { id: number; name: string; price: number; active: boolean; daysUsed: number; runningSalePrice: number | null }[]
}

export interface PromotionInput {
  productId: number
  salePrice: number
  startsAt: string
  endsAt: string
}

export interface BulkPromotionResult {
  productId: number
  productName: string
  ok: boolean
  salePrice: number | null
  promotionId: string | null
  code: string | null
  message: string | null
}

export const promotionApi = {
  list: (signal?: AbortSignal) => apiRequest<PromotionRow[]>('/api/admin/promotions', { signal }),
  usage: (year?: number, signal?: AbortSignal) =>
    apiRequest<PromotionUsage>(`/api/admin/promotions/usage${year ? `?year=${year}` : ''}`, { signal }),
  create: (input: PromotionInput) => apiRequest<PromotionRow>('/api/admin/promotions', post(input)),
  update: (id: string, input: PromotionInput) =>
    apiRequest<PromotionRow>(`/api/admin/promotions/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  end: (id: string) => apiRequest<PromotionRow>(`/api/admin/promotions/${id}/end`, post()),
  bulk: (input: { productIds: number[]; percentOff: number; startsAt: string; endsAt: string }) =>
    apiRequest<BulkPromotionResult[]>('/api/admin/promotions/bulk', post(input)),
}

// ---- Customers, phone flags, users, audit log ----

export type ContactResult = 'CALLED' | 'ZALO' | 'UNREACHABLE'
export type PhoneFlagLevel = 'WATCH' | 'BLOCK_COD'

export interface PhoneFlagView {
  phone: string
  level: PhoneFlagLevel
  reason: string
  createdAt: string
  updatedAt: string
  updatedByName: string | null
}

export interface CustomerStats {
  phone: string
  /** All orders with this number, including the one being looked at */
  totalOrders: number
  /** Orders placed before the one being looked at ("Khách mới" when 0) */
  previousOrders: number
  completed: number
  cancelled: number
  refusedDelivery: number
  /** Earliest OTHER order */
  firstOrderAt: string | null
  flag: PhoneFlagView | null
}

export interface AdminUserRow {
  id: string
  fullName: string
  email: string
  phone: string | null
  role: Role
  active: boolean
  emailVerified: boolean
  invitationPending: boolean
  orderCount: number
  spent: number
  createdAt: string
}

export interface AdminUserDetail {
  user: AdminUserRow
  orders: { code: string; status: OrderStatus; statusLabel: string; createdAt: string; total: number }[]
}

export interface AuditRow {
  id: string
  createdAt: string
  actorId: string | null
  /** STAFF, CUSTOMER (actorName = the account, or the name on the order for guests) or SYSTEM */
  actorType: 'STAFF' | 'CUSTOMER' | 'SYSTEM'
  actorName: string | null
  actorEmail: string | null
  action: string
  entityType: string
  entityId: string
  /** Name when written (current name for older rows); null when unknown */
  entityLabel: string | null
  reasonCode: string | null
  reason: string | null
  /** Changed fields only (older rows: whole snapshots); null when not applicable. Text is tolerated (see snapshot()). */
  before: Record<string, unknown> | string | null
  after: Record<string, unknown> | string | null
}

export interface AuditFilters {
  actorId?: string
  entityType?: string
  action?: string
  from?: string
  to?: string
  page?: number
  size?: number
}

export const userApi = {
  list: (f: { q?: string; role?: Role | ''; active?: '' | 'true' | 'false'; page?: number }, signal?: AbortSignal) =>
    apiRequest<Page<AdminUserRow>>(`/api/admin/users${query({ q: f.q, role: f.role, active: f.active, page: f.page })}`, { signal }),
  detail: (id: string, signal?: AbortSignal) => apiRequest<AdminUserDetail>(`/api/admin/users/${id}`, { signal }),
  changeRole: (id: string, role: Role, reason: string) =>
    apiRequest<AdminUserRow>(`/api/admin/users/${id}/role`, post({ role, reason })),
  setActive: (id: string, active: boolean, reason: string) =>
    apiRequest<AdminUserRow>(`/api/admin/users/${id}/active`, post({ active, reason })),
  invite: (fullName: string, email: string, reason: string) =>
    apiRequest<AdminUserRow>('/api/admin/users/invitations', post({ fullName, email, reason })),
  auditLogs: (f: AuditFilters, signal?: AbortSignal) =>
    apiRequest<Page<AuditRow>>(`/api/admin/audit-logs${query({ ...f })}`, { signal }),
  auditActors: (signal?: AbortSignal) =>
    apiRequest<{ id: string; name: string; email: string }[]>('/api/admin/audit-logs/actors', { signal }),
}
