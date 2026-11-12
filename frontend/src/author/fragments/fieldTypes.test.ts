import { describe, expect, it } from 'vitest'
import { fromLocalInput, toLocalInput } from './cfDates'
import { camelName, canBeMultiple, emptyField, FIELD_NAME, rulesFor } from './fieldTypes'

describe('field names and rules', () => {
  it('suggests a camelCase name from a Vietnamese label', () => {
    expect(camelName('Chữ trên nút')).toBe('chuTrenNut')
    expect(camelName('Đường dẫn CTA')).toBe('duongDanCta')
    expect(camelName('  2 dòng  ')).toBe('f2Dong')
    expect(camelName('')).toBe('')
    expect(FIELD_NAME.test(camelName('Câu hỏi thường gặp'))).toBe(true)
  })

  it('keeps only the rules that fit the type', () => {
    const text = { ...emptyField(), type: 'text' as const, rules: { maxLength: 80, options: ['x'], min: 1 } }
    expect(rulesFor(text)).toEqual({ maxLength: 80 })
    expect(rulesFor({ ...text, type: 'enum', rules: {} })).toEqual({ options: [] })
    expect(rulesFor({ ...text, type: 'list', rules: { maxItems: 5 } })).toEqual({ itemType: 'text', maxItems: 5 })
    expect(rulesFor({ ...text, type: 'number', rules: { min: 0, max: 10, maxLength: 3 } })).toEqual({ min: 0, max: 10 })
    expect(rulesFor({ ...text, type: 'asset', rules: { allowedKinds: ['IMAGE'] } })).toEqual({ allowedKinds: ['IMAGE'] })
    expect(canBeMultiple('boolean')).toBe(false)
    expect(canBeMultiple('asset')).toBe(true)
  })

  it('converts datetimes to and from Vietnam time inputs', () => {
    expect(toLocalInput('2026-11-12T03:00:00Z')).toBe('2026-11-12T10:00')
    expect(toLocalInput(null)).toBe('')
    expect(fromLocalInput('2026-11-12T10:00')).toBe('2026-11-12T10:00:00+07:00')
    expect(fromLocalInput('')).toBeNull()
  })
})
