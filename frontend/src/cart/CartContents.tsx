import { useId } from 'react'
import { Link } from 'react-router'
import ProductImage from '../components/ProductImage'
import { useToast } from '../components/Toast'
import type { CartLine, CartView } from '../lib/api'
import { formatPrice } from '../lib/format'
import { useCart } from './CartContext'
import QuantityStepper from './QuantityStepper'

const STATUS_NOTE: Partial<Record<CartLine['status'], (l: CartLine) => string>> = {
  PRICE_CHANGED: () => 'Giá đã thay đổi kể từ khi bạn thêm vào giỏ.',
  QTY_REDUCED: (l) => `Chỉ còn ${l.maxPurchasable} sản phẩm, số lượng đã được giảm.`,
  OUT_OF_STOCK: () => 'Sản phẩm đã hết hàng. Vui lòng xoá khỏi giỏ để thanh toán.',
  UNAVAILABLE: () => 'Sản phẩm đã ngừng kinh doanh. Vui lòng xoá khỏi giỏ để thanh toán.',
}

function Line({ line, onNavigate }: { line: CartLine; onNavigate?: () => void }) {
  const { setQuantity, removeItem, addItem } = useCart()
  const toast = useToast()
  const blocked = line.status === 'OUT_OF_STOCK' || line.status === 'UNAVAILABLE'
  const note = STATUS_NOTE[line.status]?.(line)

  const change = async (quantity: number) => {
    try {
      const { warning } = await setQuantity(line.productId, quantity)
      if (warning) toast({ tone: 'info', message: warning })
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Không cập nhật được số lượng' })
    }
  }

  const remove = async () => {
    const previous = line.requestedQuantity
    try {
      await removeItem(line.productId)
      toast({
        tone: 'info',
        message: `Đã xoá ${line.name}`,
        duration: 6000,
        action: {
          label: 'Hoàn tác',
          onClick: () => {
            addItem({ id: line.productId, name: line.name, maxPurchasable: Math.max(line.maxPurchasable, previous) }, previous).catch(
              (err: unknown) => toast({ tone: 'error', message: err instanceof Error ? err.message : 'Không hoàn tác được' }),
            )
          },
        },
      })
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Không xoá được sản phẩm' })
    }
  }

  const title = line.slug ? (
    <Link to={`/san-pham/${line.slug}`} onClick={onNavigate} className="font-semibold text-stone-900 hover:text-brand-700">
      {line.name}
    </Link>
  ) : (
    <span className="font-semibold text-stone-900">{line.name}</span>
  )

  return (
    <li className="flex gap-3 py-4">
      <ProductImage
        name={line.name}
        imageUrl={line.imageUrl}
        categorySlug={line.categorySlug ?? ''}
        className={`size-20 shrink-0 rounded-xl [&>span]:text-3xl ${blocked ? 'opacity-50' : ''}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 break-words">{title}</div>
          <button
            type="button"
            onClick={remove}
            aria-label={`Xoá ${line.name} khỏi giỏ hàng`}
            className="-mt-1 shrink-0 rounded-full px-2 py-1 text-sm text-muted hover:bg-stone-100 hover:text-danger"
          >
            Xoá
          </button>
        </div>
        <p className="mt-0.5 text-sm tabular-nums">
          {line.status === 'PRICE_CHANGED' && line.priceAtAdd != null && (
            <s className="mr-2 text-muted">{formatPrice(line.priceAtAdd)}</s>
          )}
          <span className="text-stone-800">{formatPrice(line.price)}</span>
        </p>
        {note && (
          <p className={`mt-1 text-xs ${blocked ? 'text-danger' : 'text-amber-800'}`} role="note">
            {note}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {blocked ? (
            <span className="text-sm text-muted">Số lượng: {line.requestedQuantity}</span>
          ) : (
            <QuantityStepper
              size="sm"
              value={line.quantity}
              max={line.maxPurchasable}
              onChange={change}
              label={line.name}
            />
          )}
          <span className="font-semibold text-stone-900 tabular-nums">{formatPrice(line.lineTotal)}</span>
        </div>
      </div>
    </li>
  )
}

export function CartLines({ lines, onNavigate }: { lines: CartLine[]; onNavigate?: () => void }) {
  return (
    <ul className="divide-y divide-stone-100">
      {lines.map((line) => (
        <Line key={line.productId} line={line} onNavigate={onNavigate} />
      ))}
    </ul>
  )
}

export function CartSummary({ view, onCheckout }: { view: CartView; onCheckout: () => void }) {
  const blocked = view.items.some((l) => l.status === 'OUT_OF_STOCK' || l.status === 'UNAVAILABLE')
  const reason = view.items.length === 0 ? 'Giỏ hàng đang trống.' : blocked ? 'Vui lòng xoá các sản phẩm hết hàng hoặc ngừng kinh doanh để thanh toán.' : null
  const reasonId = useId()
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-stone-600">Tạm tính</span>
        <span className="font-semibold tabular-nums">{formatPrice(view.subtotal)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-stone-600">Phí giao hàng</span>
        <span className="font-semibold tabular-nums">{view.shippingFee === 0 ? 'Miễn phí' : formatPrice(view.shippingFee)}</span>
      </div>
      {view.amountToFreeShipping > 0 && (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-brand-800">
          Mua thêm <strong className="tabular-nums">{formatPrice(view.amountToFreeShipping)}</strong> để được miễn phí giao hàng
        </p>
      )}
      <div className="flex justify-between border-t border-stone-100 pt-3 text-base">
        <span className="font-semibold">Tổng cộng</span>
        <span className="font-bold text-brand-700 tabular-nums">{formatPrice(view.total)}</span>
      </div>
      <button
        type="button"
        onClick={onCheckout}
        disabled={!view.canCheckout}
        aria-describedby={reason ? reasonId : undefined}
        className="mt-2 w-full rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
      >
        Thanh toán
      </button>
      {reason && (
        <p id={reasonId} className="text-center text-xs text-muted">
          {reason}
        </p>
      )}
    </div>
  )
}

export function EmptyCart({ onContinue }: { onContinue?: () => void }) {
  return (
    <div className="py-12 text-center">
      <p className="text-4xl" aria-hidden>
        🛒
      </p>
      <p className="mt-3 font-semibold text-stone-900">Giỏ hàng của bạn đang trống</p>
      <p className="mt-1 text-sm text-muted">Khám phá các loại hạt dinh dưỡng cho thực đơn lành mạnh.</p>
      <Link
        to="/san-pham"
        onClick={onContinue}
        className="mt-5 inline-block rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
      >
        Tiếp tục mua sắm
      </Link>
    </div>
  )
}
