/**
 * Text edits behind the Markdown editor's toolbar. Pure functions: they take the text and the selection and return
 * the new text with where the cursor (or selection) should be, so they can be tested without a textarea.
 */
export interface Edit {
  text: string
  selectionStart: number
  selectionEnd: number
}

/** **bold**, _italic_, [link](url): wraps the selection, or a placeholder that is left selected for typing over. */
export function wrapSelection(text: string, start: number, end: number, before: string, after: string, placeholder: string): Edit {
  const selected = text.slice(start, end) || placeholder
  const next = text.slice(0, start) + before + selected + after + text.slice(end)
  return { text: next, selectionStart: start + before.length, selectionEnd: start + before.length + selected.length }
}

/** "## ", "- ", "> ": added at the start of every line the selection touches (removed if all already have it). */
export function prefixLines(text: string, start: number, end: number, prefix: string): Edit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const nextBreak = text.indexOf('\n', end)
  const lineEnd = nextBreak < 0 ? text.length : nextBreak
  const lines = text.slice(lineStart, lineEnd).split('\n')
  const all = lines.every((l) => l.startsWith(prefix))
  // Another heading level is replaced, not stacked ("## " on "### x" gives "## x")
  const changed = lines.map((l) => (all ? l.slice(prefix.length) : prefix + (prefix.startsWith('#') ? l.replace(/^#+\s*/, '') : l)))
  const block = changed.join('\n')
  const next = text.slice(0, lineStart) + block + text.slice(lineEnd)
  return { text: next, selectionStart: lineStart + block.length, selectionEnd: lineStart + block.length }
}

/**
 * A block (an image) at the cursor, on its own paragraph: blank lines before and after unless already there, so a
 * titled image renders as a figure. Replaces the selection; the cursor ends after the block.
 */
export function insertBlock(text: string, start: number, end: number, block: string): Edit {
  const before = text.slice(0, start)
  const after = text.slice(end)
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const trail = after === '' ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  const next = before + lead + block + trail + after
  const cursor = before.length + lead.length + block.length + trail.length
  return { text: next, selectionStart: cursor, selectionEnd: cursor }
}

/** ![alt](url "caption"), with the characters that would end the alt or the caption escaped. */
export function imageMarkdown(url: string, alt: string, caption?: string): string {
  const safeAlt = alt.replace(/[\r\n]+/g, ' ').replace(/([[\]\\])/g, '\\$1').trim()
  const title = caption?.replace(/[\r\n]+/g, ' ').trim()
  return `![${safeAlt}](${url}${title ? ` "${title.replace(/(["\\])/g, '\\$1')}"` : ''})`
}
