import { useState } from 'react'
import { cloudinaryUrl } from '../lib/images'

const CATEGORY_STYLE: Record<string, { emoji: string; tint: string }> = {
  'hat-dinh-duong': { emoji: '🌰', tint: 'from-nut-light to-amber-100' },
  'hat-sieu-thuc-pham': { emoji: '🌱', tint: 'from-brand-100 to-lime-50' },
  'hat-mix-granola': { emoji: '🥣', tint: 'from-orange-50 to-amber-100' },
}

interface Props {
  name: string
  imageUrl: string | null
  categorySlug: string
  /** Rendered size in CSS pixels; a 2x copy is requested for sharp screens. */
  size?: number
  className?: string
}

/** Product photo (resized by Cloudinary), or a category-themed placeholder when missing or broken. */
export default function ProductImage({ name, imageUrl, categorySlug, size = 400, className = '' }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <img
        src={cloudinaryUrl(imageUrl, size * 2)}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(imageUrl)}
        className={`object-cover ${className}`}
      />
    )
  }
  const style = CATEGORY_STYLE[categorySlug] ?? { emoji: '🥜', tint: 'from-stone-100 to-stone-200' }
  return (
    <div
      role="img"
      aria-label={name}
      className={`flex items-center justify-center bg-gradient-to-br ${style.tint} ${className}`}
    >
      <span className="text-6xl drop-shadow-sm select-none" aria-hidden>
        {style.emoji}
      </span>
    </div>
  )
}
