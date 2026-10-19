import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useBlocker } from 'react-router'
import { RequiredMark } from '../components/FormFields'
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
  requiredMark = false,
  children,
}: {
  label: string
  error?: string
  hint?: string
  /** Red * after the label; the control gets aria-required (see components/FormFields) */
  requiredMark?: boolean
  children: (props: {
    id: string
    'aria-invalid'?: true
    'aria-describedby'?: string
    'aria-required'?: true
    className: string
  }) => ReactNode
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-stone-700">
        <label htmlFor={id}>{label}</label>
        {requiredMark && <RequiredMark />}
      </p>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': requiredMark ? true : undefined,
        className: input,
      })}
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
  variant = 'dialog',
  cancelLabel,
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
  /** "sheet": slides from the bottom on phones (filters), centered from 640px */
  variant?: 'dialog' | 'sheet'
  /** Labels of the two buttons when not the defaults */
  cancelLabel?: string
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
      className={`bg-white p-0 shadow-2xl backdrop:bg-stone-900/50 ${
        variant === 'sheet'
          ? 'm-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-2xl pb-[env(safe-area-inset-bottom)] sm:m-auto sm:w-[min(var(--dialog-width,32rem),calc(100vw-2rem))] sm:rounded-2xl'
          : 'm-auto w-[min(var(--dialog-width,32rem),calc(100vw-2rem))] rounded-2xl'
      }`}
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5 sm:p-6">
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
            {cancelLabel ?? (onSubmit ? 'Huỷ bỏ' : 'Đóng')}
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

/** "⋯" menu for row actions on small screens. Arrow keys move, Esc closes and returns focus to the button. */
export function ActionMenu({ label, items }: { label: string; items: { label: string; onSelect: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && e.target !== button.current) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const onKeyDown = (e: KeyboardEvent) => {
    const entries = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = entries.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      entries[(i + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length]?.focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault()
      setOpen(false)
      button.current?.focus()
    }
  }

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex size-10 items-center justify-center rounded-xl border border-stone-300 bg-white text-xl leading-none text-stone-700 hover:bg-stone-50"
      >
        ⋯
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="absolute right-0 z-30 mt-1 min-w-44 rounded-xl border border-stone-200 bg-white p-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-stone-100 focus:bg-stone-100 focus:outline-none ${
                item.danger ? 'text-danger' : 'text-stone-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Warns before leaving a form with unsaved changes: navigation inside the app shows an in-page dialog, closing or
 * reloading the tab shows the browser's own prompt.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  // Navigating with state { skipUnsavedGuard: true } (e.g. right after saving) is never blocked
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when &&
      currentLocation.pathname !== nextLocation.pathname &&
      !(nextLocation.state as { skipUnsavedGuard?: boolean } | null)?.skipUnsavedGuard,
  )

  useEffect(() => {
    if (!when) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [when])

  if (blocker.state !== 'blocked') return null
  return (
    <Dialog
      title="Rời trang khi chưa lưu?"
      submitLabel="Rời trang"
      cancelLabel="Ở lại"
      tone="danger"
      onSubmit={() => blocker.proceed()}
      onClose={() => blocker.reset()}
    >
      <p className="text-sm text-stone-600">Các thay đổi bạn vừa nhập sẽ bị mất.</p>
    </Dialog>
  )
}
