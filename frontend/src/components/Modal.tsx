import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react'

/**
 * Small modal form on the native <dialog>: showModal() traps focus and makes the page behind inert, Esc closes.
 * Render it only while open; focus returns to the element that opened it.
 */
export default function Modal({
  title,
  onClose,
  onSubmit,
  submitLabel,
  pendingLabel = 'Đang xử lý...',
  cancelLabel = 'Đóng',
  pending = false,
  danger = false,
  error,
  children,
}: {
  title: string
  onClose: () => void
  onSubmit: () => void
  submitLabel: string
  pendingLabel?: string
  cancelLabel?: string
  pending?: boolean
  danger?: boolean
  error?: string | null
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement as HTMLElement | null
    dialog?.showModal?.()
    return () => {
      dialog?.close?.()
      opener?.focus?.()
    }
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!pending) onSubmit()
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (!pending) onClose()
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-stone-900/50"
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-lg font-bold text-stone-900">
          {title}
        </h2>
        {children}
        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-70 ${
              danger ? 'bg-red-700 hover:bg-red-800' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {pending ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}
