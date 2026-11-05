// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComboboxGroup, ComboboxOption } from '../lib/addressSearch'
import { ComboboxField } from './ComboboxField'

const options: ComboboxOption[] = [
  { value: '91', label: 'Tỉnh An Giang' },
  { value: '48', label: 'Thành phố Đà Nẵng', keywords: ['dn'] },
  { value: '1', label: 'Thành phố Hà Nội', keywords: ['hn'] },
  { value: '42', label: 'Tỉnh Hà Tĩnh' },
  { value: '79', label: 'Thành phố Hồ Chí Minh', keywords: ['hcm'] },
]
const groups: ComboboxGroup[] = [
  { label: 'Thường chọn', options: [options[4]] },
  { label: 'Tất cả', options: options.slice(0, 4) },
]

const changes = vi.fn<(value: string) => void>()

function Harness({ initial = '', withGroups = false }: { initial?: string; withGroups?: boolean }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <ComboboxField
        label="Tỉnh/Thành phố"
        placeholder="Chọn tỉnh/thành phố"
        requiredMark
        options={options}
        groups={withGroups ? groups : undefined}
        value={value}
        onChange={(v) => {
          changes(v)
          setValue(v)
        }}
      />
      <output data-testid="value">{value}</output>
      <button type="button">Ra ngoài</button>
    </>
  )
}

const box = () => screen.getByRole('combobox', { name: 'Tỉnh/Thành phố' }) as HTMLInputElement
const value = () => screen.getByTestId('value').textContent
const optionNames = () => screen.queryAllByRole('option').map((o) => o.textContent)
const type = (text: string) => fireEvent.change(box(), { target: { value: text } })
const key = (k: string) => fireEvent.keyDown(box(), { key: k })

afterEach(() => {
  cleanup()
  changes.mockReset()
})

