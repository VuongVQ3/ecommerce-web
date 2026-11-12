import { X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

export const MAX_TAGS = 20
export const MAX_TAG_LENGTH = 40

/** As the server stores them: trimmed, single spaces, lowercase. */
const normalizeTag =(tag: string) => tag.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Tags as chips: Enter or a comma adds what was typed, Backspace in an empty box removes the last one. Duplicates,
 * more than 20 tags and tags over 40 characters are refused here, as on the server.
 */
export default function TagInput({ id, value, onChange }: { id?: string; value: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const commit = () => {
    const tag = normalizeTag(draft)
    if (!tag) return
    if (tag.length > MAX_TAG_LENGTH) return setProblem(`Mỗi tag tối đa ${MAX_TAG_LENGTH} ký tự`)
    if (value.includes(tag)) {
      setDraft('')
      return setProblem(null)
    }
    if (value.length >= MAX_TAGS) return setProblem(`Tối đa ${MAX_TAGS} tag`)
    onChange([...value, tag])
    setDraft('')
    setProblem(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && draft === '' && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pr-1 pl-2.5 text-sm text-indigo-900">
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              aria-label={`Bỏ tag ${tag}`}
              className="flex size-5 items-center justify-center rounded-full hover:bg-indigo-100"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={value.length ? '' : 'Gõ tag rồi nhấn Enter'}
          className="min-w-32 flex-1 border-0 bg-transparent px-1 py-1 text-base outline-none lg:text-sm"
        />
      </div>
      {problem && <p className="mt-1 text-sm text-danger">{problem}</p>}
    </div>
  )
}
