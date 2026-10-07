const CATEGORY_STYLE: Record<string, { emoji: string; tint: string }> = {
  'hat-dinh-duong': { emoji: '🌰', tint: 'from-nut-light to-amber-100' },
  'hat-sieu-thuc-pham': { emoji: '🌱', tint: 'from-brand-100 to-lime-50' },
  'hat-mix-granola': { emoji: '🥣', tint: 'from-orange-50 to-amber-100' },
}

interface Props {
  name: string
  imageUrl: string | null
  categorySlug: string
  className?: string
}

/** Shows the product photo, or a category-themed placeholder until real photos are uploaded. */
export default function ProductImage({ name, imageUrl, categorySlug, className = '' }: Props) {
  if (imageUrl) {
    return <img src={imageUrl} alt={name} loading="lazy" className={`object-cover ${className}`} />
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