describe('ComboboxField', () => {
  it('opens the whole list on focus, grouped, with the ARIA wiring', () => {
    render(<Harness withGroups />)
    const input = box()
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.getAttribute('aria-required')).toBe('true')
    expect(input.getAttribute('inputmode')).toBe('search')
    fireEvent.focus(input)
    expect(input.getAttribute('aria-expanded')).toBe('true')
    const listbox = screen.getByRole('listbox')
    expect(input.getAttribute('aria-controls')).toBe(listbox.id)
    expect(screen.getByRole('group', { name: 'Thường chọn' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Tất cả' })).toBeTruthy()
    expect(optionNames()[0]).toBe('Thành phố Hồ Chí Minh')
    // Nothing chosen: nothing highlighted until ↓
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
    key('ArrowDown')
    const first = screen.getAllByRole('option')[0]
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id)
    expect(first.getAttribute('aria-selected')).toBe('true')
  })

  it('filters as you type, without groups, and picks with ↑/↓ and Enter', () => {
    render(<Harness withGroups />)
    fireEvent.focus(box())
    type('ha')
    expect(screen.queryByRole('group')).toBeNull()
    expect(optionNames()).toEqual(['Thành phố Hà Nội', 'Tỉnh Hà Tĩnh'])
    // The best match is highlighted, ↓ moves on, ↑ comes back
    const [hn, ht] = screen.getAllByRole('option')
    expect(box().getAttribute('aria-activedescendant')).toBe(hn.id)
    key('ArrowDown')
    expect(box().getAttribute('aria-activedescendant')).toBe(ht.id)
    key('ArrowDown')
    expect(box().getAttribute('aria-activedescendant')).toBe(ht.id)
    key('ArrowUp')
    key('ArrowDown')
    const enter = fireEvent.keyDown(box(), { key: 'Enter' })
    // Enter does not submit a form while the list is open
    expect(enter).toBe(false)
    expect(value()).toBe('42')
    expect(box().value).toBe('Tỉnh Hà Tĩnh')
    expect(box().getAttribute('aria-expanded')).toBe('false')
  })

  it('bolds the matching part, accents or not', () => {
    render(<Harness />)
    fireEvent.focus(box())
    type('ho chi')
    const marks = [...screen.getByRole('option').querySelectorAll('mark')].map((m) => m.textContent)
    expect(marks).toEqual(['Hồ', 'Chí'])
  })

  it('says when nothing matches', () => {
    render(<Harness />)
    fireEvent.focus(box())
    type('xyz')
    const none = screen.getByRole('option')
    expect(none.textContent).toBe('Không tìm thấy “xyz”')
    expect(none.getAttribute('aria-disabled')).toBe('true')
    expect(box().getAttribute('aria-activedescendant')).toBeNull()
    // Enter just closes
    key('Enter')
    expect(value()).toBe('')
  })

  it('Esc closes, a second Esc puts the chosen name back', () => {
    render(<Harness initial="79" />)
    expect(box().value).toBe('Thành phố Hồ Chí Minh')
    fireEvent.focus(box())
    type('ha')
    key('Escape')
    expect(box().getAttribute('aria-expanded')).toBe('false')
    expect(box().value).toBe('ha')
    key('Escape')
    expect(box().value).toBe('Thành phố Hồ Chí Minh')
    expect(value()).toBe('79')
    expect(changes).not.toHaveBeenCalled()
  })

  it('leaving the box picks the only match', () => {
    render(<Harness />)
    fireEvent.focus(box())
    type('hcm')
    fireEvent.blur(box())
    expect(value()).toBe('79')
    expect(box().value).toBe('Thành phố Hồ Chí Minh')
  })

  it('leaving the box with several or no matches puts the chosen name back, never free text', () => {
    render(<Harness initial="91" />)
    fireEvent.focus(box())
    type('ha')
    fireEvent.blur(box())
    expect(value()).toBe('91')
    expect(box().value).toBe('Tỉnh An Giang')
    fireEvent.focus(box())
    type('xyz')
    fireEvent.blur(box())
    expect(box().value).toBe('Tỉnh An Giang')
    expect(changes).not.toHaveBeenCalled()
  })

  it('leaving an empty box with nothing chosen leaves it empty', () => {
    render(<Harness />)
    fireEvent.focus(box())
    type('ha')
    fireEvent.blur(box())
    expect(box().value).toBe('')
    expect(value()).toBe('')
  })

  it('Tab takes the highlighted match once something was typed, not before', () => {
    render(<Harness />)
    fireEvent.focus(box())
    key('ArrowDown')
    key('Tab')
    expect(value()).toBe('')
    type('ha')
    key('ArrowDown')
    key('Tab')
    expect(value()).toBe('42')
  })

  it('a tap picks, a scroll does not', () => {
    render(<Harness />)
    fireEvent.focus(box())
    const [, danang] = screen.getAllByRole('option')
    // Finger moves 40px: a scroll of the list
    fireEvent.pointerDown(danang, { clientX: 10, clientY: 100 })
    fireEvent.pointerMove(screen.getByRole('listbox'), { clientX: 10, clientY: 60 })
    fireEvent.pointerUp(danang)
    expect(value()).toBe('')
    fireEvent.pointerDown(danang, { clientX: 10, clientY: 100 })
    fireEvent.pointerUp(danang)
    expect(value()).toBe('48')
    expect(box().getAttribute('aria-expanded')).toBe('false')
  })

  it('✕ clears the choice', () => {
    render(<Harness initial="1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Xoá Thành phố Hà Nội' }))
    expect(value()).toBe('')
    expect(box().value).toBe('')
  })

  it('is disabled with its placeholder', () => {
    render(
      <ComboboxField label="Phường/Xã" placeholder="Chọn tỉnh/thành phố trước" disabled options={[]} value="" onChange={changes} />,
    )
    const input = screen.getByRole('combobox', { name: 'Phường/Xã' }) as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.placeholder).toBe('Chọn tỉnh/thành phố trước')
    fireEvent.focus(input)
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })
})
