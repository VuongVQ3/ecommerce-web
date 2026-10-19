import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { checkoutSchema } from '../auth/schemas'
import { useAuthForm } from '../auth/useAuthForm'
import { useCart } from '../cart/CartContext'
import { Spinner } from '../components/Feedback'
import { FormError, RequiredLegend, SelectField, SubmitButton, TextField } from '../components/FormFields'
import { PriceTag } from '../components/Price'
import ProductImage from '../components/ProductImage'
import { useProvinces } from '../lib/adminUnits'
import { api, type CartView, type Shortage } from '../lib/api'
import { formatPrice } from '../lib/format'
import { normalizePhone } from '../lib/phone'
import { saveRecentOrder, trackingPath } from '../lib/recentOrders'
import { loginUrl } from '../lib/redirect'
import type { TrackOrderState } from './TrackOrderPage'

/** State handed to the cart page when the order bounced for lack of stock. */
export interface CartPageState {
  shortages?: Shortage[]
}

/**
 * What the buyer typed, kept for this tab only (sessionStorage) so "Đăng nhập" and coming back does not lose it.
 * Cleared once the order is placed.
 */
const DRAFT_KEY = 'hatlanh_checkout_draft_v1'
type Draft = Partial<Record<'customerName' | 'phone' | 'email' | 'provinceCode' | 'wardCode' | 'addressLine' | 'note', string>>

function readDraft(): Draft {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => typeof v === 'string' && v.trim() !== ''),
    ) as Draft
  } catch {
    return {}
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // Storage blocked: the form just is not remembered
  }
}

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

