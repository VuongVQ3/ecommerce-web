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
  /** The photo the visitor sees first: load it at once (others wait until near the viewport) */
  eager?: boolean
  /** How the photo fills its box (object-cover: cropped to it) */
  fit?: string
  /**
   * Below md, load the whole photo (Cloudinary `limit`, uploads are not always square) instead of the square crop;
   * from md the usual square copy is loaded, unchanged
   */
  wholeBelowMd?: boolean
}

/** Same breakpoint as Tailwind's md */
const BELOW_MD = '(max-width: 767.98px)'

/** Product photo (resized by Cloudinary), or a category-themed placeholder when missing or broken. */
export default function ProductImage({
  name,
  imageUrl,
  categorySlug,
  size = 400,
  className = '',
  eager = false,
  fit = 'object-cover',
  wholeBelowMd = false,
}: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (imageUrl && failedUrl !== imageUrl) {
    const img = (
      <img
        src={cloudinaryUrl(imageUrl, size * 2)}
        alt={name}
        width={size}
        height={size}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
        onError={() => setFailedUrl(imageUrl)}
        className={`${fit} ${className}`}
      />
    )
    if (!wholeBelowMd) return img
    // `contents`: the picture element takes no box, the img sizes itself as without it
    return (
      <picture className="contents">
        <source media={BELOW_MD} srcSet={cloudinaryUrl(imageUrl, size * 3, size * 3, 'limit')} />
        {img}
      </picture>
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
