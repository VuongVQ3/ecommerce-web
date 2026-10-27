import { parseDescription } from '../lib/description'

/**
 * A product description as sections (see parseDescription), shared by the product page and the quick view. Rendered
 * as plain React text: the description is never read as HTML or markdown.
 */
export default function ProductDescription({ text, className = '' }: { text: string; className?: string }) {
  const sections = parseDescription(text)
  if (!sections.length) return null
  return (
    <div className={`${className} space-y-6 leading-relaxed text-stone-700`}>
      {sections.map((s, i) => (
        <section key={i} className="space-y-2">
          {s.title && (
            <h3 className="font-bold tracking-wide text-balance wrap-break-word text-brand-700 uppercase">{s.title}</h3>
          )}
          {s.lines.map((line, j) => (
            <p key={j} className="wrap-break-word">
              {line}
            </p>
          ))}
        </section>
      ))}
    </div>
  )
}
