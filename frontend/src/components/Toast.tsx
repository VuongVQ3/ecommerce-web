import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastInput {
  message: string
  tone?: 'success' | 'error' | 'info'
  action?: ToastAction
  /** ms before it disappears (default 4000) */
  duration?: number
}

interface Toast extends ToastInput {
  id: number
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null)

const TONE = {
  success: 'border-brand-200 bg-white',
  error: 'border-red-200 bg-red-50',
  info: 'border-stone-200 bg-white',
}

/** Small notifications at the bottom of the screen, announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++
      setToasts((all) => [...all.slice(-2), { ...input, id }])
      setTimeout(() => dismiss(id), input.duration ?? 4000)
    },
    [dismiss],
  )

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg ${TONE[t.tone ?? 'info']}`}
          >
            <span className={`flex-1 ${t.tone === 'error' ? 'text-danger' : 'text-stone-800'}`}>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
                className="shrink-0 rounded-full px-3 py-1.5 font-semibold text-brand-700 hover:bg-brand-50"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Đóng thông báo"
              className="shrink-0 rounded-full px-2 text-lg leading-none text-muted hover:text-stone-900"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
