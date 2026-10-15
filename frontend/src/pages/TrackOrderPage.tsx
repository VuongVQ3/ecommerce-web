import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { claimAccountSchema, type ClaimAccountForm } from '../auth/schemas'
import { useAuthForm } from '../auth/useAuthForm'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { Checkbox, FormError, PasswordChecklist, PasswordField, SubmitButton, TextField } from '../components/FormFields'
import CancelOrderDialog from '../components/CancelOrderDialog'
import { PriceTag } from '../components/Price'
import { StatusBadge } from '../components/OrderDetails'
import { useToast } from '../components/Toast'
import { api, ApiError, type OrderStatus, type TrackedOrder } from '../lib/api'
import { formatDateTime, formatPrice, formatWeight } from '../lib/format'
import { orderSavings } from '../lib/pricing'
import { removeRecentOrders, saveRecentOrder, trackingPath } from '../lib/recentOrders'
import { loginUrl } from '../lib/redirect'
import { useAsync } from '../lib/useAsync'
import { ORDER_STATUS_LABEL } from '../lib/orderStatus'
import { useJustPlaced } from '../lib/useJustPlaced'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import { LegalLinks } from './AuthPages'

export interface TrackOrderState {
  /** Set by the checkout: show the "order placed" banner (gone after a reload, the page itself stays complete). */
  justPlaced?: boolean
}

const STEPS: { status: OrderStatus; label: string }[] = (['PENDING', 'CONFIRMED', 'SHIPPING', 'COMPLETED'] as const).map(
  (status) => ({ status, label: ORDER_STATUS_LABEL[status] }),
)

const dismissKey = (code: string) => `hatlanh_claim_dismissed_${code}`

/** Copies with the Clipboard API inside the click; if that is unavailable, shows the text selected for manual copy. */
export function CopyButton({ text, label, copiedLabel = 'Đã sao chép' }: { text: string; label: string; copiedLabel?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
      window.setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('manual')
      window.setTimeout(() => inputRef.current?.select(), 0)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-stone-800 hover:bg-stone-50"
      >
        {state === 'copied' ? `✓ ${copiedLabel}` : label}
      </button>
      {state === 'manual' && (
        <input
          ref={inputRef}
          readOnly
          value={text}
          aria-label="Nhấn giữ hoặc Ctrl+C để sao chép"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full min-w-0 rounded-lg border border-stone-300 bg-stone-50 px-2 py-1 text-sm sm:w-80"
        />
      )}
      <span className="sr-only" aria-live="polite">
        {state === 'copied' ? copiedLabel : ''}
      </span>
    </span>
  )
}

