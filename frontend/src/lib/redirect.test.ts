import { describe, expect, it } from 'vitest'
import { loginUrl, safeNextPath } from './redirect'

const ORIGIN = 'https://hatlanh.vn'

describe('safeNextPath', () => {
  it.each([
    ['/tai-khoan/don-hang', '/tai-khoan/don-hang'],
    ['/san-pham?category=hat-chia&page=2', '/san-pham?category=hat-chia&page=2'],
    ['/admin#top', '/admin#top'],
  ])('keeps internal path %s', (raw, expected) => {
    expect(safeNextPath(raw, ORIGIN)).toBe(expected)
  })

  it.each([
    null,
    '',
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    'javascript:alert(1)',
    'evil.com/path',
    '/dang-nhap',
    '/dang-ky?next=/admin',
  ])('falls back to home for %s', (raw) => {
    expect(safeNextPath(raw, ORIGIN)).toBe('/')
  })
})

describe('loginUrl', () => {
  it('encodes the return path', () => {
    expect(loginUrl('/tai-khoan?tab=1')).toBe('/dang-nhap?next=%2Ftai-khoan%3Ftab%3D1')
    expect(loginUrl('/')).toBe('/dang-nhap')
  })
})
