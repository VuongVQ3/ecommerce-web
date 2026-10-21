import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY
const TOKEN_TIMEOUT_MS = 20_000
const WIDGET_ERROR = 'Xác minh chống spam gặp lỗi. Vui lòng tải lại trang và thử lại.'
/** Width of the "normal" widget; narrower containers (phones) get the "compact" one (150 × 140 px) */
const NORMAL_WIDTH = 300

export interface TurnstileHandle {
  /** Resolves with a fresh token, waiting for the challenge to finish if needed. */
  getToken(): Promise<string>
  /** Tokens are single-use: call after every submit attempt to get a new one. */
  reset(): void
}

/** pending: no token yet (loading, being checked, expired, reset); ready: a token is waiting; error: see the message */
export type TurnstileStatus = 'pending' | 'ready' | 'error'

let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Không tải được công cụ chống spam. Vui lòng tải lại trang.'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * Cloudflare Turnstile anti-bot check, always visible (appearance "always"): the visitor sees the box being checked,
 * and ticks it when Cloudflare asks. A problem (wrong domain for the site key, no network...) shows a message under
 * it right away. The form should not submit before onStatusChange reports "ready".
 * Site key: VITE_TURNSTILE_SITE_KEY (see frontend/.env.example).
 */
export default function Turnstile({
  ref,
  action,
  onStatusChange,
}: {
  ref: Ref<TurnstileHandle>
  action?: string
  onStatusChange?: (status: TurnstileStatus) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const token = useRef<string | null>(null)
  const error = useRef<string | null>(null)
  const waiters = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void }[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [compact, setCompact] = useState(false)

  // Turnstile keeps the callbacks it was rendered with: always report through the latest prop
  const onStatusRef = useRef(onStatusChange)
  useEffect(() => {
    onStatusRef.current = onStatusChange
  })
  const report = (status: TurnstileStatus) => onStatusRef.current?.(status)

  const fail = (text: string) => {
    token.current = null
    error.current = text
    setMessage(text)
    report('error')
    for (const w of waiters.current.splice(0)) w.reject(new Error(text))
  }

  useEffect(() => {
    report('pending')
    if (!SITE_KEY) {
      fail('Thiếu cấu hình chống spam (VITE_TURNSTILE_SITE_KEY).')
      return
    }
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return
        const size = container.current.offsetWidth > 0 && container.current.offsetWidth < NORMAL_WIDTH ? 'compact' : 'normal'
        setCompact(size === 'compact')
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          appearance: 'always',
          size,
          language: 'vi',
          action,
          callback: (t) => {
            token.current = t
            error.current = null
            setMessage(null)
            report('ready')
            for (const w of waiters.current.splice(0)) w.resolve(t)
          },
          'expired-callback': () => {
            // Turnstile renews it by itself; until then there is nothing to send
            token.current = null
            report('pending')
          },
          'error-callback': () => fail(WIDGET_ERROR),
        })
      })
      .catch((e: Error) => !cancelled && fail(e.message))
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
    // report/fail only touch refs and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action])

  useImperativeHandle(ref, () => ({
    getToken() {
      if (token.current) return Promise.resolve(token.current)
      if (error.current) return Promise.reject(new Error(error.current))
      return new Promise<string>((resolve, reject) => {
        const entry = { resolve, reject }
        waiters.current.push(entry)
        setTimeout(() => {
          const i = waiters.current.indexOf(entry)
          if (i >= 0) {
            waiters.current.splice(i, 1)
            reject(new Error('Xác minh chống spam quá lâu. Vui lòng thử lại.'))
          }
        }, TOKEN_TIMEOUT_MS)
      })
    },
    reset() {
      token.current = null
      if (widgetId.current && window.turnstile) {
        report('pending')
        window.turnstile.reset(widgetId.current)
      }
    },
  }))

  return (
    <div>
      {/* Reserves the widget's height (65 px, compact 140 px) so the form does not jump when it appears */}
      <div ref={container} className={`flex justify-center ${compact ? 'min-h-[140px]' : 'min-h-[65px]'}`} />
      {message && (
        <p className="mt-2 text-center text-sm text-danger" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