function Summary({ view }: { view: CartView }) {
  return (
    <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-5 md:sticky md:top-24" aria-labelledby="checkout-summary">
      <h2 id="checkout-summary" className="font-bold text-stone-900">
        Đơn hàng ({view.totalQuantity} sản phẩm)
      </h2>
      <ul className="mt-3 divide-y divide-stone-100">
        {view.items.map((line) => (
          <li key={line.productId} className="flex items-center gap-3 py-3 text-sm">
            <ProductImage
              name={line.name}
              imageUrl={line.imageUrl}
              categorySlug={line.categorySlug ?? ''}
              size={48}
              className="size-12 shrink-0 rounded-lg [&>span]:text-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words text-stone-900">{line.name}</p>
              <p className="text-muted tabular-nums">
                <PriceTag price={line.price} regularPrice={line.regularPrice} className="text-sm font-normal" regularClassName="text-xs text-muted" />{' '}
                × {line.quantity}
              </p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{formatPrice(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-2 space-y-1.5 border-t border-stone-100 pt-3 text-sm">
        {view.discountTotal > 0 && (
          <>
            <div className="flex justify-between">
              <dt className="text-stone-600">Giá gốc</dt>
              <dd>
                <s className="tabular-nums text-muted">
                  <span className="sr-only">Giá gốc </span>
                  {formatPrice(view.subtotal + view.discountTotal)}
                </s>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Đã giảm</dt>
              <dd className="font-semibold text-success tabular-nums">−{formatPrice(view.discountTotal)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between">
          <dt className="text-stone-600">Tạm tính</dt>
          <dd className="tabular-nums">{formatPrice(view.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-600">Phí giao hàng</dt>
          <dd className="tabular-nums">{view.shippingFee === 0 ? 'Miễn phí' : formatPrice(view.shippingFee)}</dd>
        </div>
        <div className="flex justify-between border-t border-stone-100 pt-2 text-base">
          <dt className="font-semibold">Tổng cộng</dt>
          <dd className="font-bold text-brand-700 tabular-nums">{formatPrice(view.total)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">Giá và phí giao hàng được tính lại lần cuối khi bạn đặt hàng.</p>
    </aside>
  )
}

/** Where the lookup page is told that an order was just placed (its code), when the account page is not an option. */
export interface PlacedOrderState {
  placedCode?: string
}

function CheckoutForm({ view }: { view: CartView }) {
  const { user, refresh, logout } = useAuth()
  const { resetAfterOrder } = useCart()
  const navigate = useNavigate()
  const provinces = useProvinces()
  // One key per checkout visit: a double click, a retry after a network error or a reload of the request
  // all map to the same order on the server
  const [idempotencyKey] = useState(newKey)

  const { form, onSubmit, formError, pending } = useAuthForm(
    checkoutSchema,
    {
      customerName: user?.fullName ?? '',
      phone: user?.phone ?? '',
      email: user?.email ?? '',
      provinceCode: '',
      wardCode: '',
      addressLine: '',
      note: '',
      // What was typed before signing in wins over the account's details
      ...readDraft(),
    },
    async (values) => {
      const order = await api.placeOrder({
        // Only ids and quantities: the server prices everything
        items: view.items.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        customerName: values.customerName,
        phone: normalizePhone(values.phone),
        email: values.email || undefined,
        provinceCode: Number(values.provinceCode),
        wardCode: Number(values.wardCode),
        addressLine: values.addressLine,
        note: values.note || undefined,
        idempotencyKey,
      })
      resetAfterOrder()
      writeDraft(null)
      const state: TrackOrderState = { justPlaced: true }
      if (order.accessToken) {
        // Guest: straight to the tracking page (reload-proof), and remember it in this browser
        saveRecentOrder(order.code, order.accessToken)
        navigate(trackingPath(order.code, order.accessToken), { replace: true, state })
        return
      }
      // The server saved it to an account: the session cookie is valid even if this tab thought otherwise (signed
      // in from another tab). Ask again rather than sending the buyer to a page that needs a sign-in.
      const owner = user ?? (await refresh())
      if (owner) {
        navigate(`/tai-khoan/don-hang/${order.code}`, { replace: true, state })
      } else {
        const placed: PlacedOrderState = { placedCode: order.code }
        navigate(`/tra-cuu-don-hang?code=${encodeURIComponent(order.code)}`, { replace: true, state: placed })
      }
    },
    {
      onApiError: (err) => {
        if (err.code === 'OUT_OF_STOCK') {
          const state: CartPageState = { shortages: (err.details.items as Shortage[] | undefined) ?? [] }
          navigate('/gio-hang', { state })
          return true
        }
        return false
      },
    },
  )
  const { errors } = form.formState
  const provinceCode = form.watch('provinceCode')
  useEffect(() => {
    const subscription = form.watch((values) => writeDraft(values as Draft))
    return () => subscription.unsubscribe()
  }, [form])
  const wards = provinces?.find((p) => String(p.code) === provinceCode)?.wards ?? []

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <RequiredLegend />
      <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" aria-labelledby="checkout-contact">
        <h2 id="checkout-contact" className="font-bold text-stone-900">
          Thông tin người nhận
        </h2>
        <TextField label="Họ và tên" requiredMark autoComplete="name" error={errors.customerName?.message} {...form.register('customerName')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Số điện thoại"
            requiredMark
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Ví dụ: 0912 345 678"
            hint="Để shipper liên hệ khi giao hàng"
            error={errors.phone?.message}
            {...form.register('phone')}
          />
          <TextField
            label="Email (không bắt buộc)"
            type="email"
            inputMode="email"
            autoComplete="email"
            hint="Nhận email xác nhận đơn hàng"
            error={errors.email?.message}
            {...form.register('email')}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" aria-labelledby="checkout-address">
        <h2 id="checkout-address" className="font-bold text-stone-900">
          Địa chỉ giao hàng
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Tỉnh/Thành phố"
            requiredMark
            placeholder={provinces ? 'Chọn tỉnh/thành phố' : 'Đang tải...'}
            disabled={!provinces}
            autoComplete="address-level1"
            options={(provinces ?? []).map((p) => ({ value: p.code, label: p.name }))}
            error={errors.provinceCode?.message}
            {...form.register('provinceCode', {
              // A ward belongs to one province: picking another province clears it
              onChange: () => form.setValue('wardCode', ''),
            })}
          />
          <SelectField
            label="Phường/Xã"
            requiredMark
            placeholder={provinceCode ? 'Chọn phường/xã' : 'Chọn tỉnh/thành phố trước'}
            disabled={!provinceCode}
            autoComplete="address-level2"
            options={wards.map(([code, name]) => ({ value: code, label: name }))}
            error={errors.wardCode?.message}
            {...form.register('wardCode')}
          />
        </div>
        <TextField
          label="Địa chỉ chi tiết"
          requiredMark
          autoComplete="street-address"
          placeholder="Số nhà, tên đường, toà nhà..."
          error={errors.addressLine?.message}
          {...form.register('addressLine')}
        />
        <div>
          <label htmlFor="checkout-note" className="text-sm font-medium text-stone-700">
            Ghi chú (không bắt buộc)
          </label>
          <textarea
            id="checkout-note"
            rows={3}
            maxLength={500}
            placeholder="Ví dụ: giao giờ hành chính, gọi trước khi giao"
            aria-invalid={errors.note ? true : undefined}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base outline-none placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            {...form.register('note')}
          />
          {errors.note && <p className="mt-1 text-sm text-danger">{errors.note.message}</p>}
        </div>
        <p className="text-xs text-muted">Địa giới hành chính mới từ 01/07/2025 (không còn cấp quận/huyện).</p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" aria-labelledby="checkout-payment">
        <h2 id="checkout-payment" className="font-bold text-stone-900">
          Phương thức thanh toán
        </h2>
        <label className="mt-3 flex items-start gap-3 rounded-xl border-2 border-brand-500 bg-brand-50 p-4">
          <input type="radio" name="paymentMethod" value="COD" checked readOnly className="mt-1 size-4 accent-brand-600" />
          <span>
            <span className="block font-semibold text-stone-900">Thanh toán khi nhận hàng (COD)</span>
            <span className="text-sm text-stone-600">Trả tiền mặt cho shipper khi nhận được hàng.</span>
          </span>
        </label>
      </section>

      <FormError message={formError} />
      {user && (
        <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-stone-700">
          Đơn sẽ được lưu vào tài khoản <strong className="break-words text-stone-900">{user.fullName || user.email}</strong>
          {user.fullName && <span className="break-all text-stone-600"> ({user.email})</span>}.{' '}
          <button type="button" onClick={() => void logout()} className="font-semibold text-brand-700 underline">
            Không phải bạn? Đăng xuất
          </button>
        </p>
      )}
      <SubmitButton pending={pending} pendingLabel="Đang đặt hàng...">
        Đặt hàng · {formatPrice(view.total)}
      </SubmitButton>
    </form>
  )
}

export default function CheckoutPage() {
  const { user, loading: authLoading, refresh } = useAuth()
  const { view, loading } = useCart()
  // The order is saved to whoever the cookies say is signed in: make the page agree before "Đặt hàng"
  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">Thanh toán</h1>
      {!authLoading && !user && (
        <p className="mt-2 text-sm text-stone-700">
          Đã có tài khoản?{' '}
          <Link to={loginUrl('/thanh-toan')} className="font-semibold text-brand-700 underline">
            Đăng nhập để điền nhanh thông tin
          </Link>
        </p>
      )}
      {authLoading || (loading && !view) ? (
        <Spinner />
      ) : !view || view.items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <p className="font-semibold text-stone-900">Giỏ hàng của bạn đang trống</p>
          <Link to="/san-pham" className="mt-4 inline-block rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
            Tiếp tục mua sắm
          </Link>
        </div>
      ) : !view.canCheckout ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
          <p className="font-semibold text-stone-900">Giỏ hàng có sản phẩm đã hết hàng hoặc ngừng kinh doanh</p>
          <p className="mt-1 text-sm text-stone-700">Vui lòng xoá các sản phẩm đó khỏi giỏ để tiếp tục.</p>
          <Link to="/gio-hang" className="mt-4 inline-block rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
            Về giỏ hàng
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-8 md:grid-cols-[1fr_340px]">
          <CheckoutForm view={view} />
          <Summary view={view} />
        </div>
      )}
    </div>
  )
}
