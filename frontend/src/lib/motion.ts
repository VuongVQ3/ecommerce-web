import { useEffect, useRef, useState } from 'react'

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/** True when the visitor asked the OS for less motion: animations should then be skipped. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_QUERY).matches,
  )
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED_QUERY)
    if (!query) return
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/**
 * Becomes true once the element scrolls into view (and stays true). Falls back to visible when
 * IntersectionObserver is unavailable, so content is never hidden.
 */
export function useInView<T extends Element>(rootMargin = '0px 0px -10% 0px') {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin, threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin, visible])
  return [ref, visible] as const
}

/** Animates 0 → target with an ease-out curve once `start` is true (final value before that). */
export function useCountUp(target: number, start: boolean, durationMs = 1400): number {
  const reduced = usePrefersReducedMotion()
  // The final number is shown from the start (no JavaScript, crawlers, reduced motion); the count-up only plays
  // once, when the number scrolls into view and motion is allowed
  const [value, setValue] = useState(target)
  useEffect(() => {
    if (!start || reduced) return
    let frame = 0
    const began = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / durationMs)
      setValue(Math.round(target * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      setValue(target)
    }
  }, [target, start, durationMs, reduced])
  return reduced || !start ? target : value
}
