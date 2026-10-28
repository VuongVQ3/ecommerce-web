/** One character without case or accent: "Ạ" → "a", "đ" → "d" (same as the backend's TextFold). */
function foldChar(c: string): string {
  if (c === 'đ' || c === 'Đ') return 'd'
  const plain = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  // Keep one character per character, so positions in the folded text are positions in the original
  return plain.length === 1 ? plain : c.toLowerCase()
}

/** Small letters without accents, character for character: "Hạt Điều" → "hat dieu". */
export function fold(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) out += foldChar(text[i])
  return out
}

/** A search term (or a name) as it is compared: folded, trimmed, spaces collapsed: "  Hạt   ĐIỀU " → "hat dieu". */
export const foldTerm = (term: string) => fold(term.trim()).replace(/\s+/g, ' ')

/** How a match ranks: 0 the text starts with the term, 1 a word in it does, 2 the term is inside a word. */
export type MatchRank = 0 | 1 | 2

/** Where `needle` is in `hay` (both folded), preferring the start of the text, then the start of a word. */
function bestMatch(hay: string, needle: string): { at: number; rank: MatchRank } | null {
  const first = hay.indexOf(needle)
  if (first < 0) return null
  if (first === 0) return { at: 0, rank: 0 }
  for (let at = first; at > 0; at = hay.indexOf(needle, at + 1)) {
    if (!/[\p{L}\p{N}]/u.test(hay[at - 1])) return { at, rank: 1 }
  }
  return { at: first, rank: 2 }
}

/** How `text` matches `term` ignoring case, accents and extra spaces; null when it does not (or the term is blank). */
export function matchRank(text: string, term: string): MatchRank | null {
  const needle = foldTerm(term)
  return needle ? (bestMatch(foldTerm(text), needle)?.rank ?? null) : null
}

/**
 * Where `term` appears in `text` ignoring case and accents, as [start, end) in `text` (the start of a word when it
 * can be, like the ranking); null when it does not.
 */
export function matchRange(text: string, term: string): [number, number] | null {
  const needle = foldTerm(term)
  if (!needle) return null
  const found = bestMatch(fold(text), needle)
  return found ? [found.at, found.at + needle.length] : null
}
