import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { orderLookupSchema } from '../auth/schemas'
import { useAuthForm } from '../auth/useAuthForm'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { FormError, SubmitButton, TextField } from '../components/FormFields'
import OrderDetails, { StatusBadge } from '../components/OrderDetails'
import { useToast } from '../components/Toast'
import { api, ApiError, type Order } from '../lib/api'
import { formatDateTime, formatPrice } from '../lib/format'
import { normalizePhone } from '../lib/phone'
import { useAsync } from '../lib/useAsync'
import type { OrderSuccessState } from './CheckoutPage'

export function OrderSuccessPage() {
  const { code = '' } = useParams()
  const { user } = useAuth()
  const fromCheckout = (useLocation().state as OrderSuccessState | null)?.order
  // After a reload the state is gone: signed-in buyers can re-fetch their order; guests get the code and lookup link
  const fetched = useAsync(
    (signal) => (fromCheckout || !user ? Promise.resolve(null) : api.myOrder(code, signal)),
    [code, user?.id],
  )
  const order = fromCheckout ?? fetched.data ?? null

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-3xl border border-brand-200 bg-brand-50 px-6 py-8 text-center">
        <p className="text-5xl" aria-hidden>
          🎉
        </p>
        <h1 className="mt-3 text-2xl font-extrabold text-brand-900 sm:text-3xl">Đặt hàng thành công!</h1>
        <p className="mt-2 text-stone-700">
          Mã đơn của bạn là <strong className="tracking-wider text-stone-900">{code}</strong>. Cửa hàng sẽ gọi xác nhận trước khi giao.
        </p>
        {order && (
          <p className="mt-1 text-stone-700">
            Thanh toán khi nhận hàng: <strong className="text-brand-700 tabular-nums">{formatPrice(order.total)}</strong>
          </p>
        )}
      </div>
      <div className="mt-8">
        {order ? (
          <OrderDetails order={order} />
        ) : fetched.loading && user ? (
          <Spinner />
        ) : (
          <p className="text-center text-stone-700">
            Lưu lại mã đơn để{' '}
            <Link to="/tra-cuu-don-hang" className="font-semibold text-brand-700 hover:underline">
              tra cứu đơn hàng
            </Link>{' '}
            bằng mã đơn và số điện thoại.
          </p>
        )}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/san-pham" className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
          Tiếp tục mua sắm
        </Link>
        {user && (
          <Link to="/tai-khoan/don-hang" className="rounded-full border border-stone-200 bg-white px-6 py-3 font-semibold text-stone-800 hover:bg-stone-50">
            Đơn hàng của tôi
          </Link>
        )}
      </div>
    </div>
  )
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

/** /tai-khoan/don-hang/:code, with a two-step "cancel" while the order is still pending. */
export function MyOrderDetailPage() {
  const { code = '' } = useParams()
  const toast = useToast()
  const detail = useAsync((signal) => api.myOrder(code, signal), [code])
  const [cancelled, setCancelled] = useState<Order | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const order = cancelled ?? detail.data

  if (detail.error) {
    return detail.error instanceof ApiError && detail.error.status === 404 ? (
      <p className="text-stone-700">Không tìm thấy đơn hàng này.</p>
    ) : (
      <ErrorMessage message={detail.error.message} onRetry={detail.reload} />
    )
  }
  if (!order) return <Spinner />

  const cancel = async () => {
    setBusy(true)
    try {
      setCancelled(await api.cancelOrder(order.code))
      toast({ tone: 'success', message: `Đã huỷ đơn ${order.code}` })
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Không huỷ được đơn hàng' })
      detail.reload()
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const actions = order.canCancel ? (
    confirming ? (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4" role="alert">
        <p className="flex-1 text-sm text-stone-800">Huỷ đơn {order.code}? Thao tác này không hoàn tác được.</p>
        <button type="button" onClick={cancel} disabled={busy} className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
          {busy ? 'Đang huỷ...' : 'Huỷ đơn'}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
          Giữ đơn
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-red-200 bg-white px-5 py-2 text-sm font-semibold text-danger hover:bg-red-50"
      >
        Huỷ đơn hàng
      </button>
    )
  ) : null

  return (
    <div>
      <Link to="/tai-khoan/don-hang" className="text-sm font-semibold text-brand-700 hover:underline">
        ← Tất cả đơn hàng
      </Link>
      <div className="mt-4">
        <OrderDetails order={order} actions={actions} />
      </div>
    </div>
  )
}

/** /tra-cuu-don-hang: guests find their order with code + phone. */
export function OrderLookupPage() {
  const [order, setOrder] = useState<Order | null>(null)
  const { form, onSubmit, formError, pending } = useAuthForm(orderLookupSchema, { code: '', phone: '' }, async (values) => {
    setOrder(null)
    setOrder(await api.lookupOrder(values.code.toUpperCase(), normalizePhone(values.phone)))
  })
  const { errors } = form.formState

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">Tra cứu đơn hàng</h1>
      <p className="mt-1 text-stone-600">Nhập mã đơn (ví dụ HL261013ABCD) và số điện thoại đã dùng khi đặt hàng.</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <TextField label="Mã đơn hàng" autoCapitalize="characters" autoComplete="off" error={errors.code?.message} {...form.register('code')} />
        <TextField label="Số điện thoại" type="tel" inputMode="tel" autoComplete="tel" error={errors.phone?.message} {...form.register('phone')} />
        <div className="sm:pt-6">
          <SubmitButton pending={pending} pendingLabel="Đang tìm...">
            Tra cứu
          </SubmitButton>
        </div>
      </form>
      <div className="mt-4">
        <FormError message={formError} />
      </div>
      {order && (
        <div className="mt-8">
          <OrderDetails
            order={order}
            actions={
              order.canCancel && (
                <p className="text-sm text-stone-600">Muốn huỷ đơn? Vui lòng gọi hotline 0900 000 000.</p>
              )
            }
          />
        </div>
      )}
    </div>
  )
}
