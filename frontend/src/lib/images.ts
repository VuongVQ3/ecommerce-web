import type { StockStatus } from './api'

const UPLOAD_SEGMENT = '/image/upload/'

/**
 * Cloudinary delivers a resized, best-format (AVIF/WebP) and auto-quality copy when transformations are inserted
 * right after "/image/upload/". Other URLs are returned unchanged.
 */
export function cloudinaryUrl(url: string, width: number, height = width): string {
  const at = url.indexOf(UPLOAD_SEGMENT)
  if (at < 0 || !url.includes('res.cloudinary.com')) return url
  const head = url.slice(0, at + UPLOAD_SEGMENT.length)
  const tail = url.slice(at + UPLOAD_SEGMENT.length)
  return `${head}f_auto,q_auto,c_fill,w_${Math.round(width)},h_${Math.round(height)}/${tail}`
}

/** Storefront wording for the public stock status (exact counts only when very low). */
export function stockLabel(stock: StockStatus, active = true): string {
  if (!active) return 'Ngừng kinh doanh'
  switch (stock.status) {
    case 'IN_STOCK':
      return 'Còn hàng'
    case 'LOW_STOCK':
      return stock.quantity != null ? `Chỉ còn ${stock.quantity}` : 'Sắp hết hàng'
    default:
      return 'Hết hàng'
  }
}
