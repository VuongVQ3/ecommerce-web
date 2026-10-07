import { useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import { useCart, type CartProductRef } from './CartContext'

interface Props {
  product: CartProductRef & { active?: boolean }
  quantity?: number
  /** Card buttons are compact; the product page one is large. */
  variant?: 'card' | 'page'
  /** Called after a successful add (e.g. to reset a quantity picker). */
  onAdded?: () => void
}

/**
 * Discontinued: renders nothing. Sold out: disabled "Hết hàng". Otherwise adds with an optimistic badge update,
 * guards against double clicks, and confirms with a toast ("Đã thêm …" / "Chỉ còn N sản phẩm").
 */
export default function AddToCartButton({ product, quantity = 1, variant = 'card', onAdded }: Props) {
  const { addItem, openDrawer } = useCart()
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  if (product.active === false) return null

  const soldOut = product.maxPurchasable <= 0
  const base =
    variant === 'page'
      ? 'w-full rounded-full px-6 py-3 font-semibold sm:w-auto'
      : 'w-full rounded-full px-4 py-2 text-sm font-semibold'

  if (soldOut) {
    return (
      <button type="button" disabled className={`${base} cursor-not-allowed bg-stone-200 text-stone-600`}>
        Hết hàng
      </button>
    )
  }

  const add = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    try {
      const { warning } = await addItem(product, quantity)
      toast({
        tone: 'success',
        message: warning ?? `Đã thêm ${product.name}`,
        action: { label: 'Xem giỏ hàng', onClick: openDrawer },
      })
      onAdded?.()
    } catch (err) {
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
        void add()
      }}
      disabled={pending}
      aria-busy={pending}
      className={`${base} bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-wait disabled:opacity-70`}
    >
      {pending ? 'Đang thêm...' : variant === 'page' ? 'Thêm vào giỏ hàng' : 'Thêm vào giỏ'}
    </button>
  )
}
