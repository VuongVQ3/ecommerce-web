import { CartLines, CartSummary, EmptyCart } from '../cart/CartContents'
import { useCart } from '../cart/CartContext'
import { Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'

export default function CartPage() {
  const { view, lines, loading } = useCart()
  const toast = useToast()

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">Giỏ hàng</h1>
      {loading && !view ? (
        <Spinner />
      ) : lines.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="mt-6 grid gap-8 md:grid-cols-[1fr_320px]">
          <section aria-label="Sản phẩm trong giỏ" className="rounded-2xl border border-stone-200 bg-white px-4 sm:px-6">
            <CartLines lines={lines} />
          </section>
          {view && (
            <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-5 md:sticky md:top-24">
              <h2 className="mb-3 font-bold text-stone-900">Tóm tắt đơn hàng</h2>
              <CartSummary
                view={view}
                onCheckout={() => toast({ tone: 'info', message: 'Chức năng thanh toán đang được phát triển.' })}
              />
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
