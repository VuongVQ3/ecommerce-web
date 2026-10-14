import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ComponentProps, type KeyboardEvent } from 'react'
import { caretAfterDigits, groupThousands, onlyDigits } from './money'

type Props = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'inputMode' | 'defaultValue'> & {
  /** Whole đồng, or null when empty */
  value: number | null
  onChange: (value: number | null) => void
}

/**
 * Money field for the back office: shows thousands separators while typing (189.000), keeps the caret where the
 * user is typing or deleting, accepts only digits (pasting "1.890.000" works) and reports a whole number.
 */
const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput({ value, onChange, onKeyDown, ...input }, ref) {
  const inner = useRef<HTMLInputElement>(null)
  const nextCaret = useRef<number | null>(null)
  useImperativeHandle(ref, () => inner.current!, [])

  const display = value == null ? '' : groupThousands(String(value))

  // Put the caret back after React rewrote the value with separators
  useLayoutEffect(() => {
    const el = inner.current
    if (el && nextCaret.current != null && document.activeElement === el) {
      el.setSelectionRange(nextCaret.current, nextCaret.current)
    }
    nextCaret.current = null
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const caret = e.target.selectionStart ?? raw.length
    const digitsBefore = onlyDigits(raw.slice(0, caret)).length + (raw.slice(0, caret).match(/^0+/)?.[0].length ?? 0)
    const digits = onlyDigits(raw)
    const formatted = digits ? groupThousands(digits) : ''
    // Leading zeros were dropped: never place the caret beyond the digits that remain
    nextCaret.current = caretAfterDigits(formatted, Math.min(digitsBefore, digits.length))
    onChange(digits ? Number(digits) : null)
    if (formatted === display) {
      // Same value (e.g. a separator was typed): React will not re-render, restore the caret ourselves
      requestAnimationFrame(() => {
        if (inner.current && nextCaret.current != null) inner.current.setSelectionRange(nextCaret.current, nextCaret.current)
      })
    }
  }

  // Backspace/Delete next to a separator removes the digit beyond it instead of doing nothing
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    const el = e.currentTarget
    const start = el.selectionStart ?? 0
    if (start !== el.selectionEnd) return
    if (e.key === 'Backspace' && start > 0 && el.value[start - 1] === '.') el.setSelectionRange(start - 1, start - 1)
    if (e.key === 'Delete' && el.value[start] === '.') el.setSelectionRange(start + 1, start + 1)
  }

  return (
    <input
      {...input}
      ref={inner}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  )
})

export default MoneyInput
