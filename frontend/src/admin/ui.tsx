import { useEffect, useId, useRef, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { btn, input } from './styles'

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
      <p className="font-semibold text-stone-800">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  )
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="Phân trang">
      <button type="button" className={btn.secondary} disabled={page <= 0} onClick={() => onChange(page - 1)}>
        ← Trước
      </button>
      <span className="tabular-nums text-stone-600">
        Trang {page + 1}/{totalPages}
      </span>
      <button type="button" className={btn.secondary} disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)}>
        Sau →
      </button>
    </nav>
  )
}

/** Small labelled field for admin forms and dialogs. */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: (props: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string; className: string }) => ReactNode
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, className: input })}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/**
 * Modal form built on the native <dialog>: showModal() traps focus, Esc closes, the page behind is inert.
 * Rendered only while open; focus returns to the element that opened it.
 */
export function Dialog({
  title,
  onClose,
  onSubmit,
  submitLabel,
  pending = false,
  tone = 'primary',
  error,
  width,
  children,
}: {
  title: string
  onClose: () => void
  /** Omit for a read-only dialog (only a close button). */
  onSubmit?: () => void
  submitLabel?: string
  pending?: boolean
  tone?: 'primary' | 'danger'
  error?: string | null
  /** e.g. '48rem' for tables */
  width?: string
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
    if (!pending) onSubmit?.()
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      style={width ? ({ '--dialog-width': width } as CSSProperties) : undefined}
      onCancel={(e) => {
        e.preventDefault()
        if (!pending) onClose()
      }}
      className="m-auto w-[min(var(--dialog-width,32rem),calc(100vw-2rem))] rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-stone-900/50"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-lg font-bold text-stone-900">
          {title}
        </h2>
        {children}
        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={pending}>
            {onSubmit ? 'Huỷ bỏ' : 'Đóng'}
          </button>
          {onSubmit && (
            <button
              type="submit"
              className={tone === 'danger' ? btn.danger : btn.primary}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? 'Đang xử lý...' : submitLabel}
            </button>
          )}
        </div>
      </form>
    </dialog>
  )
}
