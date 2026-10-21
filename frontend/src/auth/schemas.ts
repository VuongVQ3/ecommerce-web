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

export const NAME_ERROR = 'Họ tên không hợp lệ'

/**
 * Same rule as the backend's @PersonName: after trimming 2–60 characters, letters (with accents), spaces, apostrophes,
 * dots and hyphens only, at least one letter.
 */
export const isPersonName = (value: string) => {
  const name = value.trim()
  const length = [...name].length
  return length >= 2 && length <= 60 && /^[\p{L}\p{M} .'’-]+$/u.test(name) && /\p{L}/u.test(name)
}

const personName = z.string().trim().min(1, 'Vui lòng nhập họ tên').refine(isPersonName, NAME_ERROR)

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
})

export const PHONE_ERROR = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0'

export const PASSWORD_MISMATCH = 'Mật khẩu nhập lại không khớp'

export const registerSchema = z
  .object({
    fullName: personName,
    email,
    password: newPassword,
    // Frontend-only check: never sent to the backend
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu'),
    // Optional. Spaces, dots and +84/84 are accepted; normalize with normalizePhone() before sending.
    phone: z
      .string()
      .trim()
      .refine((v) => v === '' || isValidPhone(normalizePhone(v)), PHONE_ERROR),
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

// Checkout: same rules as OrderDtos.PlaceOrderRequest. Province/ward are select values (codes as strings).
export const checkoutSchema = z.object({
  customerName: personName,
  phone: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập số điện thoại')
    .refine((v) => isValidPhone(normalizePhone(v)), PHONE_ERROR),
  email: z
    .string()
    .trim()
    .max(255, 'Email quá dài')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Email không hợp lệ'),
  provinceCode: z.string().min(1, 'Vui lòng chọn tỉnh/thành phố'),
  wardCode: z.string().min(1, 'Vui lòng chọn phường/xã'),
  addressLine: z.string().trim().min(1, 'Vui lòng nhập địa chỉ chi tiết').max(255, 'Địa chỉ tối đa 255 ký tự'),
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự'),
})

export const orderLookupSchema = z.object({
  code: z.string().trim().min(1, 'Vui lòng nhập mã đơn hàng'),
  phone: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập số điện thoại')
    .refine((v) => isValidPhone(normalizePhone(v)), PHONE_ERROR),
})

export const resetPasswordSchema = z.object({ newPassword })

/**
 * "Lưu đơn hàng vào tài khoản": name, phone (and usually email) come from the order. The name is asked only when the
 * one on the order is not a valid name (orders placed before names were checked).
 */
export function claimAccountSchema(needsEmail: boolean, needsName = false) {
  return z
    .object({
      email: needsEmail ? email : z.string(),
      fullName: needsName ? personName : z.string(),
      password: newPassword,
      confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu'),
    })
    .refine((v) => v.confirmPassword === '' || v.password === v.confirmPassword, {
      message: PASSWORD_MISMATCH,
      path: ['confirmPassword'],
      when: (payload) => {
        const v = payload.value as { password?: unknown; confirmPassword?: unknown }
        return typeof v.password === 'string' && typeof v.confirmPassword === 'string'
      },
    })
}

export type ClaimAccountForm = z.infer<ReturnType<typeof claimAccountSchema>>

export type LoginForm = z.infer<typeof loginSchema>
export type RegisterForm = z.infer<typeof registerSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string(),
    newPassword,
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu'),
  })
  .refine((v) => v.confirmPassword === '' || v.newPassword === v.confirmPassword, {
    message: PASSWORD_MISMATCH,
    path: ['confirmPassword'],
  })

export type ChangePasswordForm = z.infer<typeof changePasswordSchema>

export const acceptInviteSchema = z
  .object({ newPassword, confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu') })
  .refine((v) => v.confirmPassword === '' || v.newPassword === v.confirmPassword, {
    message: PASSWORD_MISMATCH,
    path: ['confirmPassword'],
  })
