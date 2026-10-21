// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '../components/Toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type RegisterInput } from '../lib/api'
import { RegisterPage } from './RegisterPage'

const register = vi.hoisted(() => vi.fn<(input: RegisterInput) => Promise<void>>())
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, register, loginWithGoogle: vi.fn() }),
}))
// The real widget loads Cloudflare's script; here it reports the status a test picks (a token by default)
const turnstileStatus = vi.hoisted(() => ({ current: 'ready' as 'pending' | 'ready' | 'error' }))
vi.mock('../auth/Turnstile', async () => {
  const { useEffect, useImperativeHandle } = await import('react')
  function TurnstileStub({
    ref,
    onStatusChange,
  }: {
    ref: React.Ref<{ getToken(): Promise<string>; reset(): void }>
    onStatusChange?: (status: 'pending' | 'ready' | 'error') => void
  }) {
    useImperativeHandle(ref, () => ({ getToken: async () => 'turnstile-token', reset: () => {} }))
    useEffect(() => onStatusChange?.(turnstileStatus.current), [onStatusChange])
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
  turnstileStatus.current = 'ready'
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
      <ToastProvider>
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      </ToastProvider>,
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
      <ToastProvider>
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      </ToastProvider>,
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

  it('keeps "Đăng ký" disabled until the anti-bot check has a token', async () => {
    turnstileStatus.current = 'pending'
    render(
      <ToastProvider>
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      </ToastProvider>,
    )
    fill('Họ và tên', 'Nguyễn An')
    fill('Email', 'an@example.com')
    fill('Mật khẩu', 'matkhau123')
    fill('Nhập lại mật khẩu', 'matkhau123')

    const submit = screen.getByRole('button', { name: 'Đăng ký' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.submit(submit.form!)
    await new Promise((r) => setTimeout(r, 50))
    expect(register).not.toHaveBeenCalled()
  })
})
