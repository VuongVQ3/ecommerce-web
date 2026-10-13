/** Shared class names for the back office (no UI library: plain Tailwind). */
export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-60',
  secondary:
    'inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-60',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:cursor-not-allowed disabled:opacity-60',
  link: 'text-sm font-semibold text-brand-700 underline-offset-2 hover:underline',
}

export const input =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:text-sm aria-[invalid=true]:border-danger'

export const card = 'rounded-2xl border border-stone-200 bg-white'

export const table = {
  wrap: 'overflow-x-auto rounded-2xl border border-stone-200 bg-white',
  table: 'w-full min-w-[640px] text-left text-sm',
  th: 'border-b border-stone-200 bg-stone-50 px-4 py-3 font-semibold text-stone-600',
  td: 'border-b border-stone-100 px-4 py-3 align-middle',
}
