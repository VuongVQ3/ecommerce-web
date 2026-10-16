import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '../lib/motion'
import { useOverlayOpen } from '../lib/overlay'

/** Pages longer than this many screens: jump to 2 screens from the top first, then glide the rest */
const LONG_PAGE = 6
const JUMP_TO = 2
/** Progress ring: r = 21 in a 44 × 44 box */
const RADIUS = 21
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function ArrowUpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="btt-arrow size-5">
      <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The glide to the top; the browser's own smooth scroll is slower (~0.5 s for a single screen) */
const GLIDE_MS = 450
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/**
 * Smooth scroll to the top within GLIDE_MS, one step per frame. The reader taking over (wheel, touch, keys) stops it.
 * Resolves with whether it reached the top.
 */
function glideToTop(): Promise<boolean> {
  return new Promise((resolve) => {
    const from = window.scrollY
    const started = performance.now()
    let frame = 0
    const finish = (reached: boolean) => {
      cancelAnimationFrame(frame)
      for (const type of ['wheel', 'touchstart', 'keydown'] as const) window.removeEventListener(type, stop)
      resolve(reached)
    }
    const stop = () => finish(false)
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / GLIDE_MS)
      window.scrollTo({ top: Math.round(from * (1 - easeOutCubic(t))), behavior: 'instant' })
      if (t < 1) frame = requestAnimationFrame(step)
      else finish(true)
    }
    for (const type of ['wheel', 'touchstart', 'keydown'] as const) window.addEventListener(type, stop, { passive: true })
    frame = requestAnimationFrame(step)
  })
}

/** Back to the top of the page: the logo, else the main content. Focus ring only for keyboard users (focus-visible). */
function focusPageTop() {
  const target = document.querySelector<HTMLElement>('header a[href="/"]') ?? document.getElementById('main')
  if (!target) return
  if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.tabIndex = -1
  target.focus({ preventScroll: true })
}

/**
 * "Lên đầu trang" in the floating corner (rendered by FloatingContact, at the bottom of the contact column; on
 * phones right above the chat button). Shown as soon as the page is scrolled at all (hidden at the very top) and
 * hidden while a modal, drawer or popup is open (useOverlayOpen). A ring around it fills with how far down the page the reader is.
 * Scroll is read once per frame (passive listener + requestAnimationFrame); the ring is updated without re-rendering.
 * Motion: CSS in index.css (.btt*).
 */
export default function BackToTop() {
  const reduced = usePrefersReducedMotion()
  const overlay = useOverlayOpen()
  const ring = useRef<SVGCircleElement>(null)
  const [past, setPast] = useState(false)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const y = window.scrollY
      const screen = window.innerHeight
      const max = document.documentElement.scrollHeight - screen
      const progress = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0
      ring.current?.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - progress)))
      // React skips the render when the value is unchanged
      setPast(y > 0)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const shown = past && !overlay

  const onClick = () => {
    if (reduced) {
      window.scrollTo({ top: 0, behavior: 'auto' })
      focusPageTop()
      return
    }
    const screen = window.innerHeight
    if (document.documentElement.scrollHeight > LONG_PAGE * screen && window.scrollY > JUMP_TO * screen) {
      window.scrollTo({ top: JUMP_TO * screen, behavior: 'instant' })
    }
    void glideToTop().then((reached) => reached && focusPageTop())
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Lên đầu trang"
      aria-hidden={shown ? undefined : true}
      tabIndex={shown ? undefined : -1}
      data-shown={shown ? '' : undefined}
      className="btt relative flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
    >
      <span className="fc-label pointer-events-none absolute top-1/2 right-full mr-3 -translate-y-1/2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-stone-800 shadow-md max-sm:hidden">
        Lên đầu trang
      </span>
      <span className="btt-dot relative flex size-11 items-center justify-center rounded-full border border-stone-200 bg-white text-brand-700 shadow-md">
        <svg aria-hidden="true" viewBox="0 0 44 44" className="pointer-events-none absolute -inset-px -rotate-90">
          <circle cx="22" cy="22" r={RADIUS} fill="none" strokeWidth="2" className="stroke-stone-200" />
          <circle
            ref={ring}
            cx="22"
            cy="22"
            r={RADIUS}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE}
            className="btt-ring stroke-brand-600"
          />
        </svg>
        <ArrowUpIcon />
      </span>
    </button>
  )
}
