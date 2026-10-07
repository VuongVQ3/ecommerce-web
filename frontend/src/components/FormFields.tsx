import { useId, useState, type ComponentProps, type ReactNode } from 'react'

interface FieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  /** Defaults to a generated id; pass one when another element must reference this input. */
  id?: string
  label: string
  error?: string
  /** Helper text under the input (hidden while an error is shown). */
  hint?: ReactNode
  /** Extra content under the error/hint, e.g. "Did you mean …?" or links. */
  below?: ReactNode
  /** Id of another element that describes the input (e.g. a live password checklist). */
  describedBy?: string
}

const inputClass = (error?: string) =>
  `w-full rounded-xl border bg-white px-4 py-3 text-base outline-none placeholder:text-muted focus:ring-2 sm:py-2.5 ${
    error ? 'border-danger focus:ring-red-100' : 'border-stone-200 focus:border-brand-500 focus:ring-brand-100'
  }`

/**
 * Label, input slot and the text under it. The input is described by whatever is visible below it (error or hint,
 * plus `describedBy`), so screen readers read the same thing sighted users see.
 */
function FieldShell({
  id,
  label,
  error,
  hint,
  below,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: ReactNode
  below?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        {label}
      </label>
      <div className="mt-1">{children}</div>
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
      {below}
    </div>
  )
}

function describedByIds(id: string, error?: string, hint?: ReactNode, extra?: string) {
  const ids = [error ? `${id}-error` : hint ? `${id}-hint` : null, extra].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

/** Text input with label and an error message right below it. Spread `register('field')` into it. */
export function TextField({ id: idProp, label, error, hint, below, describedBy, className = '', ...input }: FieldProps) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} below={below}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedByIds(id, error, hint, describedBy)}
        className={`${inputClass(error)} ${className}`}
        {...input}
      />
    </FieldShell>
  )
}

interface PasswordFieldProps extends FieldProps {
  /** Controlled visibility, e.g. so one toggle also reveals a "repeat password" field. Uncontrolled if omitted. */
  visible?: boolean
  onVisibleChange?: (visible: boolean) => void
  /** Ids of other inputs the toggle also shows/hides (announced through aria-controls). */
  alsoControls?: string
}

/** Password input with a show/hide toggle (a real button, so it works with keyboard and screen readers). */
export function PasswordField({
  id: idProp,
  label,
  error,
  hint,
  below,
  describedBy,
  visible: visibleProp,
  onVisibleChange,
  alsoControls,
  ...input
}: PasswordFieldProps) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const [visibleState, setVisibleState] = useState(false)
  const visible = visibleProp ?? visibleState
  const setVisible = (update: (v: boolean) => boolean) => {
    const next = update(visible)
    setVisibleState(next)
    onVisibleChange?.(next)
  }
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} below={below}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByIds(id, error, hint, describedBy)}
          className={`${inputClass(error)} pr-16`}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
          aria-controls={[id, alsoControls].filter(Boolean).join(' ')}
          className="absolute inset-y-0 right-0 rounded-r-xl px-4 text-sm font-medium text-muted hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          {visible ? 'Ẩn' : 'Hiện'}
        </button>
      </div>
    </FieldShell>
  )
}

const PASSWORD_CHECKS = [
  { label: 'Ít nhất 8 ký tự', test: (v: string) => v.length >= 8 },
  { label: 'Có cả chữ và số', test: (v: string) => /\p{L}/u.test(v) && /\d/.test(v) },
]

/**
 * Live password requirements. Neutral until met, then green with a tick; never red, so typing is not punished
 * (field errors appear only after leaving the field). State is also given as text for screen readers.
 */
export function PasswordChecklist({ id, value }: { id: string; value: string }) {
  return (
    <ul id={id} aria-live="polite" className="mt-2 space-y-1 text-sm">
      {PASSWORD_CHECKS.map(({ label, test }) => {
        const met = test(value)
        return (
          <li key={label} className={`flex items-center gap-2 ${met ? 'text-success' : 'text-muted'}`}>
            <span aria-hidden className="inline-flex w-4 justify-center font-bold">
              {met ? '✓' : '•'}
            </span>
            {label}
            <span className="sr-only">{met ? '(đã đạt)' : '(chưa đạt)'}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function Checkbox({ label, ...input }: Omit<ComponentProps<'input'>, 'type' | 'id'> & { label: ReactNode }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-stone-300 accent-brand-600"
        {...input}
      />
      <label htmlFor={id} className="cursor-pointer text-sm text-stone-700">
        {label}
      </label>
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger" role="alert">
      {message}
    </p>
  )
}

export function SubmitButton({
  pending,
  pendingLabel = 'Đang xử lý...',
  children,
}: {
  pending: boolean
  pendingLabel?: string
  children: ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-wait disabled:opacity-70"
    >
      {pending && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {pending ? pendingLabel : children}
    </button>
  )
}
