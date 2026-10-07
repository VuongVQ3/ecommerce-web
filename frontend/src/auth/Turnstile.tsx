import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY
const TOKEN_TIMEOUT_MS = 20_000

export interface TurnstileHandle {
  /** Resolves with a fresh token, waiting for the (usually invisible) challenge to finish if needed. */
  getToken(): Promise<string>
  /** Tokens are single-use: call after every submit attempt to get a new one. */
  reset(): void
}

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
 * Cloudflare Turnstile anti-bot check. With appearance "interaction-only" and a managed/invisible widget, most
 * visitors never see it; the container only shows a checkbox when Cloudflare asks for one.
 * Site key: VITE_TURNSTILE_SITE_KEY (see frontend/.env.example).
 */
export default function Turnstile({ ref, action }: { ref: Ref<TurnstileHandle>; action?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const token = useRef<string | null>(null)
  const error = useRef<string | null>(null)
  const waiters = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void }[]>([])

  useEffect(() => {
    if (!SITE_KEY) {
      error.current = 'Thiếu cấu hình chống spam (VITE_TURNSTILE_SITE_KEY).'
      return
    }
    let cancelled = false
    const settle = (value: { token: string } | { error: string }) => {
      const pending = waiters.current.splice(0)
      for (const w of pending) {
        if ('token' in value) w.resolve(value.token)
        else w.reject(new Error(value.error))
      }
    }
    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          appearance: 'interaction-only',
          language: 'vi',
          action,
          callback: (t) => {
            token.current = t
            error.current = null
            settle({ token: t })
          },
          'expired-callback': () => {
            token.current = null
          },
          'error-callback': () => {
            token.current = null
            error.current = 'Xác minh chống spam gặp lỗi. Vui lòng tải lại trang và thử lại.'
            settle({ error: error.current })
          },
        })
      })
      .catch((e: Error) => {
        error.current = e.message
        settle({ error: e.message })
      })
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
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
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
    },
  }))

  return <div ref={container} className="flex justify-center empty:hidden" />
}
