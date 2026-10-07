import { describe, expect, it } from 'vitest'
import { PASSWORD_MISMATCH, registerSchema } from './schemas'

const valid = {
  fullName: 'Nguyễn Văn An',
  email: 'an@example.com',
  password: 'matkhau123',
  confirmPassword: 'matkhau123',
  phone: '',
  marketingConsent: false,
  website: '',
}

const firstError = (input: Partial<typeof valid>, field: keyof typeof valid) =>
  registerSchema.safeParse({ ...valid, ...input }).error?.issues.find((i) => i.path[0] === field)?.message

// Same rules and messages as the backend (AuthDtos.java)
describe('registerSchema', () => {
  it('accepts a valid form, with or without phone', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true)
    expect(registerSchema.safeParse({ ...valid, phone: '0912345678' }).success).toBe(true)
  })

  it('requires letters and digits in the password, Vietnamese letters included', () => {
    expect(firstError({ password: '12345678' }, 'password')).toBe('Mật khẩu phải có cả chữ và số')
    expect(firstError({ password: 'chiconchu' }, 'password')).toBe('Mật khẩu phải có cả chữ và số')
    expect(firstError({ password: 'ngắn1' }, 'password')).toBe('Mật khẩu phải từ 8 đến 72 ký tự')
    expect(firstError({ password: 'đườngđi12' }, 'password')).toBeUndefined()
  })

  it('accepts phone numbers with spaces, dots and +84', () => {
    for (const phone of ['0912 345 678', '0912.345.678', '+84 912 345 678', '84912345678']) {
      expect(firstError({ phone }, 'phone')).toBeUndefined()
    }
  })

  it('validates Vietnamese phone numbers', () => {
    expect(firstError({ phone: '912345678' }, 'phone')).toBe('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0')
    expect(firstError({ phone: '09123456789' }, 'phone')).toBe('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0')
    expect(firstError({ phone: '1912345678' }, 'phone')).toBe('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0')
  })

  it('requires the confirmation to match, with the error on confirmPassword', () => {
    expect(firstError({ confirmPassword: 'matkhau123' }, 'confirmPassword')).toBeUndefined()
    expect(firstError({ confirmPassword: 'matkhau124' }, 'confirmPassword')).toBe(PASSWORD_MISMATCH)
    expect(firstError({ confirmPassword: '' }, 'confirmPassword')).toBe('Vui lòng nhập lại mật khẩu')
    // The mismatch is reported only on confirmPassword, never on password
    expect(firstError({ confirmPassword: 'khac123' }, 'password')).toBeUndefined()
  })

  it('reports the mismatch even while other fields are still invalid', () => {
    expect(firstError({ email: '', fullName: '', confirmPassword: 'khac123' }, 'confirmPassword')).toBe(PASSWORD_MISMATCH)
  })

  it('error appears and disappears when the password changes after the confirmation was typed', () => {
    const confirmed = { confirmPassword: 'matkhau123' }
    expect(firstError({ ...confirmed, password: 'matkhau123' }, 'confirmPassword')).toBeUndefined()
    expect(firstError({ ...confirmed, password: 'matkhau1234' }, 'confirmPassword')).toBe(PASSWORD_MISMATCH)
    expect(firstError({ ...confirmed, password: 'matkhau123' }, 'confirmPassword')).toBeUndefined()
  })

  it('validates email and name', () => {
    expect(firstError({ email: '' }, 'email')).toBe('Vui lòng nhập email')
    expect(firstError({ email: 'khong-phai-email' }, 'email')).toBe('Email không hợp lệ')
    expect(firstError({ fullName: '   ' }, 'fullName')).toBe('Vui lòng nhập họ tên')
  })
})
