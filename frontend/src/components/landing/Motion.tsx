import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { useInView, usePrefersReducedMotion } from '../../lib/motion'

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

/**
 * A number counting up on a shared clock (`progress` from useCountUpProgress), so a row of them lands together.
 * Digits are tabular and the box keeps the width of the final number, right-aligned, so the suffix ("+", "%")
 * stays put while it counts. `grouping` false: "3000", not "3.000". Read by screen readers as the final number.
 */
export function CountUp({
  value,
  progress,
  suffix = '',
  grouping = true,
  className = '',
}: {
  value: number
  progress: number
  suffix?: string
  grouping?: boolean
  className?: string
}) {
  const format = (n: number) => (grouping ? n.toLocaleString('vi-VN') : String(n))
  return (
    <span className={className}>
      <span aria-hidden className="tabular-nums">
        <span className="inline-grid justify-items-end">
          <span className="invisible col-start-1 row-start-1">{format(value)}</span>
          <span className="col-start-1 row-start-1">{format(Math.round(value * progress))}</span>
        </span>
        {suffix}
      </span>
      <span className="sr-only">
        {format(value)}
        {suffix}
      </span>
    </span>
  )
}

/** Infinite horizontal ticker. The duplicate copy is hidden from assistive tech; hovering pauses it. */
export function Marquee({ items, className = '' }: { items: string[]; className?: string }) {
  // iOS WebKit could leave the moving layer unpainted (green band, no text) until the first touch when the animation
  // ran from the very first frame: the text is painted in place first, the animation starts on a later frame.
  const [running, setRunning] = useState(false)
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setRunning(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])

  // No background on the moving parts: the band's colour comes from the element around the Marquee
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
      <div className={`marquee-track flex ${running ? 'is-running' : ''}`}>
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
