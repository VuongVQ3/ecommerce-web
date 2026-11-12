import type { AssetKind, AssetRow } from './damApi'

export const KIND_LABEL: Record<AssetKind, string> = { IMAGE: 'Ảnh', PDF: 'PDF' }

/** "820 B", "512 KB", "1,5 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024).toLocaleString('vi-VN')} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`
}

/** "1200 × 800" for an image, "3 trang" for a PDF, "—" when unknown. */
export function dimensions(asset: Pick<AssetRow, 'kind' | 'width' | 'height' | 'pageCount'>): string {
  if (asset.kind === 'PDF') return asset.pageCount ? `${asset.pageCount} trang` : '—'
  return asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'
}

/** An image without alt text (screen readers and search engines get nothing). */
export const missingAlt = (asset: Pick<AssetRow, 'kind' | 'alt'>) => asset.kind === 'IMAGE' && !asset.alt?.trim()
