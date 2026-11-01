import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { card } from './styles'

/** After this long without data the server is probably waking up (Render free instances sleep) */
const SLOW_MS = 5000

function Bar({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden style={style} className={`block animate-pulse rounded-md bg-stone-200 ${className}`} />
}

function Box({ className = '', children }: { className?: string; children?: ReactNode }) {
  return <div className={`${card} p-5 ${className}`}>{children}</div>
}

function TableRows({ rows }: { rows: number }) {
  return (
    <>
      {/* Phones: cards, as the lists show there */}
      <div className="space-y-3 md:hidden">
        {Array.from({ length: Math.min(rows, 4) }, (_, i) => (
          <Box key={i} className="space-y-2.5 p-4">
            <div className="flex justify-between gap-3">
              <Bar className="h-4 w-28" />
              <Bar className="h-5 w-20 rounded-full" />
            </div>
            <Bar className="h-3.5 w-2/3" />
            <Bar className="h-3.5 w-1/3" />
          </Box>
        ))}
      </div>
      <div className={`${card} hidden overflow-hidden md:block`}>
        <div className="flex gap-6 border-b border-stone-200 bg-stone-50 px-4 py-3.5">
          {[24, 16, 32, 14, 18].map((w, i) => (
            <Bar key={i} className="h-3.5" style={{ width: `${w}%` }} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-stone-100 px-4 py-4 last:border-0">
            <Bar className="h-4 w-[24%]" />
            <Bar className="h-4 w-[16%]" />
            <div className="w-[32%] space-y-1.5">
              <Bar className="h-4 w-3/4" />
              <Bar className="h-3 w-1/2" />
            </div>
            <Bar className="h-4 w-[14%]" />
            <Bar className="h-5 w-[12%] rounded-full" />
          </div>
        ))}
      </div>
    </>
  )
}

const VARIANTS = {
  /** Dashboard: the "Việc cần làm" card, three cells side by side (stacked when narrow) */
  'now-cards': () => (
    <div className={`${card} overflow-hidden`}>
      <div className="-mt-px -ml-px flex flex-wrap">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-17 min-w-[260px] flex-1 items-center gap-3 border-t border-l border-stone-200 px-4 py-3">
            <Bar className="size-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Bar className="h-3.5 w-1/2" />
              <Bar className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
  /** Dashboard, the day: card with 4 totals, 7 columns and a footer; then best sellers and the day's orders */
  day: () => (
    <div className="space-y-6">
      <div className={`${card} @container overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <Bar className="h-4 w-48" />
          <Bar className="h-8 w-56 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-px border-y border-stone-200 bg-stone-200 @min-[48rem]:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2.5 bg-white px-5 py-4">
              <Bar className="h-3.5 w-2/3" />
              <Bar className="h-6 w-3/4" />
              <Bar className="h-3 w-1/2" />
            </div>
          ))}
        </div>
        <div className="flex h-60 items-end gap-1 px-3 pt-11 pb-10 sm:gap-2 sm:px-5">
          {[45, 0, 30, 80, 20, 0, 60].map((h, i) => (
            <Bar key={i} className="flex-1 rounded-b-none" style={{ height: `${Math.max(h, 8)}%` }} />
          ))}
        </div>
        <div className="border-t border-stone-100 px-5 py-3.5">
          <Bar className="h-3.5 w-64 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        {[5, 7].map((span) => (
          <Box key={span} className={`space-y-3 ${span === 5 ? 'xl:col-span-5' : 'xl:col-span-7'}`}>
            <Bar className="h-4 w-48" />
            {[0, 1, 2, 3, 4].map((i) => (
              <Bar key={i} className="h-6" />
            ))}
          </Box>
        ))}
      </div>
    </div>
  ),
  table: () => <TableRows rows={8} />,
  /** Audit log and flagged phone numbers: a list of short entries */
  list: () => (
    <div className={`${card} divide-y divide-stone-100`}>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Bar className="size-6 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Bar className="h-3.5 w-1/2" />
            <Bar className="h-3 w-1/4 lg:hidden" />
          </div>
          <Bar className="h-3 w-10" />
        </div>
      ))}
    </div>
  ),
  /** Order or user detail: a header, the main blocks and a side column */
  detail: () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Bar className="h-7 w-56" />
        <Bar className="h-3.5 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Box className="space-y-3">
            <Bar className="h-4 w-24" />
            <Bar className="h-4" />
            <Bar className="h-4 w-5/6" />
            <Bar className="h-4 w-2/3" />
          </Box>
          <Box className="space-y-3">
            <Bar className="h-4 w-24" />
            <Bar className="h-4 w-3/4" />
          </Box>
        </div>
        <Box className="space-y-3">
          <Bar className="h-4 w-24" />
          <Bar className="h-6 w-40" />
          <div className="flex gap-2">
            <Bar className="h-10 flex-1" />
            <Bar className="h-10 flex-1" />
            <Bar className="h-10 flex-1" />
          </div>
        </Box>
      </div>
    </div>
  ),
  /** Product form: fields on the left, sale settings on the right */
  form: () => (
    <div className="space-y-4">
      <Bar className="h-7 w-72 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <Box className="space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Bar className="h-3.5 w-28" />
              <Bar className={i === 2 ? 'h-40' : 'h-11'} />
            </div>
          ))}
        </Box>
        <Box className="space-y-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Bar className="h-3.5 w-24" />
              <Bar className="h-11" />
            </div>
          ))}
        </Box>
      </div>
    </div>
  ),
}

/**
 * Grey placeholder in the shape of what is loading, instead of "Đang tải...". Still nothing after 5 seconds: the server
 * is most likely starting up, which can take up to a minute, so say so.
 */
export function Skeleton({
  variant,
  slowNote = true,
}: {
  variant: keyof typeof VARIANTS
  /** false when another skeleton on the page already says it */
  slowNote?: boolean
}) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => window.clearTimeout(timer)
  }, [])
  const Shape = VARIANTS[variant]
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Đang tải...</span>
      {slow && slowNote && (
        <p className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Máy chủ đang khởi động, có thể mất khoảng 30–60 giây…
        </p>
      )}
      <Shape />
    </div>
  )
}
