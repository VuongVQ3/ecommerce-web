import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { orderLookupSchema } from '../auth/schemas'
import { useAuthForm } from '../auth/useAuthForm'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { FormError, SubmitButton, TextField } from '../components/FormFields'
import CancelOrderDialog from '../components/CancelOrderDialog'
import OrderDetails, { StatusBadge } from '../components/OrderDetails'
import { useToast } from '../components/Toast'
import { api, ApiError, type Order } from '../lib/api'
import { formatDateTime, formatPrice } from '../lib/format'
import { normalizePhone } from '../lib/phone'
import { useAsync } from '../lib/useAsync'
import { useJustPlaced } from '../lib/useJustPlaced'
import RecentOrders from '../components/RecentOrders'
import { saveRecentOrder, trackingPath } from '../lib/recentOrders'
import { loginUrl } from '../lib/redirect'
import type { PlacedOrderState } from './CheckoutPage'

/**
 * Old address of the "order placed" page. Guests are now sent straight to their tracking link and signed-in buyers
 * to their order; anyone landing here (bookmark, old email) is forwarded.
 */
export function OrderSuccessPage() {
  const { code = '' } = useParams()
  const { refresh } = useAuth()
  // Asks again who is signed in: this tab's idea of the session may be stale (sign-in in another tab)
  const [target, setTarget] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void refresh().then((user) => {
      if (!alive) return
      setTarget(user ? `/tai-khoan/don-hang/${encodeURIComponent(code)}` : `/tra-cuu-don-hang?code=${encodeURIComponent(code)}`)
    })
    return () => {
      alive = false
    }
  }, [refresh, code])
  if (!target) return <Spinner />
  return <Navigate to={target} replace />
}