function Progress({ order }: { order: TrackedOrder }) {
  if (order.status === 'CANCELLED') {
    const reason = order.history.findLast((h) => h.status === 'CANCELLED')?.reason
    return (
      <div className="rounded-2xl border border-stone-300 bg-stone-100 p-4 text-stone-800">
        <p className="font-semibold">Đơn hàng đã được huỷ</p>
        {reason && <p className="mt-1 text-sm">Lý do: {reason}</p>}
      </div>
    )
  }
  const current = STEPS.findIndex((s) => s.status === order.status)
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Tiến trình đơn hàng">
      {STEPS.map((step, i) => {
        const done = i <= current
        return (
          <li key={step.status} className="flex flex-col items-center gap-1.5 text-center" aria-current={i === current ? 'step' : undefined}>
            <span className="relative flex w-full items-center justify-center">
              {i > 0 && (
                <span aria-hidden="true" className={`absolute right-1/2 h-1 w-full -translate-x-3.5 ${done ? 'bg-brand-600' : 'bg-stone-200'}`} />
              )}
              <span
                className={`relative z-10 flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                  done ? 'bg-brand-600 text-white' : 'border-2 border-stone-300 bg-white text-stone-500'
                }`}
              >
                {done ? <span aria-hidden="true">✓</span> : i + 1}
                <span className="sr-only">{done ? ' (đã qua)' : ' (chưa tới)'}</span>
              </span>
            </span>
            <span className={`text-xs leading-tight sm:text-sm ${i === current ? 'font-semibold text-stone-900' : 'text-stone-600'}`}>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Guest, not attached yet: offer an account built from the order's own details (password + consent only). */
function ClaimAccountBox({ order, token }: { order: TrackedOrder; token: string }) {
  const { signedIn } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(dismissKey(order.code)) === '1'
    } catch {
      return false
    }
  })
  const [accountExists, setAccountExists] = useState(false)
  const [passwordsVisible, setPasswordsVisible] = useState(false)
  const checklistId = useId()
  const confirmId = useId()

  const { form, onSubmit, formError, pending } = useAuthForm<ClaimAccountForm>(
    claimAccountSchema(!order.hasEmail),
    { email: '', password: '', confirmPassword: '', marketingConsent: false },
    async (values) => {
      const user = await api.claimAccount(order.code, token, {
        password: values.password,
        acceptTerms: true,
        marketingConsent: values.marketingConsent,
        email: order.hasEmail ? undefined : values.email,
      })
      removeRecentOrders([order.code])
      signedIn(user)
      toast({ tone: 'success', message: 'Đã tạo tài khoản. Đơn hàng đã được lưu.' })
      navigate(`/tai-khoan/don-hang/${order.code}`, { replace: true })
    },
    {
      onApiError: (err) => {
        if (err.code === 'ACCOUNT_EXISTS') {
          setAccountExists(true)
          return true
        }
        return false
      },
    },
  )
  const { errors } = form.formState
  const password = form.watch('password')

  if (dismissed) return null
  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(dismissKey(order.code), '1')
    } catch {
      // Not remembered: the box comes back next time, nothing else breaks
    }
  }

  return (
    <section className="relative rounded-2xl border border-brand-200 bg-brand-50 p-5 sm:p-6" aria-labelledby="claim-title">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Đóng lời mời tạo tài khoản"
        className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full text-xl text-stone-600 hover:bg-white"
      >
        ×
      </button>
      <h2 id="claim-title" className="pr-8 text-lg font-bold text-stone-900">
        Lưu đơn hàng vào tài khoản
      </h2>
      <ul className="mt-2 space-y-1 text-sm text-stone-700">
        <li>✓ Theo dõi mọi đơn hàng ở một nơi, không cần giữ link hay mã đơn</li>
        <li>✓ Không phải nhập mã đơn và số điện thoại để tra cứu</li>
        <li>✓ Lần sau đặt nhanh hơn: tên, số điện thoại, email được điền sẵn</li>
      </ul>

      {accountExists ? (
        <div className="mt-4 rounded-xl bg-white p-4" role="alert">
          <p className="text-stone-800">Email hoặc số điện thoại này đã có tài khoản.</p>
          <Link
            to={loginUrl(trackingPath(order.code, token))}
            className="mt-3 inline-block rounded-full bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
          >
            Đăng nhập để lưu đơn
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <dl className="grid gap-2 rounded-xl bg-white p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Họ tên</dt>
              <dd className="font-medium break-words text-stone-900">{order.customerName}</dd>
            </div>
            {order.hasEmail && (
              <div>
                <dt className="text-muted">Email</dt>
                <dd className="font-medium break-all text-stone-900">{order.maskedEmail}</dd>
              </div>
            )}
          </dl>
          {!order.hasEmail && (
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              hint="Đơn hàng chưa có email: dùng email này để đăng nhập"
              error={errors.email?.message}
              {...form.register('email')}
            />
          )}
          <div>
            <PasswordField
              label="Mật khẩu"
              autoComplete="new-password"
              error={errors.password?.message}
              describedBy={checklistId}
              visible={passwordsVisible}
              onVisibleChange={setPasswordsVisible}
              alsoControls={confirmId}
              {...form.register('password')}
            />
            <PasswordChecklist id={checklistId} value={password} />
          </div>
          <TextField
            id={confirmId}
            label="Nhập lại mật khẩu"
            type={passwordsVisible ? 'text' : 'password'}
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...form.register('confirmPassword')}
          />
          <Checkbox label="Nhận thông tin khuyến mãi qua email" {...form.register('marketingConsent')} />
          <p className="text-sm text-stone-700">
            Bằng việc tạo tài khoản, bạn đồng ý với <LegalLinks />.
          </p>
          <FormError message={formError} />
          <SubmitButton pending={pending} pendingLabel="Đang tạo tài khoản...">
            Tạo tài khoản
          </SubmitButton>
        </form>
      )}
    </section>
  )
}

