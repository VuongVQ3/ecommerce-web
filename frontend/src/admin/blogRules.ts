/**
 * Checks of the blog editor. Publishing needs an excerpt and a cover with alt text (the server refuses otherwise,
 * see AdminBlogService.requireReady); health claims only raise a warning.
 */
export const EXCERPT_MAX = 300
/** Search results show about this much of a description */
export const EXCERPT_IDEAL = { min: 120, max: 155 }

export interface PublishCheck {
  excerpt: string
  coverImageUrl: string | null
  coverImageAlt: string
}

/** What is missing before a post can be published, in Vietnamese; empty when it can be. */
export function publishProblems(post: PublishCheck): string[] {
  const problems: string[] = []
  if (!post.excerpt.trim()) problems.push('Chưa có tóm tắt (dùng làm mô tả trên Google và trên thẻ bài).')
  if (!post.coverImageUrl) problems.push('Chưa có ảnh bìa.')
  else if (!post.coverImageAlt.trim()) problems.push('Ảnh bìa chưa có mô tả (alt).')
  return problems
}

/**
 * Food may not be advertised as treating or curing illness: words that usually mean such a claim. Whole words only, any case ("Chữa" matches, "chữa" inside another word does not).
 */
export const HEALTH_CLAIM_WORDS = ['chữa', 'trị bệnh', 'đặc trị', 'giảm cân cấp tốc', 'thay thế thuốc']

/** The claim words found in the text, in list order, each once. */
export function healthClaims(text: string): string[] {
  const lower = text.normalize('NFC').toLocaleLowerCase('vi')
  return HEALTH_CLAIM_WORDS.filter((word) => new RegExp(`(^|[^\\p{L}\\p{N}])${word}(?=$|[^\\p{L}\\p{N}])`, 'u').test(lower))
}

/** "112/300 ký tự · nên 120–155" */
export function excerptHint(length: number): string {
  const ideal = `nên ${EXCERPT_IDEAL.min}–${EXCERPT_IDEAL.max}`
  return `${length}/${EXCERPT_MAX} ký tự · ${ideal}`
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** Same limits as the server (type, 5MB): "Chỉ nhận ảnh JPEG, PNG hoặc WebP." / "Ảnh tối đa 5MB."; null when fine. */
export function imageFileProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.'
  if (file.size > IMAGE_MAX_BYTES) return 'Ảnh tối đa 5MB.'
  return null
}