/** /tai-khoan/don-hang: the signed-in user's orders, newest first, loaded page by page. */
export function MyOrdersPage() {
  const [pages, setPages] = useState(1)
  const list = useAsync(async (signal) => {
    const loaded = await Promise.all(Array.from({ length: pages }, (_, p) => api.myOrders(p, signal)))
    return { items: loaded.flatMap((p) => p.items), hasMore: loaded[loaded.length - 1].page + 1 < loaded[loaded.length - 1].totalPages }
  }, [pages])

  if (list.error) return <ErrorMessage message={list.error.message} onRetry={list.reload} />
  if (!list.data) return <Spinner />
  if (list.data.items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
        <p className="text-4xl" aria-hidden>
          📦
        </p>
        <p className="mt-3 font-semibold text-stone-900">Bạn chưa có đơn hàng nào</p>
        <Link to="/san-pham" className="mt-4 inline-block rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
          Mua sắm ngay
        </Link>
      </div>
    )
  }
  return (
    <div>
      <ul className="space-y-3">
        {list.data.items.map((o) => (
          <li key={o.code}>
            <Link
              to={`/tai-khoan/don-hang/${o.code}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-bold tracking-wider text-stone-900">{o.code}</p>
                <p className="truncate text-sm text-muted">
                  {formatDateTime(o.createdAt)} · {o.itemCount} sản phẩm{o.firstItemName ? ` · ${o.firstItemName}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={o.status} label={o.statusLabel} />
                <span className="font-semibold tabular-nums">{formatPrice(o.total)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {list.data.hasMore && (
        <button
          type="button"
          onClick={() => setPages((p) => p + 1)}
          disabled={list.loading}
          className="mt-4 w-full rounded-full border border-stone-200 bg-white px-6 py-3 font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60"
        >
          {list.loading ? 'Đang tải...' : 'Xem thêm đơn hàng'}
        </button>
      )}
    </div>
  )
}

/** /tai-khoan/don-hang/:code; the buyer can cancel (with a reason) while the order is still pending. */
export function MyOrderDetailPage() {
  const { code = '' } = useParams()
  const toast = useToast()
  const justPlaced = useJustPlaced()
  const detail = useAsync((signal) => api.myOrder(code, signal), [code])
  const [cancelled, setCancelled] = useState<Order | null>(null)
  const [confirming, setConfirming] = useState(false)
  const order = cancelled ?? detail.data

  if (detail.error) {
    return detail.error instanceof ApiError && detail.error.status === 404 ? (
      <p className="text-stone-700">Không tìm thấy đơn hàng này.</p>
    ) : (
      <ErrorMessage message={detail.error.message} onRetry={detail.reload} />
    )
  }
  if (!order) return <Spinner />

  const actions = order.canCancel ? (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-full border border-red-200 bg-white px-5 py-2 text-sm font-semibold text-danger hover:bg-red-50"
    >
      Huỷ đơn hàng
    </button>
  ) : null

  return (
    <div>
      {justPlaced && (
        <div className="mb-6 rounded-3xl border border-brand-200 bg-brand-50 px-6 py-6 text-center" role="status">
          <p className="text-4xl" aria-hidden="true">
            🎉
          </p>
          <p className="mt-2 text-2xl font-extrabold text-brand-900">Đặt hàng thành công!</p>
          <p className="mt-1 text-stone-700">Cửa hàng sẽ gọi xác nhận trước khi giao.</p>
        </div>
      )}
      <Link to="/tai-khoan/don-hang" className="text-sm font-semibold text-brand-700 hover:underline">
        ← Tất cả đơn hàng
      </Link>
      <div className="mt-4">
        <OrderDetails order={order} actions={actions} />
      </div>
      {confirming && (
        <CancelOrderDialog
          code={order.code}
          onClose={() => setConfirming(false)}
          onSubmit={async (input) => {
            try {
              setCancelled(await api.cancelOrder(order.code, input))
            } catch (err) {
              // Confirmed meanwhile: show the fresh status behind the dialog
              if (err instanceof ApiError && err.code === 'ORDER_NOT_CANCELLABLE') detail.reload()
              throw err
            }
            setConfirming(false)
            toast({ tone: 'success', message: `Đã huỷ đơn ${order.code}` })
          }}
        />
      )}
    </div>
  )
}

/** /tra-cuu-don-hang: guests find their order with code + phone. */
/**
 * Guests find an order with its code + phone. A match opens its tracking page (a fresh 24-hour link, also kept in
 * "Đơn hàng gần đây"), where the details are shown with the phone/email hidden and a PENDING order can be cancelled.
 * An order attached to an account asks to sign in instead.
 */
export function OrderLookupPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  // Sent here by checkout when the order could not be opened in an account (session gone at that very moment)
  const placedCode = (useLocation().state as PlacedOrderState | null)?.placedCode
  // Code of an order that belongs to an account (its owner must sign in)
  const [accountOrder, setAccountOrder] = useState<string | null>(null)
  const initialCode = (params.get('code') ?? '').toUpperCase().slice(0, 30)
  const { form, onSubmit, formError, pending } = useAuthForm(
    orderLookupSchema,
    { code: initialCode, phone: '' },
    async (values) => {
      setAccountOrder(null)
      const { code, token } = await api.lookupOrder(values.code.toUpperCase(), normalizePhone(values.phone))
      saveRecentOrder(code, token)
      navigate(trackingPath(code, token), { replace: true })
    },
    {
      onApiError: (err, f) => {
        if (err.code !== 'ORDER_BELONGS_TO_ACCOUNT') return false
        setAccountOrder(f.getValues('code').trim().toUpperCase())
        return true
      },
    },
  )
  const { errors } = form.formState

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">Tra cứu đơn hàng</h1>
      {placedCode && (
        <div role="status" className="mt-6 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-stone-800">
          <p className="font-semibold text-brand-800">Đặt hàng thành công!</p>
          <p className="mt-1 text-sm">
            Mã đơn của bạn: <strong className="tabular-nums">{placedCode}</strong>. Nhập số điện thoại đã dùng khi đặt
            hàng để xem và theo dõi đơn.
          </p>
        </div>
      )}
      <div className="mt-6">
        <RecentOrders />
      </div>
      <p className="mt-6 text-stone-600">Nhập mã đơn (ví dụ HL261013ABCD) và số điện thoại đã dùng khi đặt hàng.</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <TextField label="Mã đơn hàng" requiredMark autoCapitalize="characters" autoComplete="off" error={errors.code?.message} {...form.register('code')} />
        <TextField label="Số điện thoại" requiredMark type="tel" inputMode="tel" autoComplete="tel" error={errors.phone?.message} {...form.register('phone')} />
        <div className="sm:pt-6">
          <SubmitButton pending={pending} pendingLabel="Đang tìm...">
            Tra cứu
          </SubmitButton>
        </div>
      </form>
      <div className="mt-4">
        <FormError message={formError} />
        {accountOrder && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>Đơn này thuộc một tài khoản. Vui lòng đăng nhập để xem.</p>
            <Link
              to={loginUrl(`/tai-khoan/don-hang/${accountOrder}`)}
              className="rounded-full bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
            >
              Đăng nhập
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
