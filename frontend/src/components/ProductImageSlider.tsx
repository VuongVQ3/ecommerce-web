import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ProductImageInfo } from '../lib/api'
import { usePrefersReducedMotion } from '../lib/motion'
import ProductImage from './ProductImage'

/** At most this many photos per product (the back office allows 5) */
const MAX_SLIDES = 5

interface Props {
  name: string
  /** Primary first (the API already orders them); empty = fallback / category placeholder */
  images: ProductImageInfo[]
  /** Used when there are no images (older products keep a single imageUrl) */
  fallbackUrl?: string | null
  categorySlug: string
  /** dots under the photo (quick view) or a row of thumbnails (product page) */
  nav: 'dots' | 'thumbnails'
  /** Rounded corners of the square frame */
  rounded?: string
  /** Emoji size of the placeholder */
  placeholderClass?: string
}

function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="size-5">
      <path d={dir === 'prev' ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The product's photos in a square frame (cover), one at a time: swipe (CSS scroll snap, native on touch), the
 * arrows, ← / → while focused, and dots or thumbnails. The first photo loads at once, the others lazily, all as
 * 800×800 Cloudinary copies (thumbnails 160×160). The current photo carries data-fly-source, so "Thêm vào giỏ"
 * flies that one. Give it a key per product so it starts again at the first photo.
 */
export default function ProductImageSlider({
  name,
  images,
  fallbackUrl = null,
  categorySlug,
  nav,
  rounded = 'rounded-3xl',
  placeholderClass = '[&>span]:text-8xl',
}: Props) {
  const urls = (images.length > 0 ? images.map((i) => i.url) : fallbackUrl ? [fallbackUrl] : []).slice(0, MAX_SLIDES)
  // No photo: one slide with the category placeholder
  const slides: (string | null)[] = urls.length > 0 ? urls : [null]
  const count = slides.length
  const [index, setIndex] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()

  // The scroll position decides which photo is shown (swipes, arrows and keys all scroll)
  useEffect(() => {
    const el = track.current
    if (!el) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (el.clientWidth > 0) setIndex(Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', onScroll)
    }
  }, [count])

  const goTo = useCallback(
    (i: number) => {
      const el = track.current
      const next = Math.min(count - 1, Math.max(0, i))
      setIndex(next)
      el?.scrollTo?.({ left: next * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' })
    },
    [count, reduced],
  )

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      goTo(index + (e.key === 'ArrowLeft' ? -1 : 1))
    }
  }

  const arrow =
    'absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-800 shadow-md transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:pointer-events-none disabled:opacity-0'

  return (
    <div>
      <div className={`relative aspect-square w-full overflow-hidden bg-white ${rounded}`}>
        <div
          ref={track}
          tabIndex={count > 1 ? 0 : -1}
          role="region"
          aria-roledescription="carousel"
          aria-label={`Ảnh sản phẩm ${name}`}
          onKeyDown={count > 1 ? onKeyDown : undefined}
          className="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((url, i) => (
            <div
              key={url ?? 'placeholder'}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count}`}
              aria-hidden={i !== index}
              data-fly-source={i === index ? '' : undefined}
              className="size-full shrink-0 snap-center snap-always"
            >
              <ProductImage
                name={count > 1 ? `${name} – ảnh ${i + 1}` : name}
                imageUrl={url}
                categorySlug={categorySlug}
                size={400}
                eager={i === 0}
                className={`size-full ${placeholderClass}`}
              />
            </div>
          ))}
        </div>
        {count > 1 && (
          <>
            <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Ảnh trước" className={`${arrow} left-3`}>
              <Chevron dir="prev" />
            </button>
            <button type="button" onClick={() => goTo(index + 1)} disabled={index === count - 1} aria-label="Ảnh sau" className={`${arrow} right-3`}>
              <Chevron dir="next" />
            </button>
            <p aria-live="polite" className="absolute right-3 bottom-3 rounded-full bg-stone-900/60 px-2.5 py-0.5 text-xs font-semibold text-white tabular-nums">
              {index + 1}/{count}
            </p>
          </>
        )}
      </div>

      {count > 1 && nav === 'dots' && (
        <div className="flex justify-center gap-1.5 py-3" role="group" aria-label="Chọn ảnh">
          {slides.map((url, i) => (
            <button
              key={url ?? i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Ảnh ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              className="flex size-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              <span className={`block rounded-full transition-all ${i === index ? 'h-2 w-5 bg-brand-600' : 'size-2 bg-stone-300'}`} />
            </button>
          ))}
        </div>
      )}

      {count > 1 && nav === 'thumbnails' && (
        <ul className="mt-3 flex gap-2" aria-label="Ảnh sản phẩm">
          {slides.map((url, i) => (
            <li key={url ?? i}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Xem ảnh ${i + 1}`}
                aria-pressed={i === index}
                className={`block overflow-hidden rounded-xl border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
                  i === index ? 'border-brand-600' : 'border-transparent opacity-80 hover:opacity-100'
                }`}
              >
                <ProductImage name={`${name} – ảnh ${i + 1}`} imageUrl={url} categorySlug={categorySlug} size={80} className="size-16" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
