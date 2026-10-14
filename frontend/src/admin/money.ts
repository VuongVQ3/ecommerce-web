/** Digit handling behind MoneyInput (thousands separators with "." as in Vietnamese). */

const MAX_DIGITS = 12

/** "189000" → "189.000" */
export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Only the digits, without leading zeros ("1.890.000" → "1890000", "00" → "0"). */
export function onlyDigits(text: string): string {
  return text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS)
}

/** Position in `formatted` right after the `digitsBefore`-th digit. */
export function caretAfterDigits(formatted: string, digitsBefore: number): number {
  if (digitsBefore <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) seen++
    if (seen === digitsBefore) return i + 1
  }
  return formatted.length
}
