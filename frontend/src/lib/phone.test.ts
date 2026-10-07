import { describe, expect, it } from 'vitest'
import { isValidPhone, normalizePhone } from './phone'

// Same cases as backend PhoneNumbersTest
describe('normalizePhone', () => {
  it.each([
    ['0912345678', '0912345678'],
    ['0912 345 678', '0912345678'],
    ['0912.345.678', '0912345678'],
    ['0912-345-678', '0912345678'],
    ['+84912345678', '0912345678'],
    ['+84 912 345 678', '0912345678'],
    ['84912345678', '0912345678'],
    ['84.912.345.678', '0912345678'],
    [' 0912 345 678 ', '0912345678'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
    expect(isValidPhone(normalizePhone(input))).toBe(true)
  })

  it.each(['912345678', '09123456789', '1912345678', '0912abc678', '+1 555 123 4567', '849123456', '+840912345678'])(
    'rejects %s',
    (input) => {
      expect(isValidPhone(normalizePhone(input))).toBe(false)
    },
  )

  it('keeps numbers that merely start with 084', () => {
    expect(normalizePhone('0849123456')).toBe('0849123456')
  })
})
