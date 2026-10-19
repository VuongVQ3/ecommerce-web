import { useEffect, useRef, useState } from 'react'

/** How long the "copied" state stays on the button */
export const COPIED_MS = 2000

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" className="size-4 shrink-0">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Copies with the Clipboard API inside the click; if that is unavailable, shows the text selected for manual copy.
 * After copying the button turns green with a tick for 2 s (a new click copies again and restarts the 2 s); both
 * labels share one grid cell, so the button keeps its width and its neighbours do not move. Hover/press scale only
 * with motion allowed (motion-safe); colours always change. Screen readers hear "Đã sao chép" (polite live region).
 */
export default function CopyButton({ text, label, copiedLabel = 'Đã sao chép' }: { text: string; label: string; copiedLabel?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      window.clearTimeout(timer.current)
      setState('copied')
      timer.current = window.setTimeout(() => setState('idle'), COPIED_MS)
    } catch {
      window.clearTimeout(timer.current)
      setState('manual')
      window.setTimeout(() => inputRef.current?.select(), 0)
    }
  }

  const copied = state === 'copied'
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className={`inline-grid cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-semibold transition duration-150 ease-out hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:hover:scale-[1.03] motion-safe:active:scale-95 ${
          copied ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-stone-300 bg-white text-stone-800'
        }`}
      >
        {/* aria-hidden on the hidden one: the button is named by the label that shows */}
        <span aria-hidden={copied} className={`col-start-1 row-start-1 ${copied ? 'invisible' : ''}`}>
          {label}
        </span>
        <span aria-hidden={!copied} className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${copied ? '' : 'invisible'}`}>
          <CheckIcon />
          {copiedLabel}
        </span>
      </button>
      {state === 'manual' && (
        <input
          ref={inputRef}
          readOnly
          value={text}
          aria-label="Nhấn giữ hoặc Ctrl+C để sao chép"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full min-w-0 rounded-lg border border-stone-300 bg-stone-50 px-2 py-1 text-sm sm:w-80"
        />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? copiedLabel : ''}
      </span>
    </span>
  )
}
