import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'

const GSI_SRC = 'https://accounts.google.com/gsi/client'
/** Google's button is at most 400 px wide */
const MAX_BUTTON_WIDTH = 400
const FAILED = 'Đăng nhập Google không thành công. Vui lòng thử lại.'

let scriptPromise: Promise<void> | null = null

/** Loaded once, and only by the pages that show the button. */
function loadGoogleScript(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      script.remove()
      reject(new Error('Không tải được Google Sign-In'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

interface Props {
  text?: 'signin_with' | 'signup_with' | 'continue_with'
  /** Receives the Google ID token and exchanges it with the backend; a rejection is shown as a toast. */
  onCredential: (credential: string) => Promise<void>
  /** Small print under the button (e.g. that a first Google sign-in accepts the terms). */
  footnote?: ReactNode
}

/**
 * Google's official button (Google Identity Services, popup), meant to sit above the email form: "hoặc" below it
 * separates the two. Renders nothing when the backend has no Google client ID or Google's script cannot be loaded,
 * so the email form works on its own.
 */
export default function GoogleSignInButton({ text = 'continue_with', onCredential, footnote }: Props) {
  const providers = useAsync((signal) => api.authProviders(signal), [])
  const clientId = providers.data?.googleClientId
  const toast = useToast()
  const container = useRef<HTMLDivElement>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState(false)
  // A second credential while the first is being exchanged (double click in the popup) is ignored
  const busyRef = useRef(false)

  // Google keeps the first callback it was given, so route through refs to always call the latest props.
  const onCredentialRef = useRef(onCredential)
  const toastRef = useRef(toast)
  useEffect(() => {
    onCredentialRef.current = onCredential
    toastRef.current = toast
  })

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    loadGoogleScript()
      .then(() => {
        const gsi = window.google?.accounts.id
        if (cancelled || !gsi || !container.current) return
        gsi.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: async ({ credential }) => {
            if (busyRef.current) return
            busyRef.current = true
            setBusy(true)
            try {
              await onCredentialRef.current(credential)
            } catch (err) {
              // The backend's message for a refused token, a locked account...; never a technical one
              const message = err instanceof Error && err.message ? err.message : FAILED
              toastRef.current({ tone: 'error', message })
            } finally {
              busyRef.current = false
              setBusy(false)
            }
          },
        })
        gsi.renderButton(container.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text,
          logo_alignment: 'center',
          // As wide as the form under it
          width: Math.min(container.current.offsetWidth || 360, MAX_BUTTON_WIDTH),
          locale: 'vi',
        })
      })
      .catch(() => !cancelled && setUnavailable(true))
    return () => {
      cancelled = true
    }
  }, [clientId, text])

  if (!clientId || unavailable) return null

  return (
    <div className="mt-6" aria-busy={busy || undefined}>
      <div ref={container} className={`flex min-h-11 justify-center ${busy ? 'pointer-events-none opacity-60' : ''}`} />
      {busy && (
        <p className="mt-2 text-center text-sm text-muted" role="status">
          Đang đăng nhập với Google...
        </p>
      )}
      {footnote && <p className="mt-3 text-center text-xs text-muted">{footnote}</p>}
      <div className="mt-6 flex items-center gap-3 text-xs text-muted uppercase">
        <span className="h-px flex-1 bg-stone-200" />
        hoặc
        <span className="h-px flex-1 bg-stone-200" />
      </div>
    </div>
  )
}
