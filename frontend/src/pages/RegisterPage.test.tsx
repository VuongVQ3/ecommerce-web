// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type RegisterInput } from '../lib/api'
import { RegisterPage } from './RegisterPage'

const register = vi.hoisted(() => vi.fn<(input: RegisterInput) => Promise<void>>())
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, register, loginWithGoogle: vi.fn() }),
}))
// The real widget loads Cloudflare's script; here it hands out a token immediately
vi.mock('../auth/Turnstile', async () => {
  const { useImperativeHandle } = await import('react')
  function TurnstileStub({ ref }: { ref: React.Ref<{ getToken(): Promise<string>; reset(): void }> }) {
    useImperativeHandle(ref, () => ({ getToken: async () => 'turnstile-token', reset: () => {} }))
    return null
  }
  return { default: TurnstileStub }
})

const fill = (label: string, value: string) => {
  const input = screen.getByLabelText(label, { exact: true, selector: 'input' })
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

beforeEach(() => {
  register.mockReset().mockResolvedValue()
  vi.spyOn(api, 'authProviders').mockResolvedValue({ googleClientId: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('RegisterPage', () => {
  it('never sends confirmPassword to the backend', async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )
    fill('Họ và tên', 'Nguyễn An')
    fill('Email', 'an@example.com')
    fill('Mật khẩu', 'matkhau123')
    fill('Nhập lại mật khẩu', 'matkhau123')
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }))

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1))
    const payload = register.mock.calls[0][0]
    expect(payload).not.toHaveProperty('confirmPassword')
    expect(payload).toMatchObject({ email: 'an@example.com', password: 'matkhau123', acceptTerms: true })
  })

  it('shows the mismatch under the confirmation and blocks submit', async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )
    fill('Họ và tên', 'Nguyễn An')
    fill('Email', 'an@example.com')
    fill('Mật khẩu', 'matkhau123')
    fill('Nhập lại mật khẩu', 'matkhau124')

    expect(await screen.findByText('Mật khẩu nhập lại không khớp')).toBeTruthy()
    const confirm = screen.getByLabelText('Nhập lại mật khẩu', { selector: 'input' })
    expect(confirm.getAttribute('aria-invalid')).toBe('true')

    // Fixing the password (not the confirmation) clears the error, because the confirmation was touched
    fill('Mật khẩu', 'matkhau124')
    await waitFor(() => expect(screen.queryByText('Mật khẩu nhập lại không khớp')).toBeNull())
    expect(await screen.findByText('Mật khẩu đã khớp')).toBeTruthy()
  })
})
