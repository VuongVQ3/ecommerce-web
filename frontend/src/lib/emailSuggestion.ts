/** Domains we offer as corrections. */
const POPULAR_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'yahoo.com.vn', 'live.com']

/** Real domains that happen to look like typos of popular ones (e.g. mail.com vs gmail.com): never "correct" them. */
const KNOWN_VALID = new Set([
  ...POPULAR_DOMAINS,
  'ymail.com',
  'mail.com',
  'email.com',
  'gmx.com',
  'msn.com',
  'me.com',
  'aol.com',
  'zoho.com',
  'proton.me',
  'protonmail.com',
  'fpt.vn',
  'fpt.com.vn',
  'vnn.vn',
  'hotmail.co.uk',
])

const MAX_DISTANCE = 2

/**
 * Suggests a fix for a likely typo in a popular email domain ("an@gmial.com" -> "an@gmail.com"), or null.
 * Only a hint: the user may still submit what they typed.
 */
export function suggestEmail(email: string): string | null {
  const value = email.trim()
  const at = value.lastIndexOf('@')
  if (at < 1 || at === value.length - 1) return null
  const local = value.slice(0, at)
  const domain = value.slice(at + 1).toLowerCase()
  if (KNOWN_VALID.has(domain)) return null

  let best: string | null = null
  let bestDistance = Infinity
  for (const candidate of POPULAR_DOMAINS) {
    const d = editDistance(domain, candidate)
    if (d < bestDistance) {
      best = candidate
      bestDistance = d
    }
  }
  return best && bestDistance <= MAX_DISTANCE ? `${local}@${best}` : null
}

/** Optimal string alignment distance: Levenshtein plus adjacent transpositions ("gmial" -> "gmail" costs 1). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}
