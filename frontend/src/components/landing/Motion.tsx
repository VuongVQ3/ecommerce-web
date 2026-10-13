import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { useCountUp, useInView, usePrefersReducedMotion } from '../../lib/motion'

type RevealFrom = 'up' | 'left' | 'right' | 'scale'

/** Fades/slides its content in the first time it scrolls into view. Static when reduced motion is on (CSS). */
export function Reveal({
  children,
  from = 'up',
  delay = 0,
  className = '',
}: {
  children: ReactNode
  from?: RevealFrom
  delay?: number
  className?: string
}) {
  const [ref, visible] = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal reveal-${from} ${visible ? 'is-visible' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/** A number that counts up when it becomes visible. Screen readers get the final value only. */
export function CountUp({ value, suffix = '', className = '' }: { value: number; suffix?: string; className?: string }) {
  const [ref, visible] = useInView<HTMLSpanElement>()
  const shown = useCountUp(value, visible)
  return (
    <span ref={ref} className={className}>
      <span aria-hidden className="tabular-nums">
        {shown.toLocaleString('vi-VN')}
        {suffix}
      </span>
      <span className="sr-only">
        {value.toLocaleString('vi-VN')}
        {suffix}
      </span>
    </span>
  )
}

/** Infinite horizontal ticker. The duplicate copy is hidden from assistive tech; hovering pauses it. */
export function Marquee({ items, className = '' }: { items: string[]; className?: string }) {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-8 pr-8">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-8 whitespace-nowrap">
          {item}
          <span aria-hidden className="text-nut">✦</span>
        </li>
      ))}
    </ul>
  )
  return (
    <div className={`marquee group flex overflow-hidden ${className}`}>
      <div className="marquee-track flex">
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}

/** Card that tilts toward the pointer (mouse/pen only; off for touch and reduced motion). */
export function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType === 'touch' || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    ref.current.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`)
    ref.current.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`)
    ref.current.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`)
    ref.current.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(0)}%`)
  }
  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg')
    ref.current?.style.setProperty('--ry', '0deg')
  }
  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className={`tilt-card ${className}`}>
      {children}
    </div>
  )
}

/** Thin bar at the very top showing how far the page has been scrolled. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      bar.current?.style.setProperty('transform', `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1">
      <div ref={bar} className="h-full origin-left scale-x-0 bg-gradient-to-r from-brand-500 via-amber-500 to-nut" />
    </div>
  )
}

/**
 * Pointer parallax for decorative layers: children read --mx / --my (−1…1) via CSS. Throttled to one update per
 * frame; inert for touch and reduced motion.
 */
export function ParallaxArea({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const reduced = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType === 'touch' || frame.current) return
    const { clientX, clientY } = e
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const r = ref.current?.getBoundingClientRect()
      if (!r || !ref.current) return
      ref.current.style.setProperty('--mx', (((clientX - r.left) / r.width) * 2 - 1).toFixed(3))
      ref.current.style.setProperty('--my', (((clientY - r.top) / r.height) * 2 - 1).toFixed(3))
    })
  }
  return (
    <div ref={ref} onPointerMove={onMove} className={className} style={style}>
      {children}
    </div>
  )
}
