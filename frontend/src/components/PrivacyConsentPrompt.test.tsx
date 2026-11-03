// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../lib/api'
import PrivacyConsentPrompt from './PrivacyConsentPrompt'

const auth = vi.hoisted(() => ({
  user: null as User | null,
  acceptPrivacyPolicy: vi.fn<() => Promise<void>>(),
  logout: vi.fn<() => Promise<void>>(),
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

const user = (privacyConsentRequired: boolean): User => ({
  id: 'u1',
  email: 'an@example.com',
  fullName: 'Nguyễn An',
  phone: null,
  role: 'CUSTOMER',
  emailVerified: true,
  passwordChangeRequired: false,
  hasPassword: true,
  privacyConsentRequired,
})

const box = () => screen.getByRole('checkbox', { name: /Tôi đồng ý với Chính sách bảo mật/ }) as HTMLInputElement

// jsdom has no <dialog> behaviour: opening it is enough here (same as CancelOrderDialog.test)
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  auth.acceptPrivacyPolicy.mockReset().mockResolvedValue()
  auth.logout.mockReset().mockResolvedValue()
})
afterEach(cleanup)

describe('PrivacyConsentPrompt', () => {
  it('is not shown to guests (checkout stays open) nor to accounts that already consented', () => {
    auth.user = null
    const { container, rerender } = render(<PrivacyConsentPrompt />)
    expect(container.textContent).toBe('')
    auth.user = user(false)
    rerender(<PrivacyConsentPrompt />)
    expect(container.textContent).toBe('')
  })

  it('asks an existing account once: the unticked box must be ticked before accepting', async () => {
    auth.user = user(true)
    render(<PrivacyConsentPrompt />)
    expect(screen.getByRole('heading', { name: 'Cập nhật Chính sách bảo mật' })).toBeTruthy()
    expect(box().checked).toBe(false)
    expect(screen.getByRole('link', { name: /Chính sách bảo mật/ }).getAttribute('href')).toBe('/dieu-khoan-giao-dich#bao-mat')

    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý và tiếp tục' }))
    expect(await screen.findByText('Bạn cần đồng ý với Chính sách bảo mật')).toBeTruthy()
    expect(auth.acceptPrivacyPolicy).not.toHaveBeenCalled()

    fireEvent.click(box())
    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý và tiếp tục' }))
    await waitFor(() => expect(auth.acceptPrivacyPolicy).toHaveBeenCalledOnce())
  })

  it('lets the person sign out instead', () => {
    auth.user = user(true)
    render(<PrivacyConsentPrompt />)
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(auth.logout).toHaveBeenCalledOnce()
  })
})
