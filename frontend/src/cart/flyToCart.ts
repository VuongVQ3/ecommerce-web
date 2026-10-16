import { matchesMedia } from '../lib/media'

/** Desktop with a mouse: longer flight, and the quick cart opens after it. */
export const DESKTOP_CART = '(min-width: 1024px) and (hover: hover) and (pointer: fine)'

const MAX_FLIGHTS = 3
const MAX_SIZE = 80
let flying = 0
let layer: HTMLElement | null = null

export interface Flight {
  /** Resolves when the picture reaches the cart; at once when there is no flight. */
  landed: Promise<void>
  /** True when a picture is actually flying (false: skipped) */
  flew: boolean
  /** Remove the picture now (the add failed) */
  cancel: () => void
}

const NO_FLIGHT: Flight = { landed: Promise.resolve(), flew: false, cancel: () => {} }

const inViewport = (r: DOMRect) =>
  r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth

/** The cart icon in the header, when it is on screen. */
function cartTarget(): DOMRect | null {
  const el = document.querySelector<HTMLElement>('[data-cart-target]')
  const rect = el?.getBoundingClientRect()
  return rect && inViewport(rect) && rect.top >= 0 ? rect : null
}

/** Picture inside a [data-fly-source] container: the product photo, or the emoji placeholder. */
function sourcePicture(source: Element | null): Element | null {
  if (!source) return null
  return source.matches('img, [role="img"]') ? source : source.querySelector('img, [role="img"]')
}

/**
 * A copy of the product picture flies in a curve (up, then down into the header cart), shrinking to 0.2 and fading
 * to 0.6. Fixed in a layer at the end of <body>, above every overlay; transform/opacity only; removed when done.
 * Skipped (resolves at once) under prefers-reduced-motion, when the cart icon is off screen, with 3 already flying,
 * or when there is no picture.
 *
 * @param source a [data-fly-source] element (card image, product page gallery, quick view image)
 * @param fallback where to start when the picture is scrolled out of view (usually the button pressed)
 */
export function flyToCart(source: Element | null, fallback?: Element | null): Flight {
  if (typeof window === 'undefined' || typeof document.body.animate !== 'function') return NO_FLIGHT
  if (matchesMedia('(prefers-reduced-motion: reduce)') || flying >= MAX_FLIGHTS) return NO_FLIGHT
  const target = cartTarget()
  const picture = sourcePicture(source)
  if (!target || !picture) return NO_FLIGHT

  let from = picture.getBoundingClientRect()
  if (!inViewport(from)) {
    const alt = fallback?.getBoundingClientRect()
    if (!alt || !inViewport(alt)) return NO_FLIGHT
    from = alt
  }
  const size = Math.min(Math.min(from.width, from.height) || MAX_SIZE, MAX_SIZE)
  const x0 = from.left + from.width / 2
  const y0 = from.top + from.height / 2
  const x2 = target.left + target.width / 2
  const y2 = target.top + target.height / 2

  if (!layer || !layer.isConnected) {
    layer = document.createElement('div')
    layer.dataset.flyLayer = ''
    layer.setAttribute('aria-hidden', 'true')
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:hidden'
    document.body.appendChild(layer)
  }

  const bubble = document.createElement('div')
  bubble.setAttribute('aria-hidden', 'true')
  bubble.dataset.flying = ''
  bubble.style.cssText = [
    'position:absolute',
    `left:${x0 - size / 2}px`,
    `top:${y0 - size / 2}px`,
    `width:${size}px`,
    `height:${size}px`,
    'border-radius:9999px',
    'overflow:hidden',
    'background:#fff',
    'box-shadow:0 8px 20px rgb(0 0 0 / 0.25)',
    'pointer-events:none',
    'will-change:transform,opacity',
  ].join(';')
  const copy = picture.cloneNode(true) as HTMLElement
  copy.removeAttribute('id')
  copy.setAttribute('aria-hidden', 'true')
  copy.style.cssText += ';width:100%;height:100%;object-fit:cover;display:flex;align-items:center;justify-content:center'
  if (copy instanceof HTMLImageElement && picture instanceof HTMLImageElement) {
    copy.src = picture.currentSrc || picture.src
    copy.loading = 'eager'
  }
  bubble.appendChild(copy)
  layer.appendChild(bubble)
  flying++

  // Quadratic curve: the control point sits above both ends, so the picture arcs up before dropping into the cart
  const cx = (x0 + x2) / 2
  const cy = Math.min(y0, y2) - Math.max(80, Math.abs(x2 - x0) * 0.25)
  const steps = 12
  const frames: Keyframe[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const x = u * u * x0 + 2 * u * t * cx + t * t * x2
    const y = u * u * y0 + 2 * u * t * cy + t * t * y2
    frames.push({
      offset: t,
      transform: `translate(${x - x0}px, ${y - y0}px) scale(${1 - 0.8 * t})`,
      opacity: 1 - 0.4 * t,
    })
  }
  const animation = bubble.animate(frames, {
    duration: matchesMedia(DESKTOP_CART) ? 600 : 500,
    easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)',
    fill: 'forwards',
  })

  let finished = false
  const cleanup = () => {
    if (finished) return
    finished = true
    flying--
    bubble.remove()
  }
  const landed = animation.finished.then(cleanup, cleanup)
  return {
    landed,
    flew: true,
    cancel: () => {
      animation.cancel()
      cleanup()
    },
  }
}
