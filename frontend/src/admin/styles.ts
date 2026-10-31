/** Shared class names for the back office (no UI library: plain Tailwind). */
const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const btnTone = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-700',
  secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 focus-visible:outline-brand-700',
  danger: 'bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-800',
}
const sized = (size: string) => ({
  primary: `${btnBase} ${size} ${btnTone.primary}`,
  secondary: `${btnBase} ${size} ${btnTone.secondary}`,
  danger: `${btnBase} ${size} ${btnTone.danger}`,
})

export const btn = {
  ...sized('py-2.5'),
  link: 'text-sm font-semibold text-brand-700 underline-offset-2 hover:underline',
}

/** Buttons in a filter bar: exactly as high as the inputs next to them (40px) */
export const filterBtn = sized('h-10')

const field =
  'w-full rounded-xl border border-stone-300 bg-white px-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 lg:text-sm aria-[invalid=true]:border-danger'

export const input = `${field} py-2.5`

/** Inputs and selects in a filter bar (40px) */
export const filterInput = `${field} h-10`

export const card = 'rounded-2xl border border-stone-200 bg-white'

export const table = {
  /** Frame of a table used outside TableFrame (TableFrame adds its own) */
  wrap: 'rounded-2xl border border-stone-200 bg-white',
  table: 'w-full min-w-[640px] text-left text-sm',
  // Sticks under the phone/tablet top bar (56px), to the top of the window from 1024px: the page scrolls, not the
  // table. A shadow instead of a bottom border: collapsed borders stay behind when the header sticks.
  th: 'sticky top-14 z-10 bg-stone-50 px-4 py-3 font-semibold whitespace-nowrap text-stone-600 shadow-[inset_0_-1px_0_var(--color-stone-200)] lg:top-0',
  /** Header cell of a table inside a dialog or drawer (no page-level sticking) */
  thStatic: 'border-b border-stone-200 bg-stone-50 px-4 py-3 font-semibold whitespace-nowrap text-stone-600',
  td: 'border-b border-stone-100 px-4 py-3 align-middle',
}
