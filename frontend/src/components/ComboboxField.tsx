import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { searchIndex, searchOptions, type ComboboxGroup, type ComboboxOption, type SearchMatch } from '../lib/addressSearch'
import { foldTerm } from '../lib/textFold'
import { describedByIds, inputClass } from './fieldParts'
import { FieldShell } from './FormFields'

interface ComboboxFieldProps {
  label: string
  error?: string
  hint?: ReactNode
  /** Shown while nothing is chosen ("Chọn tỉnh/thành phố", "Đang tải...") */
  placeholder: string
  /** Red * after the label and aria-required (see TextField) */
  requiredMark?: boolean
  disabled?: boolean
  name?: string
  /** The chosen option's value, '' when none: the field never holds free text */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  ref?: Ref<HTMLInputElement>
  /** Every choice, in the order ties keep while searching */
  options: ComboboxOption[]
  /** The list shown before anything is typed, when it is not simply `options` (e.g. a "popular" group first) */
  groups?: ComboboxGroup[]
}

/** Default and largest height of the list (18rem). */
const LIST_MAX = 288
/** A finger that moved this far (px) was scrolling the list, not picking. */
const TAP_SLOP = 10

/** One label with its matching parts in bold. */
function Highlighted({ label, ranges }: { label: string; ranges: SearchMatch['ranges'] }) {
  const parts: ReactNode[] = []
  let from = 0
  for (const [start, end] of ranges) {
    if (start > from) parts.push(label.slice(from, start))
    parts.push(
      <mark key={start} className="bg-transparent font-bold text-inherit">
        {label.slice(start, end)}
      </mark>,
    )
    from = end
  }
  parts.push(label.slice(from))
  return <>{parts}</>
}

/**
 * A text box that filters a list of choices as you type (WAI-ARIA 1.2 combobox with a listbox popup), with the same
 * label/error wiring as TextField. ↑/↓ move, Enter picks, Esc closes (a second Esc puts back the chosen name), Tab
 * picks the highlighted choice once something was typed. Leaving the box picks the only match, else puts back the
 * chosen name. On phones the list stays above the on-screen keyboard and a tap (not a scroll) picks.
 */
