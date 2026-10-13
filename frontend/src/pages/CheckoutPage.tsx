import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { checkoutSchema } from '../auth/schemas'
import { useAuthForm } from '../auth/useAuthForm'
import { useCart } from '../cart/CartContext'
import { Spinner } from '../components/Feedback'
import { FormError, SelectField, SubmitButton, TextField } from '../components/FormFields'
import ProductImage from '../components/ProductImage'
import { useProvinces } from '../lib/adminUnits'
import { api, type CartView, type Order, type Shortage } from '../lib/api'
import { formatPrice } from '../lib/format'
import { normalizePhone } from '../lib/phone'

/** State handed to the cart page when the order bounced for lack of stock. */
export interface CartPageState {
  shortages?: Shortage[]
}

/** State handed to the success page so it can render without another request. */
export interface OrderSuccessState {
  order?: Order
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
              className="size-12 shrink-0 rounded-lg [&>span]:text-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words text-stone-900">{line.name}</p>
              <p className="text-muted tabular-nums">
                {formatPrice(line.price)} × {line.quantity}
              </p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{formatPrice(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-2 space-y-1.5 border-t border-stone-100 pt-3 text-sm">
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

function CheckoutForm({ view }: { view: CartView }) {
  const { user } = useAuth()
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
      const state: OrderSuccessState = { order }
      navigate(`/dat-hang-thanh-cong/${order.code}`, { replace: true, state })
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
  const wards = provinces?.find((p) => String(p.code) === provinceCode)?.wards ?? []

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" aria-labelledby="checkout-contact">
        <h2 id="checkout-contact" className="font-bold text-stone-900">
          Thông tin người nhận
        </h2>
        <TextField label="Họ và tên" autoComplete="name" error={errors.customerName?.message} {...form.register('customerName')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Số điện thoại"
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
      <SubmitButton pending={pending} pendingLabel="Đang đặt hàng...">
        Đặt hàng · {formatPrice(view.total)}
      </SubmitButton>
    </form>
  )
}

export default function CheckoutPage() {
  const { loading: authLoading } = useAuth()
  const { view, loading } = useCart()

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">Thanh toán</h1>
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
