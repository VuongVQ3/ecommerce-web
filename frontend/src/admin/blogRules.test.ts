import { describe, expect, it } from 'vitest'
import { excerptHint, healthClaims, imageFileProblem, publishProblems } from './blogRules'
import { imageMarkdown, insertBlock, prefixLines, wrapSelection } from './markdownEdit'

describe('publishProblems', () => {
  it('needs an excerpt and a cover with alt text', () => {
    expect(publishProblems({ excerpt: ' ', coverImageUrl: null, coverImageAlt: '' })).toEqual([
      'Chưa có tóm tắt (dùng làm mô tả trên Google và trên thẻ bài).',
      'Chưa có ảnh bìa.',
    ])
    expect(publishProblems({ excerpt: 'Tóm tắt', coverImageUrl: 'https://x/a.jpg', coverImageAlt: '  ' })).toEqual([
      'Ảnh bìa chưa có mô tả (alt).',
    ])
    expect(publishProblems({ excerpt: 'Tóm tắt', coverImageUrl: 'https://x/a.jpg', coverImageAlt: 'Hũ hạt' })).toEqual([])
  })
})

describe('healthClaims', () => {
  it('finds claim words as whole words in any case, each once', () => {
    expect(healthClaims('Hạt óc chó CHỮA mất ngủ, đặc trị tiểu đường. Chữa lành!')).toEqual(['chữa', 'đặc trị'])
    expect(healthClaims('Giảm cân cấp tốc, có thể thay thế thuốc và trị bệnh')).toEqual(['trị bệnh', 'giảm cân cấp tốc', 'thay thế thuốc'])
    expect(healthClaims('Ăn hạt mỗi ngày giúp bữa sáng đủ chất')).toEqual([])
  })
})

describe('excerptHint and image checks', () => {
  it('counts characters against the ideal length', () => {
    expect(excerptHint(112)).toBe('112/300 ký tự · nên 120–155')
  })

  it('accepts JPEG, PNG and WebP up to 5MB', () => {
    expect(imageFileProblem(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBeNull()
    expect(imageFileProblem(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe('Chỉ nhận ảnh JPEG, PNG hoặc WebP.')
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' })
    expect(imageFileProblem(big)).toBe('Ảnh tối đa 5MB.')
  })
})

describe('markdown edits', () => {
  it('wraps the selection, or selects a placeholder', () => {
    expect(wrapSelection('ăn hạt', 3, 6, '**', '**', 'đậm')).toEqual({ text: 'ăn **hạt**', selectionStart: 5, selectionEnd: 8 })
    expect(wrapSelection('ăn ', 3, 3, '_', '_', 'nghiêng')).toEqual({ text: 'ăn _nghiêng_', selectionStart: 4, selectionEnd: 11 })
  })

  it('prefixes every touched line, toggles it off, and replaces another heading level', () => {
    expect(prefixLines('a\nb\nc', 0, 3, '- ').text).toBe('- a\n- b\nc')
    expect(prefixLines('- a\n- b', 0, 7, '- ').text).toBe('a\nb')
    expect(prefixLines('### Tiêu đề', 2, 2, '## ').text).toBe('## Tiêu đề')
  })

  it('inserts a block on its own paragraph at the cursor', () => {
    expect(insertBlock('Đoạn một.Đoạn hai.', 9, 9, 'IMG').text).toBe('Đoạn một.\n\nIMG\n\nĐoạn hai.')
    expect(insertBlock('Đoạn một.\n\nĐoạn hai.', 11, 11, 'IMG').text).toBe('Đoạn một.\n\nIMG\n\nĐoạn hai.')
    const end = insertBlock('Cuối.', 5, 5, 'IMG')
    expect(end.text).toBe('Cuối.\n\nIMG\n')
    expect(end.selectionStart).toBe(end.text.length)
  })

  it('escapes what would end the alt text or the caption', () => {
    expect(imageMarkdown('https://x/a.jpg', 'Hạt [to]', 'Chú "thích"')).toBe('![Hạt \\[to\\]](https://x/a.jpg "Chú \\"thích\\"")')
    expect(imageMarkdown('https://x/a.jpg', 'Hạt', '')).toBe('![Hạt](https://x/a.jpg)')
  })
})
