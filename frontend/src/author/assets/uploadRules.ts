import type { AssetKind } from './damApi'

/** Same limit as the server: 10MB per file, one file per request. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024

const TYPES: { kind: AssetKind; mime: string; extensions: string[] }[] = [
  { kind: 'IMAGE', mime: 'image/jpeg', extensions: ['jpg', 'jpeg', 'jfif'] },
  { kind: 'IMAGE', mime: 'image/png', extensions: ['png'] },
  { kind: 'IMAGE', mime: 'image/webp', extensions: ['webp'] },
  { kind: 'PDF', mime: 'application/pdf', extensions: ['pdf'] },
]

/** For <input type="file" accept>, by kind. */
export function acceptFor(kind: AssetKind | 'ANY' = 'ANY'): string {
  return TYPES.filter((t) => kind === 'ANY' || t.kind === kind)
    .flatMap((t) => [t.mime, ...t.extensions.map((e) => `.${e}`)])
    .join(',')
}

const extension = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** Image or PDF by name and browser type (they must agree); null for anything else. The server checks the content. */
export function fileKind(file: File): AssetKind | null {
  const ext = extension(file.name)
  const byExt = TYPES.find((t) => t.extensions.includes(ext))
  const byMime = TYPES.find((t) => t.mime === file.type)
  if (byExt && byMime && byExt.mime !== byMime.mime) return null
  return (byExt ?? (ext ? null : byMime))?.kind ?? null
}

/**
 * Why the file cannot be uploaded, or null when it may be sent: checked in the browser first, so nothing too large
 * or of the wrong type is ever sent.
 */
export function uploadProblem(file: File, kind: AssetKind | 'ANY' = 'ANY'): string | null {
  const actual = fileKind(file)
  if (!actual) return 'Chỉ nhận ảnh JPEG, PNG, WebP hoặc file PDF'
  if (kind !== 'ANY' && actual !== kind) return kind === 'IMAGE' ? 'Cần chọn ảnh (JPEG, PNG hoặc WebP)' : 'Cần chọn file PDF'
  if (file.size === 0) return 'File rỗng'
  if (file.size > MAX_FILE_BYTES) return 'File lớn hơn 10MB'
  return null
}
