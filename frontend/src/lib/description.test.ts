import { describe, expect, it } from 'vitest'
import { parseDescription } from './description'

const LONG_DESCRIPTION = `Hạt Mắc Ca Đăk Lăk Nguyên Vỏ Size Đại (26-28mm) - Hộp 500g
Hạt mắc ca nguyên vỏ nứt chuẩn gốc Đăk Lăk...
Mỗi sản phẩm đều được tặng kèm dụng cụ tách hạt tiện dụng.

Thông tin chi tiết:
Xuất xứ: Đăk Lăk, Việt Nam. Kích cỡ: Size đại 26 - 28mm (Đường kính hạt).
Khối lượng tịnh: 500g.

Hướng dẫn sử dụng:
Dùng dụng cụ (miếng thép) lách vào khe nứt...

Bảo quản:
Đậy kín miệng bao bì sau mỗi lần sử dụng...`

describe('parseDescription', () => {
  it('splits on blank lines, first line of each section as its heading without the colon', () => {
    const sections = parseDescription(LONG_DESCRIPTION)
    expect(sections.map((s) => s.title)).toEqual([
      'Hạt Mắc Ca Đăk Lăk Nguyên Vỏ Size Đại (26-28mm) - Hộp 500g',
      'Thông tin chi tiết',
      'Hướng dẫn sử dụng',
      'Bảo quản',
    ])
    expect(sections[1].lines).toEqual([
      'Xuất xứ: Đăk Lăk, Việt Nam. Kích cỡ: Size đại 26 - 28mm (Đường kính hạt).',
      'Khối lượng tịnh: 500g.',
    ])
    expect(sections[3].lines).toEqual(['Đậy kín miệng bao bì sau mỗi lần sử dụng...'])
  })

  it('handles \\r\\n, stray spaces and several blank lines in a row', () => {
    const text = '  Bảo quản :  \r\n  Nơi   khô ráo. \r\n\r\n \t \r\n\r\nGiao hàng:\rToàn quốc\r\n\r\n'
    expect(parseDescription(text)).toEqual([
      { title: 'Bảo quản', lines: ['Nơi khô ráo.'] },
      { title: 'Giao hàng', lines: ['Toàn quốc'] },
    ])
  })

  it('shows a one-line section as a plain paragraph', () => {
    expect(parseDescription('Thơm, giòn, béo.\n\nCông dụng:\nGiàu chất xơ.')).toEqual([
      { lines: ['Thơm, giòn, béo.'] },
      { title: 'Công dụng', lines: ['Giàu chất xơ.'] },
    ])
  })

  it('keeps text without a blank line as one paragraph, as before', () => {
    expect(parseDescription('Mắc ca nguyên vỏ, hạt to, chắc.')).toEqual([{ lines: ['Mắc ca nguyên vỏ, hạt to, chắc.'] }])
    expect(parseDescription('Thông tin:\r\nHạt to.\nGiòn.')).toEqual([{ lines: ['Thông tin: Hạt to. Giòn.'] }])
  })

  it('drops a heading that is only a colon, and returns nothing for empty text', () => {
    expect(parseDescription('A\n\n:\nB')).toEqual([{ lines: ['A'] }, { lines: ['B'] }])
    expect(parseDescription('')).toEqual([])
    expect(parseDescription(' \n\r\n ')).toEqual([])
    expect(parseDescription(null)).toEqual([])
  })

  it('keeps markup as plain text', () => {
    expect(parseDescription('<b>x</b>\n\n**Tiêu đề**:\n<img src=x onerror=alert(1)>')).toEqual([
      { lines: ['<b>x</b>'] },
      { title: '**Tiêu đề**', lines: ['<img src=x onerror=alert(1)>'] },
    ])
  })
})
