import type { ReactNode } from 'react'

/** Look of every text-like form control (TextField, SelectField, ComboboxField). */
export const inputClass = (error?: string) =>
  `w-full rounded-xl border bg-white px-4 py-3 text-base outline-none placeholder:text-muted focus:ring-2 sm:py-2.5 ${
    error ? 'border-danger focus:ring-red-100' : 'border-stone-200 focus:border-brand-500 focus:ring-brand-100'
  }`

/** aria-describedby of a field in a FieldShell: whatever is visible under it (error or hint), plus `extra`. */
export function describedByIds(id: string, error?: string, hint?: ReactNode, extra?: string) {
  const ids = [error ? `${id}-error` : hint ? `${id}-hint` : null, extra].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}
