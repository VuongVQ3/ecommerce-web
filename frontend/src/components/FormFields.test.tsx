// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Checkbox, PasswordField, RequiredLegend, SelectField, TextField } from './FormFields'

afterEach(cleanup)

describe('required fields', () => {
  it('marks a required field with a * hidden from screen readers and aria-required', () => {
    const { container } = render(<TextField label="Họ và tên" requiredMark />)
    const input = screen.getByLabelText('Họ và tên')
    expect(input.getAttribute('aria-required')).toBe('true')
    expect(input.hasAttribute('required')).toBe(false)
    const mark = container.querySelector('[aria-hidden="true"]')
    expect(mark?.textContent).toBe('*')
    // The accessible name has no *
    expect(container.querySelector('label')?.textContent).toBe('Họ và tên')
  })

  it('shows nothing extra on an optional field', () => {
    const { container } = render(<TextField label="Email (không bắt buộc)" />)
    expect(screen.getByLabelText('Email (không bắt buộc)').hasAttribute('aria-required')).toBe(false)
    expect(container.textContent).not.toContain('*')
  })

  it('works the same for password, select and checkbox fields', () => {
    render(
      <>
        <PasswordField label="Mật khẩu" requiredMark />
        <SelectField label="Tỉnh/Thành phố" placeholder="Chọn" options={[]} requiredMark />
        <Checkbox label="Tôi đồng ý" requiredMark />
        <SelectField label="Không bắt buộc" placeholder="Chọn" options={[]} />
      </>,
    )
    expect(screen.getByLabelText('Mật khẩu').getAttribute('aria-required')).toBe('true')
    expect(screen.getByLabelText('Tỉnh/Thành phố').getAttribute('aria-required')).toBe('true')
    expect(screen.getByLabelText('Tôi đồng ý').getAttribute('aria-required')).toBe('true')
    expect(screen.getByLabelText('Không bắt buộc').hasAttribute('aria-required')).toBe(false)
  })

  it('explains the * once per form', () => {
    render(<RequiredLegend />)
    expect(screen.getByText(/là thông tin bắt buộc/).textContent).toBe('* là thông tin bắt buộc')
  })
})
