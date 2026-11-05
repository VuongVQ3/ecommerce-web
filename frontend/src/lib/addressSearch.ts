import type { Province, Ward } from './adminUnits'
import { fold, foldTerm } from './textFold'

/** One choice of a ComboboxField. `keywords`: other ways to type it ("hcm"), matched whole, never highlighted. */
export interface ComboboxOption {
  value: string
  label: string
  keywords?: string[]
}

/** A titled run of options, shown while nothing is typed. */
export interface ComboboxGroup {
  label: string
  options: ComboboxOption[]
}

/** Administrative prefixes, folded. Matching and sorting look past them. */
const PREFIXES = ['thanh pho', 'dac khu', 'phuong', 'tinh', 'xa']
/** What a buyer may type in front of a name → the prefix it means. */
const TYPED_PREFIXES: [string, string][] = [
  ...PREFIXES.map((p): [string, string] => [p, p]),
  ['tp.', 'thanh pho'],
  ['tp', 'thanh pho'],
]

/** [prefix, rest] of a folded label: "phuong an dong" → ["phuong", "an dong"]; a bare name has no prefix. */
function splitPrefix(folded: string): [string | null, string] {
  const prefix = PREFIXES.find((p) => folded.startsWith(`${p} `) && folded.length > p.length + 1)
  return prefix ? [prefix, folded.slice(prefix.length + 1)] : [null, folded]
}

/** The same for what was typed, where the prefix may be all there is ("phuong") or shortened ("tp hue"). */
function splitTyped(typed: string): [string | null, string] {
  for (const [as, prefix] of TYPED_PREFIXES) {
    if (typed === as) return [prefix, '']
    if (typed.startsWith(`${as} `)) return [prefix, typed.slice(as.length + 1)]
  }
  return [null, typed]
}

/** The name without its administrative prefix, accents kept: "Thành phố Hồ Chí Minh" → "Hồ Chí Minh". */
export function stripAdminPrefix(label: string): string {
  // fold() keeps one character per character, so the prefix length is the same in the label
  const folded = fold(label)
  return label.slice(folded.length - splitPrefix(folded)[1].length)
}

const collator = new Intl.Collator('vi', { sensitivity: 'base' })

/** A→Z the Vietnamese way (Đ after D), ignoring the prefixes: "Tỉnh An Giang" before "Tỉnh Bắc Ninh". */
export function sortByName<T extends { label: string }>(options: T[]): T[] {
  return options
    .map((option) => ({ option, key: stripAdminPrefix(option.label) }))
    .sort((a, b) => collator.compare(a.key, b.key))
    .map(({ option }) => option)
}

/** An option ready to be searched: folded once, not on every keystroke. */
export interface SearchEntry {
  option: ComboboxOption
  /** Position in the list handed in: ties keep that order */
  order: number
  /** Folded prefix ("phuong"), null when the label has none */
  prefix: string | null
  /** Folded label without the prefix ("an dong"): where typed words are looked for */
  name: string
  keywords: string[]
}

export function searchIndex(options: ComboboxOption[]): SearchEntry[] {
  return options.map((option, order) => {
    const [prefix, name] = splitPrefix(foldTerm(option.label))
    return { option, order, prefix, name, keywords: (option.keywords ?? []).map(foldTerm) }
  })
}

/** A found option and the [start, end) ranges of its label that match what was typed. */
export interface SearchMatch {
  option: ComboboxOption
  ranges: [number, number][]
}

const startsWord = (text: string, at: number) => at === 0 || text[at - 1] === ' '

/** Where `needle` is in `text`, at the start of a word when it is there too; -1 when absent. */
function findAt(text: string, needle: string): number {
  const first = text.indexOf(needle)
  for (let at = first; at >= 0; at = text.indexOf(needle, at + 1)) {
    if (startsWord(text, at)) return at
  }
  return first
}

/**
 * The parts of the label to show in bold, as [start, end) of the label itself: each word where it is in the name (the
 * start of a word when it can be), plus the prefix when that was typed too. Merged and in order.
 */
