import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'

const GSI_SRC = 'https://accounts.google.com/gsi/client'

let scriptPromise: Promise<void> | null = null

function loadGoogleScript(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Không tải được Google Sign-In'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

interface Props {
  text: 'signin_with' | 'signup_with' | 'continue_with'
  /** Receives the Google ID token; should exchange it with the backend. Rejections are shown below the button. */
  onCredential: (credential: string) => Promise<void>
  /** Small print under the button (e.g. that a first Google sign-in accepts the terms). */
  footnote?: ReactNode
}

/**
 * Renders Google's official sign-in button. Renders nothing when the backend has no Google client ID configured.
 */
export default function GoogleSignInButton({ text, onCredential, footnote }: Props) {
  const providers = useAsync((signal) => api.authProviders(signal), [])
  const clientId = providers.data?.googleClientId
  const container = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Google keeps the first callback it was given, so route through a ref to always call the latest prop.
  const onCredentialRef = useRef(onCredential)
  useEffect(() => {
    onCredentialRef.current = onCredential
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
            setError(null)
            setBusy(true)
            try {
              await onCredentialRef.current(credential)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Đăng nhập Google thất bại')
            } finally {
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
          width: Math.min(container.current.offsetWidth || 360, 400),
          locale: 'vi',
        })
      })
      .catch((err: Error) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [clientId, text])

  if (!clientId) return null

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 text-xs text-muted uppercase">
        <span className="h-px flex-1 bg-stone-200" />
        hoặc
        <span className="h-px flex-1 bg-stone-200" />
      </div>
      <div ref={container} className={`mt-4 flex min-h-11 justify-center ${busy ? 'pointer-events-none opacity-60' : ''}`} />
      {busy && <p className="mt-2 text-center text-sm text-muted">Đang đăng nhập với Google...</p>}
      {footnote && <p className="mt-3 text-center text-xs text-muted">{footnote}</p>}
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
