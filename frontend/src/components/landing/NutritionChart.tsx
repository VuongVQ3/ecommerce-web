import { useId, useState } from 'react'
import { Link } from 'react-router'
import type { ProductSummary } from '../../lib/api'
import { useInView } from '../../lib/motion'

const METRICS = {
  protein: { label: 'Protein', unit: 'g', note: 'Nhiều protein nhất', pick: (p: ProductSummary) => p.protein, desc: true },
  calories: { label: 'Năng lượng', unit: 'kcal', note: 'Ít calo nhất', pick: (p: ProductSummary) => p.calories, desc: false },
} as const

type Metric = keyof typeof METRICS

/** Animated horizontal bars from real catalogue data (per 100g); bars grow when scrolled into view. */
export default function NutritionChart({ products }: { products: ProductSummary[] }) {
  const [metric, setMetric] = useState<Metric>('protein')
  const [ref, visible] = useInView<HTMLDivElement>()
  const panelId = useId()
  const m = METRICS[metric]
  const rows = [...products].sort((a, b) => (m.desc ? m.pick(b) - m.pick(a) : m.pick(a) - m.pick(b))).slice(0, 6)
  const max = Math.max(...products.map(m.pick), 1)

  return (
    <div ref={ref} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{m.note} · trên 100g</p>
        <div className="flex rounded-full bg-stone-100 p-1" role="group" aria-label="Chọn chỉ số">
          {(Object.keys(METRICS) as Metric[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={metric === key}
              aria-controls={panelId}
              onClick={() => setMetric(key)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                metric === key ? 'bg-white text-brand-800 shadow' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {METRICS[key].label}
            </button>
          ))}
        </div>
      </div>
      <ol id={panelId} aria-live="polite" className="mt-6 space-y-4">
        {rows.map((p, i) => {
          const value = m.pick(p)
          return (
            <li key={`${metric}-${p.id}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <Link to={`/san-pham/${p.slug}`} className="min-w-0 truncate font-medium text-stone-800 hover:text-brand-700">
                  {p.name}
                </Link>
                <span className="shrink-0 font-semibold text-stone-900 tabular-nums">
                  {value} {m.unit}
                </span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-stone-100" aria-hidden>
                <div
                  className="grow-bar h-full rounded-full bg-gradient-to-r from-brand-500 to-amber-500"
                  style={{ width: visible ? `${(value / max) * 100}%` : '0%', transitionDelay: `${i * 90}ms` }}
                />
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
