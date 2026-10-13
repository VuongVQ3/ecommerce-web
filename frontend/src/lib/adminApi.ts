import { apiRequest, post, type Order, type OrderStatus, type Page } from './api'

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
}

export interface AdminOrderNote {
  body: string
  createdAt: string
  authorName: string
}

export interface AdminOrderDetail {
  order: Order
  guest: boolean
  carrier: string | null
  trackingNumber: string | null
  notes: AdminOrderNote[]
  /** What the current status allows: the UI only offers these. */
  allowedActions: OrderAction[]
}

export interface OrderFilters {
  status?: OrderStatus | ''
  from?: string
  to?: string
  q?: string
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

export type MovementType = 'ORDER_RESERVE' | 'ORDER_CANCEL' | 'ORDER_SHIP' | 'IMPORT' | 'ADJUST'

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

export interface Dashboard {
  ordersToday: number
  pendingCount: number
  revenue7Days: number
  revenueByDay: { date: string; revenue: number; orders: number }[]
  lowStock: StockRow[]
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
  dashboard: (signal?: AbortSignal) => apiRequest<Dashboard>('/api/admin/dashboard', { signal }),

  orders: (f: OrderFilters, signal?: AbortSignal) =>
    apiRequest<{ page: Page<AdminOrderRow>; pendingCount: number }>(
      `/api/admin/orders${query({ status: f.status, from: f.from, to: f.to, q: f.q, page: f.page })}`,
      { signal },
    ),
  order: (code: string, signal?: AbortSignal) => apiRequest<AdminOrderDetail>(order(code), { signal }),
  confirm: (code: string) => apiRequest<AdminOrderDetail>(`${order(code)}/confirm`, post()),
  ship: (code: string, carrier: string, trackingNumber: string) =>
    apiRequest<AdminOrderDetail>(`${order(code)}/ship`, post({ carrier, trackingNumber })),
  complete: (code: string) => apiRequest<AdminOrderDetail>(`${order(code)}/complete`, post()),
  cancel: (code: string, reason: string) => apiRequest<AdminOrderDetail>(`${order(code)}/cancel`, post({ reason })),
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