function matchRanges(label: string, name: string, words: string[], prefix: boolean): [number, number][] {
  const offset = label.length - name.length
  const ranges: [number, number][] = prefix ? [[0, offset - 1]] : []
  for (const word of words) {
    const at = findAt(name, word)
    if (at >= 0) ranges.push([offset + at, offset + at + word.length])
  }
  ranges.sort((a, b) => a[0] - b[0])
  return ranges.reduce<[number, number][]>((merged, r) => {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([...r])
    return merged
  }, [])
}

/** 0 the name starts with `term`, 1 a word of it does, 2 it is inside a word, 3 its words are apart. */
function rankIn(name: string, term: string): number {
  const at = findAt(name, term)
  return at === 0 ? 0 : at > 0 ? (startsWord(name, at) ? 1 : 2) : 3
}

/**
 * Options matching `query`, ignoring case, accents and the administrative prefix: every typed word must be in the
 * name, in any order, or the whole query is one of the option's keywords. A typed prefix ("phuong an", "tp hue") keeps
 * only options with that prefix; a prefix alone lists them all. Ranked: the name starts with the query, then a word
 * of it does, then it is inside a word, then the words are apart; ties keep the order of the index. Empty when
 * nothing is typed.
 */
export function searchOptions(index: SearchEntry[], query: string): SearchMatch[] {
  const typed = foldTerm(query)
  if (!typed) return []
  const [wanted, core] = splitTyped(typed)
  const found: { entry: SearchEntry; rank: number; words: string[]; prefix: boolean }[] = []
  for (const entry of index) {
    const samePrefix = wanted !== null && entry.prefix === wanted
    if (entry.keywords.some((k) => k === typed || (typed.length >= 3 && k.startsWith(typed)))) {
      found.push({ entry, rank: 0, words: [], prefix: false })
    } else if (wanted && !core) {
      // Just "phuong" (or "tinh"...): that kind first, then names containing the word ("Hà Tĩnh")
      if (samePrefix) found.push({ entry, rank: 0, words: [], prefix: true })
      else if (entry.name.includes(typed)) found.push({ entry, rank: rankIn(entry.name, typed), words: [typed], prefix: false })
    } else if (!wanted || samePrefix) {
      const words = core.split(' ')
      if (words.every((w) => entry.name.includes(w))) {
        found.push({ entry, rank: rankIn(entry.name, core), words, prefix: samePrefix })
      }
    }
  }
  return found
    .sort((a, b) => a.rank - b.rank || a.entry.order - b.entry.order)
    .map(({ entry, words, prefix }) => ({
      option: entry.option,
      ranges: matchRanges(entry.option.label, entry.name, words, prefix),
    }))
}

/** Provinces offered first: the shop ships from Hồ Chí Minh, then the other big cities. */
export const POPULAR_PROVINCES = [79, 1, 48]

/** Short ways people type a province (folded); kept here, not in the shared data file. */
const PROVINCE_KEYWORDS: Record<number, string[]> = {
  79: ['hcm', 'tphcm', 'tp hcm', 'sai gon', 'saigon', 'sg'],
  1: ['hn'],
  48: ['dn'],
  31: ['hp'],
  92: ['ct'],
}

/**
 * Province choices: `options` A→Z (what typing searches), `groups` the list before typing: "Thường chọn" (the
 * popular ones) then "Tất cả" (the rest, A→Z).
 */
export function provinceChoices(provinces: Province[]): { options: ComboboxOption[]; groups: ComboboxGroup[] } {
  const options = sortByName(
    provinces.map((p) => ({ value: String(p.code), label: p.name, keywords: PROVINCE_KEYWORDS[p.code] })),
  )
  const popular = POPULAR_PROVINCES.map(String)
  return {
    options,
    groups: [
      { label: 'Thường chọn', options: popular.flatMap((code) => options.filter((o) => o.value === code)) },
      { label: 'Tất cả', options: options.filter((o) => !popular.includes(o.value)) },
    ],
  }
}

/** Ward choices, one A→Z list whatever the prefix (Phường, Xã, Đặc khu). */
export function wardChoices(wards: Ward[]): ComboboxOption[] {
  return sortByName(wards.map(([code, name]) => ({ value: String(code), label: name })))
}
