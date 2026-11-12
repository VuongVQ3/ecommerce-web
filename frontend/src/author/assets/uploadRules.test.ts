import { describe, expect, it } from 'vitest'
import { dimensions, formatBytes, missingAlt } from './assetFormat'
import { fakeFile } from './damFixtures'
import { acceptFor, fileKind, MAX_FILE_BYTES, uploadProblem } from './uploadRules'

describe('upload rules (checked in the browser before sending)', () => {
  it('knows images and PDFs by name and type, which must agree', () => {
    expect(fileKind(fakeFile('a.JPG', 'image/jpeg'))).toBe('IMAGE')
    expect(fileKind(fakeFile('a.webp', ''))).toBe('IMAGE')
    expect(fileKind(fakeFile('Bảng giá.pdf', 'application/pdf'))).toBe('PDF')
    expect(fileKind(fakeFile('bang-gia.jpg', 'application/pdf'))).toBeNull()
    expect(fileKind(fakeFile('virus.exe', 'application/x-msdownload'))).toBeNull()
    expect(fileKind(fakeFile('anh.gif', 'image/gif'))).toBeNull()
  })

  it('refuses the wrong type, the wrong kind, empty files and files over 10MB', () => {
    expect(uploadProblem(fakeFile('a.jpg', 'image/jpeg'))).toBeNull()
    expect(uploadProblem(fakeFile('a.jpg', 'image/jpeg', MAX_FILE_BYTES))).toBeNull()
    expect(uploadProblem(fakeFile('a.jpg', 'image/jpeg', MAX_FILE_BYTES + 1))).toBe('File lớn hơn 10MB')
    expect(uploadProblem(fakeFile('a.jpg', 'image/jpeg', 0))).toBe('File rỗng')
    expect(uploadProblem(fakeFile('a.docx', ''))).toBe('Chỉ nhận ảnh JPEG, PNG, WebP hoặc file PDF')
    expect(uploadProblem(fakeFile('a.pdf', 'application/pdf'), 'IMAGE')).toBe('Cần chọn ảnh (JPEG, PNG hoặc WebP)')
    expect(uploadProblem(fakeFile('a.png', 'image/png'), 'PDF')).toBe('Cần chọn file PDF')
  })

  it('accept lists follow the kind', () => {
    expect(acceptFor('PDF')).toBe('application/pdf,.pdf')
    expect(acceptFor('IMAGE')).toContain('.webp')
    expect(acceptFor('IMAGE')).not.toContain('pdf')
  })

  it('formats sizes and dimensions', () => {
    expect(formatBytes(820)).toBe('820 B')
    expect(formatBytes(512 * 1024)).toBe('512 KB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1,5 MB')
    expect(dimensions({ kind: 'IMAGE', width: 1200, height: 800, pageCount: null })).toBe('1200 × 800')
    expect(dimensions({ kind: 'PDF', width: null, height: null, pageCount: 3 })).toBe('3 trang')
    expect(missingAlt({ kind: 'IMAGE', alt: '  ' })).toBe(true)
    expect(missingAlt({ kind: 'PDF', alt: null })).toBe(false)
  })
})
