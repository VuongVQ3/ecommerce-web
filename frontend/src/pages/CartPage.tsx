import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CartLines, CartSummary, EmptyCart } from '../cart/CartContents'
import { useCart } from '../cart/CartContext'
import { Spinner } from '../components/Feedback'
import type { CartPageState } from './CheckoutPage'

export default function CartPage() {
  const { view, lines, loading, refresh } = useCart()
  const navigate = useNavigate()
  const shortages = (useLocation().state as CartPageState | null)?.shortages ?? []

  // Bounced from checkout for lack of stock: re-price so the lines show the current stock and statuses
  useEffect(() => {
    if (shortages.length > 0) refresh().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortages.length])

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">Giỏ hàng</h1>
      {shortages.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5" role="alert">
          <p className="font-semibold text-stone-900">Một số sản phẩm không còn đủ hàng nên chưa đặt được đơn:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-800">
            {shortages.map((s) => (
              <li key={s.productId}>
                <strong>{s.name}</strong>: bạn chọn {s.requested}, {s.available > 0 ? `chỉ còn ${s.available}` : 'đã hết hàng'}.
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-stone-700">Vui lòng điều chỉnh số lượng hoặc xoá sản phẩm rồi thanh toán lại.</p>
        </div>
      )}
      {loading && !view ? (
        <Spinner />
      ) : lines.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="mt-6 grid gap-8 md:grid-cols-[1fr_320px]">
          <section aria-label="Sản phẩm trong giỏ" className="rounded-2xl border border-stone-200 bg-white px-4 sm:px-6">
            <CartLines lines={lines} highlight={shortages.map((s) => s.productId)} />
          </section>
          {view && (
            <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-5 md:sticky md:top-24">
              <h2 className="mb-3 font-bold text-stone-900">Tóm tắt đơn hàng</h2>
              <CartSummary view={view} onCheckout={() => navigate('/thanh-toan')} />
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
