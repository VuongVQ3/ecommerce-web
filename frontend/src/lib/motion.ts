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

/**
 * Count-up clock: progress 0 → 1, linear, over `durationMs`, from the frame `start` turns true; the last frame is
 * exactly 1. One clock shared by several numbers (each shows Math.round(target × progress)) makes them start together
 * and stop almost together: linear, a number reaches its target in the last 0.5/target of the run (100: the last
 * 7 ms; an ease-out would stop it hundreds of ms before a 3000).
 * 1 before the start and with reduced motion: the final numbers are shown from the start (no JavaScript, crawlers),
 * and the count-up only plays once, when it scrolls into view and motion is allowed.
 */
export function useCountUpProgress(start: boolean, durationMs = 1400): number {
  const reduced = usePrefersReducedMotion()
  // Only read once started (before that the hook returns 1), so the first frame of the count shows 0
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!start || reduced) return
    let frame = 0
    let began: number | null = null
    const tick = (now: number) => {
      began ??= now
      const t = Math.min(1, (now - began) / durationMs)
      setProgress(t)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      setProgress(1)
    }
  }, [start, durationMs, reduced])
  return reduced || !start ? 1 : progress
}
