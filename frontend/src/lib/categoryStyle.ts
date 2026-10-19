/** Placeholder look of a product without a photo, by category slug (storefront and back office). */
const CATEGORY_STYLE: Record<string, { emoji: string; tint: string }> = {
  'hat-dinh-duong': { emoji: '🌰', tint: 'from-nut-light to-amber-100' },
  'hat-sieu-thuc-pham': { emoji: '🌱', tint: 'from-brand-100 to-lime-50' },
  'hat-mix-ngu-coc': { emoji: '🥣', tint: 'from-orange-50 to-amber-100' },
  'banh-thanh-hat': { emoji: '🍘', tint: 'from-amber-50 to-orange-100' },
  'trai-cay-say-dac-san': { emoji: '🥭', tint: 'from-yellow-50 to-amber-100' },
}

const FALLBACK = { emoji: '🥜', tint: 'from-stone-100 to-stone-200' }

export function categoryStyle(slug: string | null | undefined): { emoji: string; tint: string } {
  return (slug && CATEGORY_STYLE[slug]) || FALLBACK
}

export const categoryEmoji = (slug: string | null | undefined) => categoryStyle(slug).emoji
