/** One part of a product description: an optional heading and its lines, one paragraph each. */
export type DescriptionSection = { title?: string; lines: string[] }

/**
 * Splits a product description as typed in the back office into sections. Sections are separated by one or more
 * blank lines; in a section of two lines or more the first line is the heading (a trailing ":" dropped), a one-line
 * section is a plain paragraph. Text without any blank line stays one paragraph, as it always showed (line breaks
 * read as spaces). Plain text only: nothing in it is read as HTML or markdown.
 */
export function parseDescription(text: string | null | undefined): DescriptionSection[] {
  const lines = (text ?? '').split(/\r\n?|\n/).map((l) => l.replace(/\s+/g, ' ').trim())

  const blocks: string[][] = [[]]
  for (const line of lines) {
    if (line) blocks[blocks.length - 1].push(line)
    else if (blocks[blocks.length - 1].length) blocks.push([])
  }
  const sections = blocks.filter((b) => b.length)

  if (sections.length <= 1) {
    const all = sections[0] ?? []
    return all.length ? [{ lines: [all.join(' ')] }] : []
  }
  return sections.map((block) => {
    if (block.length === 1) return { lines: block }
    const title = block[0].replace(/\s*[:：]+$/, '')
    return title ? { title, lines: block.slice(1) } : { lines: block.slice(1) }
  })
}
