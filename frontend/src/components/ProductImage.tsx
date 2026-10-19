import { useState } from 'react'
import { categoryStyle } from '../lib/categoryStyle'
import { cloudinaryUrl } from '../lib/images'

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
  const style = categoryStyle(categorySlug)
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
