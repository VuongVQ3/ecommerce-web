import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { CartLines, CartSummary, EmptyCart } from './CartContents'
import { useCart } from './CartContext'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Slide-over cart. Modal dialog: focus moves inside and stays there (Tab cycles), Esc or the backdrop closes it,
 * and focus returns to whatever opened it (the header cart button).
 */
export default function CartDrawer() {
  const { drawerOpen, closeDrawer, view, lines, loading } = useCart()
  const toast = useToast()
  const panel = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!drawerOpen) return
    returnFocusTo.current = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDrawer()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      returnFocusTo.current?.focus()
    }
  }, [drawerOpen, closeDrawer])

  if (!drawerOpen) return null

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-stone-900/40" onClick={closeDrawer} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 id="cart-drawer-title" className="text-lg font-bold text-stone-900">
            Giỏ hàng {view && view.totalQuantity > 0 && <span className="text-muted tabular-nums">({view.totalQuantity})</span>}
          </h2>
          <button
            type="button"
            data-autofocus
            onClick={closeDrawer}
            aria-label="Đóng giỏ hàng"
            className="rounded-full px-3 py-1 text-2xl leading-none text-muted hover:bg-stone-100 hover:text-stone-900"
          >
            ×
          </button>
        </div>

        {loading && !view ? (
          <Spinner />
        ) : lines.length === 0 ? (
          <div className="px-5">
            <EmptyCart onContinue={closeDrawer} />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5">
              <CartLines lines={lines} onNavigate={closeDrawer} />
            </div>
            <div className="border-t border-stone-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {view && (
                <CartSummary
                  view={view}
                  onCheckout={() => toast({ tone: 'info', message: 'Chức năng thanh toán đang được phát triển.' })}
                />
              )}
              <Link
                to="/gio-hang"
                onClick={closeDrawer}
                className="mt-3 block text-center text-sm font-semibold text-brand-700 hover:underline"
              >
                Xem trang giỏ hàng
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