export function ComboboxField({
  label,
  error,
  hint,
  placeholder,
  requiredMark,
  disabled = false,
  name,
  value,
  onChange,
  onBlur,
  ref,
  options,
  groups,
}: ComboboxFieldProps) {
  const id = useId()
  const listId = `${id}-listbox`
  const optionId = (i: number) => `${id}-option-${i}`
  const inputRef = useRef<HTMLInputElement | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const press = useRef<{ index: number; x: number; y: number; moved: boolean } | null>(null)

  const [open, setOpen] = useState(false)
  // What the buyer typed since the last pick; while false the box shows the chosen option's label
  const [typed, setTyped] = useState(false)
  const [text, setText] = useState('')
  const [active, setActive] = useState(-1)
  const [place, setPlace] = useState({ up: false, max: LIST_MAX })

  const index = useMemo(() => searchIndex(options), [options])
  const chosen = options.find((o) => o.value === value)
  const searching = typed && foldTerm(text) !== ''
  const matches = useMemo(() => (searching ? searchOptions(index, text) : null), [index, searching, text])
  const sections: { label?: string; items: SearchMatch[] }[] = matches
    ? [{ items: matches }]
    : (groups ?? [{ options }]).map((g) => ({
        label: 'label' in g ? g.label : undefined,
        items: g.options.map((option) => ({ option, ranges: [] })),
      }))
  const items = sections.flatMap((s) => s.items)
  const activeIndex = open && active < items.length ? active : -1
  const chosenIndex = items.findIndex((m) => m.option.value === value)

  const setInput = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )

  const openList = () => {
    if (disabled) return
    setOpen(true)
    setActive(typed ? active : chosenIndex)
  }
  const pick = (option: ComboboxOption) => {
    onChange(option.value)
    setTyped(false)
    setOpen(false)
  }
  /** Back to the chosen option's label (or empty). */
  const putBack = () => {
    setTyped(false)
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = items.length - 1
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault()
        const down = e.key === 'ArrowDown'
        if (!open) {
          setOpen(true)
          if (!e.altKey) setActive(typed ? active : chosenIndex >= 0 ? chosenIndex : down ? 0 : last)
        } else if (items.length) {
          setActive(activeIndex < 0 ? (down ? 0 : last) : Math.min(Math.max(activeIndex + (down ? 1 : -1), 0), last))
        }
        break
      }
      case 'Enter':
        // Never submits the form while the list is open
        if (open) {
          e.preventDefault()
          if (activeIndex >= 0) pick(items[activeIndex].option)
          else setOpen(false)
        }
        break
      case 'Escape':
        if (open) {
          e.preventDefault()
          setOpen(false)
        } else if (typed) {
          e.preventDefault()
          putBack()
        }
        break
      case 'Tab':
        if (open && searching && activeIndex >= 0) pick(items[activeIndex].option)
        break
    }
  }

  const onInputBlur = () => {
    if (typed) {
      if (matches?.length === 1) pick(matches[0].option)
      else putBack()
    }
    setOpen(false)
    onBlur?.()
  }

  const onFocus = () => {
    openList()
    // Phones: bring the box to the middle, above the keyboard that is about to open
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      window.setTimeout(() => inputRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 300)
    }
  }

  // Tap vs scroll: a press picks on release only if the finger (or mouse) did not travel and the list did not scroll
  const onOptionDown = (e: PointerEvent, i: number) => {
    if (e.button > 0) return
    press.current = { index: i, x: e.clientX ?? 0, y: e.clientY ?? 0, moved: false }
  }
  const onListMove = (e: PointerEvent) => {
    const p = press.current
    if (p && Math.hypot((e.clientX ?? 0) - p.x, (e.clientY ?? 0) - p.y) > TAP_SLOP) p.moved = true
  }
  const onOptionUp = (i: number) => {
    const p = press.current
    press.current = null
    if (p && p.index === i && !p.moved) pick(items[i].option)
  }

  // Keep the highlighted choice in view
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, id])

  // Open downwards unless the space below (above the on-screen keyboard: visualViewport) is too small
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const box = wrapRef.current?.getBoundingClientRect()
      if (!box) return
      const viewport = window.visualViewport
      const top = viewport?.offsetTop ?? 0
      const bottom = top + (viewport?.height ?? window.innerHeight)
      const below = bottom - box.bottom - 8
      const above = box.top - top - 8
      const up = below < LIST_MAX && above > below
      setPlace({ up, max: Math.max(120, Math.min(LIST_MAX, up ? above : below)) })
    }
    measure()
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', measure)
    viewport?.addEventListener('scroll', measure)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      viewport?.removeEventListener('resize', measure)
      viewport?.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  const describedBy = describedByIds(id, error, hint)
  let n = 0
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} requiredMark={requiredMark}>
      <div ref={wrapRef} className="relative">
        <input
          id={id}
          ref={setInput}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-required={requiredMark || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          disabled={disabled}
          placeholder={placeholder}
          value={typed ? text : (chosen?.label ?? '')}
          onChange={(e) => {
            setText(e.target.value)
            setTyped(true)
            setOpen(true)
            // The best match is highlighted, so Enter (or Tab) takes it; nothing when the box was emptied
            setActive(foldTerm(e.target.value) ? 0 : -1)
          }}
          onFocus={onFocus}
          onClick={() => !open && openList()}
          onBlur={onInputBlur}
          onKeyDown={onKeyDown}
          className={`${inputClass(error)} pr-16 disabled:cursor-not-allowed disabled:bg-stone-50`}
        />
        {chosen && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Xoá ${chosen.label}`}
            // Keeps the focus in the box
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('')
              setText('')
              setTyped(false)
              inputRef.current?.focus()
              setOpen(true)
              setActive(-1)
            }}
            className="absolute inset-y-0 right-9 flex w-8 items-center justify-center text-muted hover:text-stone-900"
          >
            <span aria-hidden>✕</span>
          </button>
        )}
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M5.5 7.5l4.5 4.5 4.5-4.5" />
        </svg>
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          hidden={!open}
          style={{ maxHeight: place.max }}
          // A press in the list must not take the focus out of the box (that would close it)
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            // Touch: no compatibility mousedown either (it would move the focus)
            if (e.pointerType !== 'mouse') e.preventDefault()
          }}
          onPointerMove={onListMove}
          onPointerCancel={() => {
            press.current = null
          }}
          onScroll={() => {
            if (press.current) press.current.moved = true
          }}
          className={`absolute inset-x-0 z-30 overflow-y-auto overscroll-contain rounded-xl border border-stone-200 bg-white p-1 shadow-lg ${
            place.up ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {open &&
            (items.length === 0 ? (
              <div role="option" aria-disabled="true" aria-selected="false" className="px-3 py-2.5 text-base text-muted">
                Không tìm thấy “{text.trim()}”
              </div>
            ) : (
              sections.map((section, s) => {
                const rows = section.items.map((match) => {
                  const i = n++
                  const selected = match.option.value === value
                  return (
                    <div
                      key={match.option.value}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === activeIndex}
                      onPointerDown={(e) => onOptionDown(e, i)}
                      onPointerUp={() => onOptionUp(i)}
                      className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-base text-stone-800 ${
                        i === activeIndex ? 'bg-brand-50 text-stone-900' : 'hover:bg-stone-50'
                      }`}
                    >
                      <span>
                        <Highlighted label={match.option.label} ranges={match.ranges} />
                      </span>
                      {selected && (
                        <span aria-hidden className="font-bold text-brand-700">
                          ✓
                        </span>
                      )}
                    </div>
                  )
                })
                if (!section.label) return rows
                const headingId = `${id}-group-${s}`
                return (
                  <div key={section.label} role="group" aria-labelledby={headingId}>
                    <div
                      id={headingId}
                      role="presentation"
                      className={`px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase ${s > 0 ? 'mt-1 border-t border-stone-100' : ''}`}
                    >
                      {section.label}
                    </div>
                    {rows}
                  </div>
                )
              })
            ))}
        </div>
        <span role="status" className="sr-only">
          {open && searching ? (items.length ? `${items.length} kết quả` : 'Không tìm thấy kết quả') : ''}
        </span>
      </div>
    </FieldShell>
  )
}
