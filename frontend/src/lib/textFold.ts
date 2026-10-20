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

/** The search term as the server compares it: folded, spaces collapsed. */
export const foldTerm = (term: string) => fold(term.trim()).replace(/\s+/g, ' ')

/** Where `term` appears in `text` ignoring case and accents, as [start, end) in `text`; null when it does not. */
export function matchRange(text: string, term: string): [number, number] | null {
  const needle = foldTerm(term)
  if (!needle) return null
  const at = fold(text).indexOf(needle)
  return at < 0 ? null : [at, at + needle.length]
}
