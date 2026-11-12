import { ArrowDown, ArrowUp, FileText, Plus, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import MarkdownEditor from '../../admin/MarkdownEditor'
import { btn, input } from '../../admin/styles'
import AssetPicker from '../assets/AssetPicker'
import { cfApi, type FieldDef, type RefSummary } from './cfApi'
import { fromLocalInput, toLocalInput } from './cfDates'
import { FragmentPicker, ProductPicker } from './Pickers'

interface Props {
  field: FieldDef
  value: unknown
  onChange: (value: unknown) => void
  error?: string
  /** Names and thumbnails of referenced items, by id */
  refs: Record<string, RefSummary>
  /** A newly picked item, so its name shows at once */
  onRef: (ref: RefSummary) => void
  /** The fragment being edited (cannot pick itself) */
  self?: string
}

/** inList: one item of a list or multiple field (named "Tag 1", "Tag 2"… since no <label> points at it) */
type Single = Omit<Props, 'error'> & { id: string; label: string; inList?: boolean }

const PICKER_TYPES = ['asset', 'fragment', 'product']

/** One picked asset, fragment or product: its name (and thumbnail), with Change and Remove. */
function RefValue({ id, refs, onPick, onClear, kind }: { id: string; refs: Record<string, RefSummary>; onPick: () => void; onClear: () => void; kind: string }) {
  const ref = refs[id]
  return (
    <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-2">
      {ref?.thumb ? (
        <img src={ref.thumb} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
          <FileText className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900">{ref?.title ?? id}</span>
      <button type="button" className={btn.link} onClick={onPick}>
        Đổi
      </button>
      <button type="button" aria-label={`Bỏ ${kind}`} onClick={onClear} className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-danger">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}

/** The input for one value of the field's type. */
function SingleInput({ field, value, onChange, refs, onRef, self, id, label, inList }: Single) {
  const [picking, setPicking] = useState(false)
  const type = field.type === 'list' ? (field.rules.itemType ?? 'text') : field.type
  const text = typeof value === 'string' ? value : ''
  const named = inList ? { 'aria-label': label } : {}
  const pick = (ref: RefSummary) => {
    onRef(ref)
    onChange(ref.type === 'PRODUCT' ? Number(ref.id) : ref.id)
    setPicking(false)
  }

  switch (type) {
    case 'textarea':
      return <textarea id={id} {...named} rows={3} className={input} value={text} maxLength={field.rules.maxLength} onChange={(e) => onChange(e.target.value)} />
    case 'markdown':
      return (
        <MarkdownEditor
          label={label}
          value={text}
          onChange={onChange}
          preview={cfApi.markdownPreview}
          maxLength={field.rules.maxLength ?? 50_000}
        />
      )
    case 'number':
      return (
        <input
          id={id}
          {...named}
          type="number"
          className={`${input} max-w-48`}
          min={field.rules.min}
          max={field.rules.max}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )
    case 'boolean':
      return (
        // Named by the field's own label; "Có" is only a visual hint
        <span className="inline-flex items-center gap-2 text-sm">
          <input id={id} {...named} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span aria-hidden>Có</span>
        </span>
      )
    case 'date':
      return <input id={id} {...named} type="date" className={`${input} max-w-48`} value={text} onChange={(e) => onChange(e.target.value || null)} />
    case 'datetime':
      return (
        <input
          id={id}
          {...named}
          type="datetime-local"
          className={`${input} max-w-60`}
          value={toLocalInput(text)}
          onChange={(e) => onChange(fromLocalInput(e.target.value))}
        />
      )
    case 'enum':
      return (
        <select id={id} {...named} className={`${input} max-w-72`} value={text} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">— Chọn —</option>
          {(field.rules.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    case 'asset':
    case 'fragment':
    case 'product': {
      const current = value === null || value === undefined || value === '' ? null : String(value)
      const noun = type === 'asset' ? 'asset' : type === 'fragment' ? 'fragment' : 'sản phẩm'
      const kinds = field.rules.allowedKinds ?? []
      return (
        <>
          {current ? (
            <RefValue id={current} refs={refs} kind={noun} onPick={() => setPicking(true)} onClear={() => onChange(null)} />
          ) : (
            <button type="button" className={btn.secondary} onClick={() => setPicking(true)}>
              Chọn {noun}
            </button>
          )}
          {picking && type === 'asset' && (
            <AssetPicker
              kind={kinds.length === 1 ? kinds[0] : 'ANY'}
              onClose={() => setPicking(false)}
              onSelect={(a) => pick({ id: a.id, type: 'ASSET', title: a.title, thumb: a.renditions.thumb ?? null, status: a.kind })}
            />
          )}
          {picking && type === 'fragment' && (
            <FragmentPicker modelSlugs={field.rules.allowedModels ?? []} exclude={self} onClose={() => setPicking(false)} onSelect={pick} />
          )}
          {picking && type === 'product' && <ProductPicker onClose={() => setPicking(false)} onSelect={pick} />}
        </>
      )
    }
    default:
      // text and link
      return (
        <input
          id={id}
          {...named}
          type="text"
          inputMode={type === 'link' ? 'url' : undefined}
          placeholder={type === 'link' ? '/san-pham/… hoặc https://…' : undefined}
          className={input}
          value={text}
          maxLength={field.rules.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

/**
 * The form control for one model field, chosen by its type; a list or a multiple field shows one control per
 * value with add, remove and move up/down. Markdown uses the editor with the author preview, assets the DAM picker,
 * fragments and products their own pickers.
 */
export default function FieldInput(props: Props) {
  const { field, value, onChange, error } = props
  const id = useId()
  const many = field.multiple || field.type === 'list'
  const isMarkdown = field.type === 'markdown' && !many
  let control: ReactNode
  if (!many) {
    control = <SingleInput {...props} id={id} label={isMarkdown && field.required ? `${field.label} *` : field.label} />
  } else {
    const items = Array.isArray(value) ? value : []
    const set = (next: unknown[]) => onChange(next)
    const max = field.rules.maxItems
    control = (
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <SingleInput
                {...props}
                inList
                id={`${id}-${index}`}
                label={`${field.label} ${index + 1}`}
                value={item}
                onChange={(v) => set(items.map((x, i) => (i === index ? v : x)))}
              />
            </div>
            <div className="flex shrink-0 gap-0.5">
              <button
                type="button"
                aria-label={`Đưa mục ${index + 1} lên`}
                disabled={index === 0}
                onClick={() => set(items.map((x, i) => (i === index - 1 ? items[index] : i === index ? items[index - 1] : x)))}
                className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-30"
              >
                <ArrowUp aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Đưa mục ${index + 1} xuống`}
                disabled={index === items.length - 1}
                onClick={() => set(items.map((x, i) => (i === index + 1 ? items[index] : i === index ? items[index + 1] : x)))}
                className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-30"
              >
                <ArrowDown aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Bỏ mục ${index + 1}`}
                onClick={() => set(items.filter((_, i) => i !== index))}
                className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-danger"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className={`${btn.secondary} self-start`}
          disabled={max !== undefined && items.length >= max}
          onClick={() => set([...items, field.type === 'boolean' ? false : null])}
        >
          <Plus aria-hidden className="size-4" />
          Thêm mục
        </button>
      </div>
    )
  }
  // A <label> only for one plain input; lists and pickers are a group named by the field's label
  const plainInput = !many && !PICKER_TYPES.includes(field.type)
  const labelId = `${id}-label`
  return (
    <div data-field={field.name} role={plainInput || isMarkdown ? undefined : 'group'} aria-labelledby={plainInput || isMarkdown ? undefined : labelId}>
      {!isMarkdown && (
        <p className="mb-1 text-sm font-medium text-stone-700">
          {plainInput ? <label htmlFor={id}>{field.label}</label> : <span id={labelId}>{field.label}</span>}
          {field.required && (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          )}
        </p>
      )}
      {control}
      {field.help && <p className="mt-1 text-sm text-muted">{field.help}</p>}
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
