import { useState } from 'react'

interface Props {
  value: number
  min?: number
  max: number
  onChange: (value: number) => void
  /** Product name, used in the accessible labels ("Tăng số lượng Hạnh nhân"). */
  label: string
  disabled?: boolean
  size?: 'sm' | 'md'
}

/** − [n] + with keyboard-typable input, clamped to [min, max]. */
export default function QuantityStepper({ value, min = 1, max, onChange, label, disabled, size = 'md' }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (n: number) => Math.min(Math.max(n, min), Math.max(max, min))
  const commit = (raw: string) => {
    setDraft(null)
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && clamp(n) !== value) onChange(clamp(n))
  }
  const box = size === 'sm' ? 'h-9' : 'h-11'
  const button = `flex ${box} w-9 items-center justify-center text-lg font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300`

  return (
    <div className={`inline-flex ${box} items-center rounded-full border border-stone-200 bg-white`} role="group" aria-label={`Số lượng ${label}`}>
      <button
        type="button"
        className={`${button} rounded-l-full`}
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Giảm số lượng ${label}`}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft ?? value}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(e.currentTarget.value)
          }
        }}
        aria-label={`Số lượng ${label}`}
        className="w-10 [appearance:textfield] bg-transparent text-center font-semibold tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        className={`${button} rounded-r-full`}
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Tăng số lượng ${label}`}
      >
        +
      </button>
    </div>
  )
}