/** Signed in but this guest order is not attached yet (e.g. came back through the link): one click to save it. */
function SaveToAccount({ order, token }: { order: TrackedOrder; token: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const result = await api.claimOrders([{ code: order.code, token }])
      if (result.claimed.includes(order.code)) {
        removeRecentOrders([order.code])
        toast({ tone: 'success', message: 'Đã lưu đơn hàng vào tài khoản' })
        navigate(`/tai-khoan/don-hang/${order.code}`, { replace: true })
      } else {
        toast({ tone: 'error', message: 'Không lưu được đơn hàng này' })
      }
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Không lưu được đơn hàng này' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-5">
      <p className="text-stone-800">Lưu đơn này vào tài khoản của bạn để xem trong "Đơn hàng của tôi".</p>
      <button type="button" onClick={save} disabled={busy} className="rounded-full bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-70">
        {busy ? 'Đang lưu...' : 'Lưu vào tài khoản'}
      </button>
    </section>
  )
}

export default function TrackOrderPage() {
  const { code = '' } = useParams()
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const justPlaced = useJustPlaced()
  usePageMeta(`Đơn hàng ${code} | ${BRAND}`)

  // Always from the server: a reload, a bookmark or another device shows the same page
  const { data, error, reload } = useAsync(
    (signal) => (token ? api.trackOrder(code, token, signal) : Promise.reject(new ApiError('Thiếu mã theo dõi', 404))),
    [code, token],
  )
  const [updated, setUpdated] = useState<TrackedOrder | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const order = updated?.code === code ? updated : data?.code === code ? data : null
  const notFound = error instanceof ApiError && error.status === 404

  // Opened from an email or another device: remember it in this browser's recent orders too
  useEffect(() => {
    if (data?.canClaim) saveRecentOrder(data.code, token)
  }, [data, token])

  // A link that no longer works: forget it; if the order was saved to this account, go there instead
  useEffect(() => {
    if (!notFound) return
    removeRecentOrders([code])
    if (authLoading || !user) return
    const controller = new AbortController()
    api.myOrder(code, controller.signal).then(
      () => navigate(`/tai-khoan/don-hang/${code}`, { replace: true }),
      () => {},
    )
    return () => controller.abort()
  }, [notFound, code, user, authLoading, navigate])

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-stone-900">Không mở được link theo dõi</h1>
        <p className="mt-3 text-stone-700">
          Link không đúng, đã hết hạn (sau 180 ngày) hoặc đơn hàng đã được lưu vào tài khoản. Bạn vẫn có thể tra cứu
          bằng mã đơn và số điện thoại đã dùng khi đặt hàng.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to={`/tra-cuu-don-hang?code=${encodeURIComponent(code)}`}
            className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
          >
            Tra cứu đơn hàng
          </Link>
          {user && (
            <Link to="/tai-khoan/don-hang" className="rounded-full border border-stone-300 bg-white px-6 py-3 font-semibold text-stone-800">
              Đơn hàng của tôi
            </Link>
          )}
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorMessage message={error.message} onRetry={reload} />
      </div>
    )
  }
  if (!order) return <Spinner />

  const link = `${window.location.origin}${trackingPath(order.code, token)}`

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-10">
      {justPlaced && (
        <div className="rounded-3xl border border-brand-200 bg-brand-50 px-6 py-6 text-center" role="status">
          <p className="text-4xl" aria-hidden="true">
            🎉
          </p>
          <h1 className="mt-2 text-2xl font-extrabold text-brand-900">Đặt hàng thành công!</h1>
          <p className="mt-1 text-stone-700">Cửa hàng sẽ gọi xác nhận trước khi giao.</p>
        </div>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" aria-labelledby="order-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Mã đơn hàng</p>
            {justPlaced ? (
              <p id="order-title" className="text-2xl font-extrabold tracking-wider text-stone-900 tabular-nums">
                {order.code}
              </p>
            ) : (
              <h1 id="order-title" className="text-2xl font-extrabold tracking-wider text-stone-900 tabular-nums">
                {order.code}
              </h1>
            )}
            <p className="text-sm text-muted">Đặt lúc {formatDateTime(order.createdAt)}</p>
          </div>
          <StatusBadge status={order.status} label={order.statusLabel} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={order.code} label="Sao chép mã đơn" copiedLabel="Đã sao chép mã" />
          <CopyButton text={link} label="Sao chép link theo dõi" copiedLabel="Đã sao chép link" />
        </div>
        <p className="mt-2 text-sm text-stone-600">
          Lưu link này để theo dõi đơn hàng của bạn. Link dành riêng cho đơn này, vui lòng không chia sẻ.
        </p>
        <div className="mt-6">
          <Progress order={order} />
        </div>
        {order.carrier && (
          <p className="mt-5 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-800">
            Đơn vị vận chuyển: <strong>{order.carrier}</strong> · Mã vận đơn:{' '}
            <strong className="font-mono">{order.trackingNumber}</strong>
          </p>
        )}
        {order.canCancel && (
          <button
            type="button"
            onClick={() => setCancelling(true)}
            className="mt-5 rounded-full border border-red-200 bg-white px-5 py-2 text-sm font-semibold text-danger hover:bg-red-50"
          >
            Huỷ đơn hàng
          </button>
        )}
      </section>

      {order.canClaim && !authLoading && (user ? <SaveToAccount order={order} token={token} /> : null)}

      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" aria-labelledby="items-title">
        <h2 id="items-title" className="font-bold text-stone-900">
          Sản phẩm
        </h2>
        <ul className="mt-3 divide-y divide-stone-100">
          {order.items.map((item) => (
            <li key={item.productId} className="flex justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-medium break-words text-stone-900">{item.productName}</p>
                <p className="text-sm text-muted tabular-nums">
                  <PriceTag price={item.unitPrice} regularPrice={item.regularUnitPrice} className="text-sm font-normal" regularClassName="text-xs text-muted" />{' '}
                  × {item.quantity} · {formatWeight(item.weightGrams)}
                </p>
              </div>
              <p className="font-semibold text-stone-900 tabular-nums">{formatPrice(item.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-600">Tạm tính</dt>
            <dd className="tabular-nums">{formatPrice(order.subtotal)}</dd>
          </div>
          {orderSavings(order.items) > 0 && (
            <div className="flex justify-between">
              <dt className="text-stone-600">Tiết kiệm nhờ khuyến mại</dt>
              <dd className="font-semibold text-success tabular-nums">{formatPrice(orderSavings(order.items))}</dd>
            </div>
          )}

          <div className="flex justify-between">
            <dt className="text-stone-600">Phí giao hàng</dt>
            <dd className="tabular-nums">{order.shippingFee === 0 ? 'Miễn phí' : formatPrice(order.shippingFee)}</dd>
          </div>
          <div className="flex justify-between gap-3 pt-1 text-base">
            <dt className="font-semibold">Tổng thanh toán khi nhận hàng (COD)</dt>
            <dd className="font-bold text-brand-700 tabular-nums">{formatPrice(order.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" aria-labelledby="delivery-title">
        <h2 id="delivery-title" className="font-bold text-stone-900">
          Giao tới
        </h2>
        <p className="mt-2 text-stone-800">
          {order.customerName} · <span className="tabular-nums">{order.maskedPhone}</span>
        </p>
        <p className="text-stone-700">
          {order.addressLine}, {order.ward}, {order.province}
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" aria-labelledby="history-title">
        <h2 id="history-title" className="font-bold text-stone-900">
          Lịch sử đơn hàng
        </h2>
        <ol className="mt-3 space-y-3 border-l-2 border-brand-100 pl-4">
          {order.history.map((h, i) => (
            <li key={`${h.status}-${i}`}>
              <p className="font-semibold text-stone-900">{h.label}</p>
              <p className="text-sm text-muted">
                {formatDateTime(h.at)}
                {h.reason && ` · ${h.reason}`}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {order.canClaim && !authLoading && !user && <ClaimAccountBox order={order} token={token} />}

      {cancelling && (
        <CancelOrderDialog
          code={order.code}
          onClose={() => setCancelling(false)}
          onSubmit={async (input) => {
            const o = await api.cancelTrackedOrder(order.code, token, input)
            setUpdated(o)
            setCancelling(false)
            toast({ tone: 'success', message: `Đã huỷ đơn ${o.code}` })
          }}
        />
      )}
    </div>
  )
}
