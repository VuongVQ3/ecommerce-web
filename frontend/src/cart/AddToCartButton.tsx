import { useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import { matchesMedia } from '../lib/media'
import { announceToScreenReaders, holdBadge } from './cartBadge'
import { useCart, type CartProductRef } from './CartContext'
import { DESKTOP_CART, flyToCart } from './flyToCart'
import { announceAdded } from './quickCartEvents'

/** The picture to fly from: the card's image, else the image of the open dialog (quick view), else the page's. */
function flySource(button: HTMLElement): Element | null {
  return (
    button.closest('article')?.querySelector('[data-fly-source]') ??
    (button.closest('[aria-modal="true"]') ?? document).querySelector('[data-fly-source]')
  )
}

interface Props {
  product: CartProductRef & { active?: boolean }
  quantity?: number
  /** Card buttons are compact; the product page one is large. */
  variant?: 'card' | 'page'
  /** Called after a successful add (e.g. to reset a quantity picker). */
  onAdded?: () => void
  /** Accessible name when the visible text alone is ambiguous (cards: "Thêm Hạnh nhân vào giỏ"). */
  ariaLabel?: string
}

/** Shown on card buttons too narrow for "Thêm vào giỏ" */
function CartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="hidden size-4 shrink-0 @max-[6rem]:block">
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  )
}

/**
 * Discontinued: renders nothing. Sold out: disabled "Hết hàng". Otherwise adds (guarding against double clicks)
 * while the product picture flies to the header cart; the badge shows the new count when it lands. Then: desktop
 * with a mouse opens the quick cart, phones/tablets show nothing more. "Chỉ còn N sản phẩm" and errors are toasts;
 * screen readers always hear "Đã thêm … vào giỏ hàng".
 */
export default function AddToCartButton({ product, quantity = 1, variant = 'card', onAdded, ariaLabel }: Props) {
  const { addItem, openDrawer, count } = useCart()
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  if (product.active === false) return null

  const soldOut = product.maxPurchasable <= 0
  const base =
    variant === 'page'
      ? // One line always: never narrower than its label
        'w-full rounded-full px-6 py-3 font-semibold whitespace-nowrap sm:w-auto'
      : // A size container: the label shortens to an icon + "Thêm" when the full one would not fit on one line
        '@container h-10 w-full rounded-full px-4 text-sm font-semibold whitespace-nowrap'

  if (soldOut) {
    return (
      <button type="button" disabled className={`${base} cursor-not-allowed bg-stone-200 text-stone-600`}>
        Hết hàng
      </button>
    )
  }

  const add = async (button: HTMLElement | null) => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    // The badge keeps its number until the picture lands; the cart itself updates at once
    const hold = holdBadge(count)
    const flight = flyToCart(button ? flySource(button) : null, button)
    try {
      const { warning } = await addItem(product, quantity)
      setPending(false)
      onAdded?.()
      await flight.landed
      hold.land(quantity, flight.flew)
      announceToScreenReaders(`Đã thêm ${product.name} vào giỏ hàng`)
      if (warning) {
        toast({ tone: 'info', message: warning, action: { label: 'Xem giỏ hàng', onClick: openDrawer } })
      } else if (matchesMedia(DESKTOP_CART)) {
        // Desktop: the quick cart opens once the icon has finished bouncing (toast if it is not there)
        window.setTimeout(() => {
          if (!announceAdded()) {
            toast({ tone: 'success', message: `Đã thêm ${product.name} vào giỏ`, action: { label: 'Xem giỏ hàng', onClick: openDrawer } })
          }
        }, flight.flew ? 400 : 0)
      }
    } catch (err) {
      flight.cancel()
      hold.cancel()
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Không thêm được vào giỏ hàng' })
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        // Cards are links: adding must not navigate
        e.preventDefault()
        e.stopPropagation()
        void add(e.currentTarget)
      }}
      disabled={pending}
      aria-busy={pending}
      aria-label={ariaLabel}
      className={`${base} bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-wait disabled:opacity-70`}
    >
      {pending ? (
        <span className="block truncate">Đang thêm...</span>
      ) : variant === 'page' ? (
        'Thêm vào giỏ hàng'
      ) : (
        <span className="flex items-center justify-center gap-1.5">
          <CartIcon />
          <span>
            Thêm<span className="@max-[6rem]:hidden"> vào giỏ</span>
          </span>
        </span>
      )}
    </button>
  )
}
