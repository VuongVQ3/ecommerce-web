// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { api, type User } from '../lib/api'
import { ChangePasswordPage } from './PasswordPages'

const auth = vi.hoisted(() => ({ user: null as User | null, signedIn: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

const user = (hasPassword: boolean): User => ({
  id: 'u1',
  email: 'mai@gmail.com',
  fullName: 'Trần Thị Mai',
  phone: null,
  role: 'CUSTOMER',
  emailVerified: true,
  passwordChangeRequired: false,
  hasPassword,
})

function renderPage() {
  render(
    <ToastProvider>
      <MemoryRouter>
        <ChangePasswordPage />
      </MemoryRouter>
    </ToastProvider>,
  )
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true, selector: 'input' }), { target: { value } })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ChangePasswordPage', () => {
  it('asks for the current password when the account has one', () => {
    auth.user = user(true)
    renderPage()

    expect(screen.getByRole('heading', { name: 'Đổi mật khẩu' })).toBeTruthy()
    expect(screen.getByLabelText('Mật khẩu hiện tại', { exact: true, selector: 'input' })).toBeTruthy()
  })

  it('sets a first password for a Google-only account, without asking for a current one', async () => {
    auth.user = user(false)
    const change = vi.spyOn(api, 'changePassword').mockResolvedValue(user(true))
    renderPage()

    expect(screen.getByRole('heading', { name: 'Đặt mật khẩu' })).toBeTruthy()
    expect(screen.queryByLabelText('Mật khẩu hiện tại', { exact: true, selector: 'input' })).toBeNull()
    type('Mật khẩu mới', 'matkhau123')
    type('Nhập lại mật khẩu mới', 'matkhau123')
    fireEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu' }))

    await waitFor(() => expect(change).toHaveBeenCalledWith('', 'matkhau123'))
    expect(await screen.findByText('Đã đặt mật khẩu. Từ giờ bạn có thể đăng nhập bằng email và mật khẩu.')).toBeTruthy()
  })
})
