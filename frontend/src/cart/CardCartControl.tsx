import { useRef } from 'react'
import { useToast } from '../components/Toast'
import AddToCartButton from './AddToCartButton'
import { useCart, type CartProductRef } from './CartContext'

/**
 * Product card cart area. Not in the cart: the usual "Thêm vào giỏ" button (toast / quick cart on the first add).
 * In the cart: [−] "n trong giỏ" [+] in the same box, so the card never changes size. Changes show at once; the cart
 * sends them (debounced when signed in). Going down to 0 removes the line, with "Hoàn tác" in the toast.
 */
export default function CardCartControl({ product }: { product: CartProductRef }) {
  const { getQuantity, setQuantity } = useCart()
  const toast = useToast()
  const n = getQuantity(product.id)
  // Fast clicks share one request: only the newest click reports a failure
  const lastChange = useRef(0)

  if (n === 0) {
    return (
      <div className="fade-swap flex">
        <AddToCartButton product={product} ariaLabel={`Thêm ${product.name} vào giỏ`} />
      </div>
    )
  }

  const change = (next: number) => {
    const id = ++lastChange.current
    const previous = n
    setQuantity(product.id, next).then(
      ({ warning }) => {
        if (warning && id === lastChange.current) toast({ tone: 'info', message: warning })
      },
      (err: unknown) => {
        if (id === lastChange.current) {
          toast({ tone: 'error', message: err instanceof Error ? err.message : 'Không cập nhật được giỏ hàng' })
        }
      },
    )
    if (next === 0) {
      toast({
        tone: 'info',
        message: `Đã xoá ${product.name} khỏi giỏ`,
        duration: 6000,
        action: {
          label: 'Hoàn tác',
          onClick: () => {
            setQuantity(product.id, previous).catch((err: unknown) =>
              toast({ tone: 'error', message: err instanceof Error ? err.message : 'Không hoàn tác được' }),
            )
          },
        },
      })
    }
  }

  const soldOut = product.maxPurchasable <= 0
  const atMax = n >= product.maxPurchasable
  const plusTitle = soldOut ? 'Đã hết hàng' : atMax ? `Tối đa ${product.maxPurchasable} sản phẩm` : undefined
  // 40px tall like the button it replaces (38px inside the border); the ::before extends each tap target to 40×40
  const step =
    'relative flex h-full w-10 shrink-0 items-center justify-center text-lg leading-none font-semibold before:absolute before:-inset-y-px before:inset-x-0 before:content-[""] hover:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:text-stone-400 disabled:hover:bg-transparent'

  return (
    <div className="fade-swap flex h-10 w-full items-center overflow-hidden rounded-full border border-brand-600 bg-white text-sm text-brand-700">
      <button type="button" onClick={() => change(n - 1)} aria-label={`Bớt 1 ${product.name}`} className={`${step} rounded-l-full`}>
        <span aria-hidden="true">−</span>
      </button>
      <span aria-live="polite" className="min-w-0 flex-1 truncate text-center font-semibold tabular-nums">
        <span aria-hidden="true">
          {n}
          <span className="max-sm:hidden"> trong giỏ</span>
        </span>
        <span className="sr-only">
          {n} {product.name} trong giỏ hàng
        </span>
      </span>
      <button
        type="button"
        onClick={() => change(n + 1)}
        disabled={soldOut || atMax}
        title={plusTitle}
        aria-label={`Thêm 1 ${product.name}`}
        className={`${step} rounded-r-full`}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  )
}
