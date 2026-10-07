import { z } from 'zod'
import { isValidPhone, normalizePhone } from '../lib/phone'

// Mirrors the backend rules in AuthDtos.java / docs/auth.md. Keep both sides in sync.

const email = z
  .string()
  .trim()
  .min(1, 'Vui lòng nhập email')
  .max(255, 'Email quá dài')
  .pipe(z.email('Email không hợp lệ'))

const newPassword = z
  .string()
  .min(8, 'Mật khẩu phải từ 8 đến 72 ký tự')
  .max(72, 'Mật khẩu phải từ 8 đến 72 ký tự')
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), 'Mật khẩu phải có cả chữ và số')

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
})

export const PHONE_ERROR = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0'

export const PASSWORD_MISMATCH = 'Mật khẩu nhập lại không khớp'

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Vui lòng nhập họ tên').max(100, 'Họ tên tối đa 100 ký tự'),
    email,
    password: newPassword,
    // Frontend-only check: never sent to the backend
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu'),
    // Optional. Spaces, dots and +84/84 are accepted; normalize with normalizePhone() before sending.
    phone: z
      .string()
      .trim()
      .refine((v) => v === '' || isValidPhone(normalizePhone(v)), PHONE_ERROR),
    marketingConsent: z.boolean(),
    // Honeypot, hidden from humans: accept anything so a bot is not told it was caught
    website: z.string(),
  })
  .refine((v) => v.confirmPassword === '' || v.password === v.confirmPassword, {
    message: PASSWORD_MISMATCH,
    path: ['confirmPassword'],
    // Run even while other fields (e.g. email) are still invalid, as long as both passwords are strings
    when: (payload) => {
      const v = payload.value as { password?: unknown; confirmPassword?: unknown }
      return typeof v.password === 'string' && typeof v.confirmPassword === 'string'
    },
  })

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z.object({ newPassword })

export type LoginForm = z.infer<typeof loginSchema>
export type RegisterForm = z.infer<typeof registerSchema>
