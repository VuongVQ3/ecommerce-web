import { describe, expect, it } from 'vitest'
import { fold, foldTerm, matchRange } from './textFold'

describe('textFold', () => {
  it('ignores case and accents, character for character', () => {
    expect(fold('Hạt Điều rang muối')).toBe('hat dieu rang muoi')
    expect(fold('Mắc ca').length).toBe('Mắc ca'.length)
    expect(foldTerm('  HẠT   điều ')).toBe('hat dieu')
  })

  it('finds where the term is in the original text', () => {
    const name = 'Hạt điều A cồ rang muối – hũ PET'
    const [start, end] = matchRange(name, 'hat dieu')!
    expect(name.slice(start, end)).toBe('Hạt điều')
    const r = matchRange(name, 'RANG MUOI')!
    expect(name.slice(r[0], r[1])).toBe('rang muối')
    expect(matchRange(name, 'mắc ca')).toBeNull()
    expect(matchRange(name, '  ')).toBeNull()
  })
})
