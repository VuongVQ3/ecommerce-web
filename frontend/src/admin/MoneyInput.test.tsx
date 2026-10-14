// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { caretAfterDigits, groupThousands, onlyDigits } from './money'
import MoneyInput from './MoneyInput'

let last: number | null = null

function Harness({ initial = null }: { initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <MoneyInput
      aria-label="Giá"
      value={value}
      onChange={(v) => {
        last = v
        setValue(v)
      }}
    />
  )
}

const input = () => screen.getByLabelText('Giá') as HTMLInputElement

/** Types like a user: puts the new text in and the caret at `caret`, then fires input. */
function type(text: string, caret = text.length) {
  const el = input()
  el.focus()
  fireEvent.change(el, { target: { value: text, selectionStart: caret, selectionEnd: caret } })
}

afterEach(() => {
  cleanup()
  last = null
})

describe('MoneyInput helpers', () => {
  it('groups, cleans and finds caret positions', () => {
    expect(groupThousands('189000')).toBe('189.000')
    expect(groupThousands('1890000')).toBe('1.890.000')
    expect(onlyDigits('1.890.000₫')).toBe('1890000')
    expect(onlyDigits('00012')).toBe('12')
    expect(caretAfterDigits('1.890.000', 2)).toBe(3)
    expect(caretAfterDigits('1.890.000', 7)).toBe(9)
  })
})

describe('MoneyInput', () => {
  it('shows 189000 as 189.000 and reports the number', () => {
    render(<Harness />)
    type('189000')
    expect(input().value).toBe('189.000')
    expect(last).toBe(189000)
  })

  it('handles a pasted "1.890.000" and ignores letters', () => {
    render(<Harness />)
    type('1.890.000')
    expect(input().value).toBe('1.890.000')
    expect(last).toBe(1890000)
    type('12a3')
    expect(input().value).toBe('123')
    expect(last).toBe(123)
  })

  it('keeps the caret after the digit just typed in the middle', () => {
    render(<Harness initial={189000} />)
    // "189.000" → user types "5" after "18": "1859.000" with the caret after the 5
    type('1859.000', 3)
    expect(input().value).toBe('1.859.000')
    expect(input().selectionStart).toBe(4) // "1.85|9.000"
  })

  it('clearing the field gives null', () => {
    render(<Harness initial={189000} />)
    type('')
    expect(input().value).toBe('')
    expect(last).toBeNull()
  })
})
