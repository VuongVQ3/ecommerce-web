import { useId } from 'react'
import { input } from '../../admin/styles'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import type { PropDef } from '../../cms/registry'
import { cfApi, type RefSummary } from '../fragments/cfApi'
import FieldInput from '../fragments/FieldInput'

/** Choices for the registry's "ref" props: categories, Content Fragment models, fragment folders. */
function useRefOptions(ref: PropDef['rules']['ref']) {
  return useAsync<{ value: string; label: string }[]>(
    async (signal) => {
      if (ref === 'category') return (await api.categories(signal)).map((c) => ({ value: c.slug, label: c.name }))
      if (ref === 'cfModel') return (await cfApi.models(signal)).map((m) => ({ value: m.slug, label: m.name }))
      if (ref === 'fragmentFolder') return (await cfApi.folders(signal)).map((f) => ({ value: f, label: f }))
      return []
    },
    [ref],
  )
}

function RefSelect({ prop, value, onChange, error }: { prop: PropDef; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const id = useId()
  const options = useRefOptions(prop.rules.ref)
  const current = typeof value === 'string' ? value : ''
  const known = options.data ?? []
  return (
    <div data-field={prop.name}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">
        {prop.label}
        {prop.required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </label>
      <select id={id} className={input} value={current} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{prop.rules.ref === 'fragmentFolder' ? '— Mọi thư mục —' : '— Chọn —'}</option>
        {/* A stored value the lists no longer have stays visible (the server reports it) */}
        {current && !known.some((o) => o.value === current) && <option value={current}>{current}</option>}
        {known.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {prop.help && <p className="mt-1 text-sm text-muted">{prop.help}</p>}
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/** One prop of a component (or page property): a select for "ref" props, the fragment field control otherwise. */
export default function PropInput({
  prop,
  value,
  onChange,
  error,
  refs,
  onRef,
}: {
  prop: PropDef
  value: unknown
  onChange: (v: unknown) => void
  error?: string
  refs: Record<string, RefSummary>
  onRef: (ref: RefSummary) => void
}) {
  if (prop.rules.ref) return <RefSelect prop={prop} value={value} onChange={onChange} error={error} />
  return <FieldInput field={prop} value={value} onChange={onChange} error={error} refs={refs} onRef={onRef} />
}
