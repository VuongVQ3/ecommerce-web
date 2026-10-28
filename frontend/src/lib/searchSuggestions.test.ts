import { describe, expect, it } from 'vitest'
import { MAX_SUGGESTIONS, rankSuggestions } from './searchSuggestions'

const names = (list: { name: string }[]) => list.map((p) => p.name)
const of = (...all: string[]) => all.map((name) => ({ name }))

describe('rankSuggestions', () => {
  it('starts-with first, then a word starting with it, then anywhere; each group keeps the given order', () => {
    const list = of('Bánh hạt điều', 'Kẹo đậu phộng', 'Điều rang muối', 'Mứt dừa', 'Đậu đỏ', 'Hạt điều')
    // "d": "Điều…", "Đậu đỏ" start with it; "Bánh hạt điều", "Kẹo đậu…", "Mứt dừa", "Hạt điều" have a word that does
    expect(names(rankSuggestions(list, 'd'))).toEqual([
      'Điều rang muối',
      'Đậu đỏ',
      'Bánh hạt điều',
      'Kẹo đậu phộng',
      'Mứt dừa',
      'Hạt điều',
    ])
    expect(names(rankSuggestions(of('Mắc ca', 'Hạt mắc ca', 'Hạt điều'), 'ca'))).toEqual(['Mắc ca', 'Hạt mắc ca'])
    expect(names(rankSuggestions(of('Ngũ cốc', 'Bánh cốm', 'Cốm'), 'om'))).toEqual(['Bánh cốm', 'Cốm'])
  })

  it('ignores accents, case and extra spaces, "đ" included', () => {
    const list = of('Hạt điều', 'Hạt óc chó đỏ', 'Mắc ca')
    expect(names(rankSuggestions(list, 'd'))).toEqual(['Hạt điều', 'Hạt óc chó đỏ'])
    expect(names(rankSuggestions(list, 'đ'))).toEqual(['Hạt điều', 'Hạt óc chó đỏ'])
    expect(names(rankSuggestions(list, 'oc cho'))).toEqual(['Hạt óc chó đỏ'])
    expect(names(rankSuggestions(list, '  ÓC   CHÓ '))).toEqual(['Hạt óc chó đỏ'])
    expect(names(rankSuggestions(list, 'HAT DIEU'))).toEqual(['Hạt điều'])
    expect(names(rankSuggestions(list, 'm'))).toEqual(['Mắc ca'])
  })

  it('suggests from one character, nothing for a blank term or no match', () => {
    const list = of('Hạt điều', 'Mắc ca')
    expect(names(rankSuggestions(list, 'h'))).toEqual(['Hạt điều'])
    expect(rankSuggestions(list, '')).toEqual([])
    expect(rankSuggestions(list, '   ')).toEqual([])
    expect(rankSuggestions(list, 'xyz')).toEqual([])
  })

  it(`stops at ${MAX_SUGGESTIONS}`, () => {
    const list = of(...Array.from({ length: 10 }, (_, i) => `Hạt ${i}`))
    expect(names(rankSuggestions(list, 'hat'))).toEqual(['Hạt 0', 'Hạt 1', 'Hạt 2', 'Hạt 3', 'Hạt 4', 'Hạt 5'])
    expect(rankSuggestions(list, 'hat', 3)).toHaveLength(3)
  })
})
