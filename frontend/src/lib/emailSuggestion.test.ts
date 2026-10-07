import { describe, expect, it } from 'vitest'
import { suggestEmail } from './emailSuggestion'

describe('suggestEmail', () => {
  it.each([
    ['an@gmial.com', 'an@gmail.com'],
    ['an@gmai.com', 'an@gmail.com'],
    ['an@gmail.con', 'an@gmail.com'],
    ['an@gmail.co', 'an@gmail.com'],
    ['an@gnail.com', 'an@gmail.com'],
    ['an@yaho.com', 'an@yahoo.com'],
    ['an@hotmal.com', 'an@hotmail.com'],
    ['an@hotmial.com', 'an@hotmail.com'],
    ['an@outlok.com', 'an@outlook.com'],
    ['an@yahoo.com.vm', 'an@yahoo.com.vn'],
    ['Nguyen.An@GMIAL.COM', 'Nguyen.An@gmail.com'],
  ])('%s -> %s', (input, expected) => {
    expect(suggestEmail(input)).toBe(expected)
  })

  it.each([
    'an@gmail.com',
    'an@yahoo.com.vn',
    'an@mail.com',
    'an@ymail.com',
    'an@fpt.com.vn',
    'an@congty-abc.vn',
    'an@',
    'an',
    '@gmail.com',
    '',
  ])('no suggestion for %s', (input) => {
    expect(suggestEmail(input)).toBeNull()
  })
})
