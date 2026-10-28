import { describe, expect, it } from 'vitest'
import { fold, foldTerm, matchRange, matchRank } from './textFold'

describe('textFold', () => {
  it('ignores case and accents, character for character', () => {
    expect(fold('Hạt Điều rang muối')).toBe('hat dieu rang muoi')
    expect(fold('Mắc ca').length).toBe('Mắc ca'.length)
    expect(foldTerm('  HẠT   điều ')).toBe('hat dieu')
  })

  it.each([
    ['đ', 'd'],
    ['Đ', 'd'],
    ['ĐỎ', 'do'],
    ['Hạt óc chó đỏ', 'hat oc cho do'],
    ['hat dieu', 'hat dieu'],
    ['HAT DIEU', 'hat dieu'],
    ['  óc \t chó\n ', 'oc cho'],
    ['D', 'd'],
    ['   ', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(foldTerm(input)).toBe(expected)
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

  it('bolds the start of a word rather than an earlier match inside one', () => {
    const name = 'Hạt điều'
    const [start, end] = matchRange(name, 'd')!
    expect(name.slice(start, end)).toBe('đ')
    const other = 'Bánh mì đen'
    const r = matchRange(other, 'en')! // no word starts with "en": the first match
    expect(other.slice(r[0], r[1])).toBe('en')
  })

  it.each([
    ['Hạt điều', 'h', 0],
    ['Hạt điều', 'HAT', 0],
    ['Hạt điều', 'd', 1],
    ['Hạt điều', 'Đ', 1],
    ['Hạt óc chó đỏ', 'oc cho', 1],
    ['Bánh thuyền – mắc ca', 'mac', 1],
    ['Hạt điều', 'ieu', 2],
    ['Hạt điều', 'x', null],
    ['Hạt điều', ' ', null],
  ] as const)('ranks %j for %j as %j', (name, term, rank) => {
    expect(matchRank(name, term)).toBe(rank)
  })
})
