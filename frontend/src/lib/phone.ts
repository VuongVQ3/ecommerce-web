// Vietnamese phone numbers, same rules as backend PhoneNumbers.java.

const SEPARATORS = /[\s .-]/g

/**
 * Accepts what people actually type ("0912 345 678", "0912.345.678", "+84 912 345 678", "84912345678") and returns
 * the canonical form 0xxxxxxxxx. The result is not guaranteed valid; check it with isValidPhone.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(SEPARATORS, '')
  if (digits.startsWith('+84')) return `0${digits.slice(3)}`
  // Without "+", only treat 84 as a country code when the rest is a 9-digit subscriber number
  if (digits.startsWith('84') && digits.length === 11) return `0${digits.slice(2)}`
  return digits
}

export function isValidPhone(normalized: string): boolean {
  return /^0\d{9}$/.test(normalized)
}
