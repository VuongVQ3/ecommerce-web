import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { PriceTag } from '../components/Price'
import ProductImage from '../components/ProductImage'
import { useToast } from '../components/Toast'
import type { CartLine } from '../lib/api'
import { formatPrice } from '../lib/format'
import { useCart } from './CartContext'
import { onAdded } from './quickCartEvents'

const OPEN_DELAY = 150
const CLOSE_DELAY = 300
const AUTO_OPEN_MS = 3000
const MAX_LINES = 4

function CartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  )
}

function Line({ line, onRemove }: { line: CartLine; onRemove: () => void }) {
  return (
    <li className="flex gap-3 py-2.5">
      <ProductImage
        name={line.name}
        imageUrl={line.imageUrl}
        categorySlug={line.categorySlug ?? ''}
        size={48}
        className="size-12 shrink-0 rounded-lg [&>span]:text-xl"
      />
      <div className="min-w-0 flex-1 text-sm">
        {line.slug ? (
          <Link to={`/san-pham/${line.slug}`} className="line-clamp-2 font-medium text-stone-900 hover:text-brand-700">
            {line.name}
          </Link>
        ) : (
          <span className="line-clamp-2 font-medium text-stone-900">{line.name}</span>
        )}
        <p className="text-stone-600 tabular-nums">
          {line.quantity} ×{' '}
          <PriceTag price={line.price} regularPrice={line.regularPrice} className="text-sm font-normal" regularClassName="text-xs text-muted" />
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Xoá ${line.name} khỏi giỏ`}
        className="flex size-8 shrink-0 items-center justify-center self-start rounded-full text-lg text-stone-500 hover:bg-stone-100 hover:text-danger"
      >
        ×
      </button>
    </li>
  )
}

/**
 * Header cart for desktops with a mouse: the icon is a link to /gio-hang, hovering it (or pressing the arrow button
 * next to it) shows a preview of the cart under it. Data comes from useCart, never fetched on hover.
 */
export default function QuickCart() {
  const { view, loading, count, removeItem, addItem } = useCart()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState<number[]>([]) // removed optimistically, waiting for the server
  const panelId = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const hovering = useRef(false)

  const schedule = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(next), delay)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Just added something: show it for 3 seconds, unless the pointer is resting on the cart
  useEffect(
    () =>
      onAdded(() => {
        window.clearTimeout(timer.current)
        setOpen(true)
        timer.current = window.setTimeout(() => {
          if (!hovering.current) setOpen(false)
        }, AUTO_OPEN_MS)
      }),
    [],
  )

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
      toggleRef.current?.focus()
    }
  }
  const onBlur = (e: FocusEvent) => {
    if (!wrapperRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
  }

  const remove = async (line: CartLine) => {
    setHidden((h) => [...h, line.productId])
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
    } finally {
      setHidden((h) => h.filter((id) => id !== line.productId))
    }
  }

  const lines = (view?.items ?? []).filter((l) => !hidden.includes(l.productId))
  // Newest first: the server and the guest cart keep lines in the order they were added
  const recent = [...lines].reverse().slice(0, MAX_LINES)
  const more = lines.length - recent.length
  const problems = lines.some((l) => l.status !== 'OK')
  const label = count > 0 ? `Giỏ hàng, ${count} sản phẩm` : 'Giỏ hàng trống'
  const free = view && view.amountToFreeShipping === 0 && lines.length > 0
  const progress = view && view.freeShippingThreshold > 0 ? Math.min(100, (view.subtotal / view.freeShippingThreshold) * 100) : 0

  return (
    <div
      ref={wrapperRef}
      className="relative flex items-center"
      onMouseEnter={() => {
        hovering.current = true
        schedule(true, OPEN_DELAY)
      }}
      onMouseLeave={() => {
        hovering.current = false
        schedule(false, CLOSE_DELAY)
      }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <Link
        to="/gio-hang"
        aria-label={label}
        className="relative flex size-10 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100"
      >
        <CartIcon />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white tabular-nums">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Link>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Xem nhanh giỏ hàng"
        onClick={() => {
          window.clearTimeout(timer.current)
          setOpen((o) => !o)
        }}
        className="flex h-10 w-5 items-center justify-center rounded text-stone-500 hover:text-stone-900"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className={`size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} fill="currentColor">
          <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {/* pt-2: invisible bridge so moving the pointer from the icon down to the panel does not close it */}
      <div
        id={panelId}
        role="region"
        aria-label="Xem nhanh giỏ hàng"
        // Following a link inside (product, cart, checkout) closes the preview
        onClick={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}
        className={`absolute top-full right-0 z-30 w-[22.5rem] max-w-[calc(100vw-2rem)] pt-2 transition-[opacity,transform,visibility] duration-150 motion-reduce:transition-none ${
          open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'
        }`}
      >
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xl">
          {loading && !view ? (
            <div aria-busy="true" aria-label="Đang tải giỏ hàng" className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="flex animate-pulse gap-3 motion-reduce:animate-none">
                  <div className="size-12 rounded-lg bg-stone-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/4 rounded bg-stone-200" />
                    <div className="h-3 w-1/3 rounded bg-stone-200" />
                  </div>
                </div>
              ))}
            </div>
          ) : lines.length === 0 ? (
            <div className="py-4 text-center">
              <p className="font-semibold text-stone-900">Giỏ hàng đang trống</p>
              <Link to="/san-pham" className="mt-3 inline-block rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                Xem sản phẩm
              </Link>
            </div>
          ) : (
            <>
              <p className="font-bold text-stone-900">
                Giỏ hàng ({view?.totalQuantity ?? count} sản phẩm)
              </p>
              <ul className="mt-1 divide-y divide-stone-100">
                {recent.map((line) => (
                  <Line key={line.productId} line={line} onRemove={() => remove(line)} />
                ))}
              </ul>
              {more > 0 && <p className="pb-1 text-sm text-muted">và {more} sản phẩm khác</p>}
              {problems && (
                <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" role="note">
                  Có sản phẩm hết hàng hoặc đổi giá. Xem giỏ hàng để kiểm tra.
                </p>
              )}
              {view && (
                <div className="mt-3 border-t border-stone-100 pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-stone-600">Tạm tính</span>
                    <span className="font-semibold tabular-nums">{formatPrice(view.subtotal)}</span>
                  </div>
                  <p className="mt-2 text-xs text-stone-700">
                    {free ? (
                      'Bạn được miễn phí giao hàng'
                    ) : (
                      <>
                        Mua thêm <strong className="tabular-nums">{formatPrice(view.amountToFreeShipping)}</strong> để được miễn
                        phí giao hàng
                      </>
                    )}
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${free ? 100 : progress}%` }} />
                  </div>
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link to="/gio-hang" className="rounded-full border border-stone-300 px-3 py-2.5 text-center text-sm font-semibold text-stone-800 hover:bg-stone-50">
                  Xem giỏ hàng
                </Link>
                <Link
                  to={view?.canCheckout ? '/thanh-toan' : '/gio-hang'}
                  className="rounded-full bg-brand-600 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Thanh toán
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
