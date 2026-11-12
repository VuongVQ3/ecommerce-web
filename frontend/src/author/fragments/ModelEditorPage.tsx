import { Plus, Trash2, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { btn, card, input } from '../../admin/styles'
import { useDragReorder } from '../../admin/useDragReorder'
import { Dialog, PageHeader, UnsavedChangesGuard } from '../../admin/ui'
import { ErrorMessage, Spinner } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { ApiError } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { useAuthorSession } from '../AuthorSessionContext'
import { cfApi, MODEL_STATUS_LABEL, type FieldDef, type ModelDetail, type ModelInput, type ModelRow, type ModelStatus } from './cfApi'
import { camelName, canBeMultiple, emptyField, FIELD_NAME, FIELD_TYPES, rulesFor } from './fieldTypes'

interface Row {
  key: number
  field: FieldDef
  /** The name was typed by hand (no longer follows the label) */
  named: boolean
}

interface Form {
  name: string
  slug: string
  description: string
  status: ModelStatus
}

const numberOrUndefined = (value: string) => (value.trim() === '' || Number.isNaN(Number(value)) ? undefined : Number(value))

function RulesEditor({
  field,
  onChange,
  models,
  disabled,
  errors,
  at,
}: {
  field: FieldDef
  onChange: (rules: FieldDef['rules']) => void
  models: ModelRow[]
  disabled: boolean
  errors: Record<string, string>
  at: string
}) {
  const r = field.rules
  const valueType = field.type === 'list' ? (r.itemType ?? 'text') : field.type
  const set = (patch: Partial<FieldDef['rules']>) => onChange({ ...r, ...patch })
  const error = (key: string) => errors[`${at}rules.${key}`]
  const small = `${input} max-w-36`
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {field.type === 'list' && (
        <label>
          <span className="mb-1 block text-stone-600">Kiểu phần tử</span>
          <select className={small} disabled={disabled} value={r.itemType ?? 'text'} onChange={(e) => set({ itemType: e.target.value as FieldDef['rules']['itemType'] })}>
            <option value="text">Chữ</option>
            <option value="number">Số</option>
            <option value="link">Đường dẫn</option>
            <option value="date">Ngày</option>
          </select>
        </label>
      )}
      {['text', 'textarea', 'markdown', 'link'].includes(valueType) && (
        <label>
          <span className="mb-1 block text-stone-600">Dài tối đa</span>
          <input type="number" min={1} className={small} disabled={disabled} value={r.maxLength ?? ''} onChange={(e) => set({ maxLength: numberOrUndefined(e.target.value) })} />
          {error('maxLength') && <span className="mt-1 block text-danger">{error('maxLength')}</span>}
        </label>
      )}
      {valueType === 'number' && (
        <>
          <label>
            <span className="mb-1 block text-stone-600">Nhỏ nhất</span>
            <input type="number" className={small} disabled={disabled} value={r.min ?? ''} onChange={(e) => set({ min: numberOrUndefined(e.target.value) })} />
          </label>
          <label>
            <span className="mb-1 block text-stone-600">Lớn nhất</span>
            <input type="number" className={small} disabled={disabled} value={r.max ?? ''} onChange={(e) => set({ max: numberOrUndefined(e.target.value) })} />
            {(error('max') || error('min')) && <span className="mt-1 block text-danger">{error('max') ?? error('min')}</span>}
          </label>
        </>
      )}
      {(field.multiple || field.type === 'list') && (
        <label>
          <span className="mb-1 block text-stone-600">Số mục tối đa</span>
          <input type="number" min={1} max={100} className={small} disabled={disabled} value={r.maxItems ?? ''} onChange={(e) => set({ maxItems: numberOrUndefined(e.target.value) })} />
        </label>
      )}
      {field.type === 'enum' && (
        <label className="w-full">
          <span className="mb-1 block text-stone-600">Các lựa chọn (mỗi dòng một lựa chọn)</span>
          <textarea
            rows={3}
            className={input}
            disabled={disabled}
            value={(r.options ?? []).join('\n')}
            onChange={(e) => set({ options: e.target.value.split('\n') })}
            onBlur={(e) => set({ options: e.target.value.split('\n').map((o) => o.trim()).filter(Boolean) })}
          />
          {error('options') && <span className="mt-1 block text-danger">{error('options')}</span>}
        </label>
      )}
      {field.type === 'asset' && (
        <fieldset>
          <legend className="mb-1 text-stone-600">Loại asset được chọn (bỏ trống = tất cả)</legend>
          {(['IMAGE', 'PDF'] as const).map((kind) => (
            <label key={kind} className="mr-4 inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                disabled={disabled}
                checked={r.allowedKinds?.includes(kind) ?? false}
                onChange={(e) =>
                  set({ allowedKinds: e.target.checked ? [...(r.allowedKinds ?? []), kind] : (r.allowedKinds ?? []).filter((k) => k !== kind) })
                }
              />
              {kind === 'IMAGE' ? 'Ảnh' : 'PDF'}
            </label>
          ))}
        </fieldset>
      )}
      {field.type === 'fragment' && (
        <fieldset>
          <legend className="mb-1 text-stone-600">Model được chọn (bỏ trống = tất cả)</legend>
          {models.map((m) => (
            <label key={m.slug} className="mr-4 inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                disabled={disabled}
                checked={r.allowedModels?.includes(m.slug) ?? false}
                onChange={(e) =>
                  set({
                    allowedModels: e.target.checked ? [...(r.allowedModels ?? []), m.slug] : (r.allowedModels ?? []).filter((s) => s !== m.slug),
                  })
                }
              />
              {m.name}
            </label>
          ))}
          {error('allowedModels') && <span className="mt-1 block text-danger">{error('allowedModels')}</span>}
        </fieldset>
      )}
    </div>
  )
}

/**
 * Create or edit a model. Fields: label (the name follows it until typed by hand), type, required, multiple, help
 * and rules; dragged to reorder. Read-only without canManageModels. Removing or retyping a field that holds data
 * asks before dropping that data (canDelete).
 */
export default function ModelEditorPage() {
  const { id } = useParams()
  const isNew = id === undefined || id === 'new'
  const modelId = isNew ? null : Number(id)
  const session = useAuthorSession()
  const canEdit = session.canManageModels
  const toast = useToast()
  const navigate = useNavigate()
  const ids = { name: useId(), slug: useId(), description: useId(), status: useId() }

  const models = useAsync((signal) => cfApi.models(signal), [])
  const [loaded, setLoaded] = useState<ModelDetail | null>(null)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [form, setForm] = useState<Form>({ name: '', slug: '', description: '', status: 'DRAFT' })
  const [rows, setRows] = useState<Row[]>([])
  const nextKey = useRef(1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<{ affected: number; fields: string[] } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const toRows = (fields: FieldDef[]) => fields.map((field) => ({ key: nextKey.current++, field, named: true }))
  const snapshot = (f: Form, r: Row[]) => JSON.stringify([f, r.map((x) => x.field)])
  // A new model starts as "nothing typed yet"; an existing one is replaced once loaded
  const [initial, setInitial] = useState(() => snapshot({ name: '', slug: '', description: '', status: 'DRAFT' }, []))

  useEffect(() => {
    if (modelId === null) return
    const controller = new AbortController()
    cfApi.model(modelId, controller.signal).then(
      (m) => {
        setLoaded(m)
        const f = { name: m.name, slug: m.slug, description: m.description ?? '', status: m.status }
        const r = toRows(m.fields)
        setForm(f)
        setRows(r)
        setInitial(snapshot(f, r))
      },
      (err: Error) => {
        if (!controller.signal.aborted) setLoadError(err)
      },
    )
    return () => controller.abort()
  }, [modelId])

  const dirty = useMemo(() => snapshot(form, rows) !== initial, [form, rows, initial])

  const move = (_key: number, from: number, to: number) =>
    setRows((list) => {
      const next = [...list]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  const { dragging, rowProps, handleProps } = useDragReorder(rows, (r) => r.key, move)

  const updateField = (key: number, patch: Partial<FieldDef>, named?: boolean) =>
    setRows((list) =>
      list.map((r) => {
        if (r.key !== key) return r
        const field = { ...r.field, ...patch }
        if (patch.label !== undefined && !r.named && named === undefined) field.name = camelName(patch.label)
        if (patch.type !== undefined && !canBeMultiple(field.type)) field.multiple = false
        field.rules = rulesFor(field)
        return { ...r, field, named: named ?? r.named }
      }),
    )

  if (loadError) return <ErrorMessage message={loadError.message} />
  if (!isNew && !loaded) return <Spinner />

  const submit = async (dropFieldData = false) => {
    const fields = rows.map((r) => ({ ...r.field, rules: rulesFor(r.field), help: r.field.help?.trim() || null }))
    const local: Record<string, string> = {}
    if (!form.name.trim()) local.name = 'Nhập tên model'
    fields.forEach((f, i) => {
      if (!f.label.trim()) local[`fields[${i}].label`] = 'Nhập nhãn'
      if (!FIELD_NAME.test(f.name)) local[`fields[${i}].name`] = 'Tên field viết liền kiểu camelCase (vd. ctaLabel)'
    })
    if (Object.keys(local).length) {
      setErrors(local)
      return
    }
    const payload: ModelInput = {
      name: form.name.trim(),
      slug: isNew ? form.slug.trim() || undefined : undefined,
      description: form.description.trim() || null,
      status: form.status,
      fields,
      dropFieldData,
    }
    setSaving(true)
    setErrors({})
    setSaveError(null)
    try {
      const saved = modelId === null ? await cfApi.createModel(payload) : await cfApi.updateModel(modelId, payload)
      setConflict(null)
      toast({ message: `Đã lưu model “${saved.name}” (v${saved.version})`, tone: 'success' })
      const f = { name: saved.name, slug: saved.slug, description: saved.description ?? '', status: saved.status }
      const r = toRows(saved.fields)
      setLoaded(saved)
      setForm(f)
      setRows(r)
      setInitial(snapshot(f, r))
      if (modelId === null) navigate(`/author/fragments/models/${saved.id}`, { replace: true, state: { skipUnsavedGuard: true } })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MODEL_CHANGE_CONFLICT') {
        setConflict({ affected: Number(err.details.affectedFragments ?? 0), fields: (err.details.fields as string[] | undefined) ?? [] })
      } else if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(err.fieldErrors)
        setSaveError(err.message)
      } else {
        setSaveError(err instanceof Error ? err.message : 'Không lưu được')
      }
    } finally {
      setSaving(false)
    }
  }

  const removeModel = async () => {
    if (modelId === null) return
    try {
      await cfApi.deleteModel(modelId)
      toast({ message: 'Đã xoá model', tone: 'success' })
      navigate('/author/fragments/models', { state: { skipUnsavedGuard: true } })
    } catch (err) {
      setConfirmDelete(false)
      setSaveError(err instanceof Error ? err.message : 'Không xoá được')
    }
  }

  return (
    <>
      <UnsavedChangesGuard when={canEdit && dirty && !saving} />
      <Link to="/author/fragments/models" className="mb-3 inline-block text-sm text-stone-600 hover:text-indigo-700">
        ← Models
      </Link>
      <PageHeader title={isNew ? 'Model mới' : `${loaded?.name ?? ''} · v${loaded?.version ?? ''}`}>
        {canEdit && !isNew && (
          <button type="button" className={btn.secondary} onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden className="size-4" />
            Xoá model
          </button>
        )}
        {canEdit && (
          <button type="button" className={btn.primary} disabled={saving || (!isNew && !dirty)} onClick={() => void submit()}>
            {saving ? 'Đang lưu...' : 'Lưu model'}
          </button>
        )}
      </PageHeader>
      {!canEdit && <p className="mb-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">Bạn chỉ xem được model; chỉ ADMIN được sửa.</p>}
      {saveError && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">
          {saveError}
        </p>
      )}

      <section className={`${card} mb-6 grid gap-4 p-5 md:grid-cols-2`}>
        <div>
          <label htmlFor={ids.name} className="mb-1 block text-sm font-medium text-stone-700">
            Tên model
          </label>
          <input id={ids.name} className={input} disabled={!canEdit} value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {errors.name && <p className="mt-1 text-sm text-danger">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor={ids.slug} className="mb-1 block text-sm font-medium text-stone-700">
            Slug (dùng trong API)
          </label>
          <input
            id={ids.slug}
            className={`${input} font-mono`}
            disabled={!canEdit || !isNew}
            placeholder={isNew ? 'tự tạo từ tên' : undefined}
            value={form.slug}
            maxLength={80}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          {!isNew && <p className="mt-1 text-xs text-muted">Không đổi được sau khi tạo.</p>}
          {errors.slug && <p className="mt-1 text-sm text-danger">{errors.slug}</p>}
        </div>
        <div className="md:col-span-2">
          <label htmlFor={ids.description} className="mb-1 block text-sm font-medium text-stone-700">
            Mô tả
          </label>
          <input id={ids.description} className={input} disabled={!canEdit} value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label htmlFor={ids.status} className="mb-1 block text-sm font-medium text-stone-700">
            Trạng thái
          </label>
          <select id={ids.status} className={input} disabled={!canEdit} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ModelStatus })}>
            {(Object.keys(MODEL_STATUS_LABEL) as ModelStatus[]).map((s) => (
              <option key={s} value={s}>
                {MODEL_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Chỉ tạo được fragment từ model “Đang dùng”.</p>
        </div>
      </section>

      <h2 className="mb-3 text-lg font-bold text-stone-900">Field</h2>
      {errors.fields && <p className="mb-2 text-sm text-danger">{errors.fields}</p>}
      <ol className="flex flex-col gap-3" aria-label="Danh sách field">
        {rows.map((row, index) => {
          const at = `fields[${index}].`
          const f = row.field
          return (
            <li
              key={row.key}
              {...rowProps('fields', row.key, index)}
              className={`${card} flex gap-2 p-3 ${dragging === row.key ? 'border-indigo-500 shadow-lg' : ''}`}
            >
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Đổi thứ tự: ${f.label || f.name || 'field mới'}`}
                  className="flex size-9 shrink-0 cursor-grab items-center justify-center rounded-lg text-lg text-stone-400 hover:bg-stone-100"
                  {...handleProps('fields', row.key, index)}
                >
                  <span aria-hidden>⠿</span>
                </button>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-sm">
                    <span className="mb-1 block text-stone-600">Nhãn</span>
                    <input className={input} disabled={!canEdit} value={f.label} maxLength={100} onChange={(e) => updateField(row.key, { label: e.target.value })} />
                    {errors[`${at}label`] && <span className="mt-1 block text-danger">{errors[`${at}label`]}</span>}
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-stone-600">Tên (trong dữ liệu)</span>
                    <input
                      className={`${input} font-mono`}
                      disabled={!canEdit}
                      value={f.name}
                      maxLength={40}
                      onChange={(e) => updateField(row.key, { name: e.target.value }, true)}
                    />
                    {errors[`${at}name`] && <span className="mt-1 block text-danger">{errors[`${at}name`]}</span>}
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-stone-600">Kiểu</span>
                    <select className={input} disabled={!canEdit} value={f.type} onChange={(e) => updateField(row.key, { type: e.target.value as FieldDef['type'] })}>
                      {FIELD_TYPES.map((t) => (
                        <option key={t.type} value={t.type}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    {errors[`${at}type`] && <span className="mt-1 block text-danger">{errors[`${at}type`]}</span>}
                  </label>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" disabled={!canEdit} checked={f.required} onChange={(e) => updateField(row.key, { required: e.target.checked })} />
                    Bắt buộc khi publish
                  </label>
                  {canBeMultiple(f.type) && (
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" disabled={!canEdit} checked={f.multiple} onChange={(e) => updateField(row.key, { multiple: e.target.checked })} />
                      Nhiều giá trị
                    </label>
                  )}
                </div>
                <RulesEditor
                  field={f}
                  models={models.data ?? []}
                  disabled={!canEdit}
                  errors={errors}
                  at={at}
                  onChange={(rules) => setRows((list) => list.map((r) => (r.key === row.key ? { ...r, field: { ...r.field, rules } } : r)))}
                />
                <label className="text-sm">
                  <span className="mb-1 block text-stone-600">Hướng dẫn cho người soạn</span>
                  <input className={input} disabled={!canEdit} value={f.help ?? ''} maxLength={300} onChange={(e) => updateField(row.key, { help: e.target.value })} />
                </label>
              </div>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Bỏ field ${f.label || f.name || 'mới'}`}
                  onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-danger"
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </li>
          )
        })}
      </ol>
      {canEdit && (
        <button
          type="button"
          className={`${btn.secondary} mt-3`}
          onClick={() => setRows((list) => [...list, { key: nextKey.current++, field: emptyField(), named: false }])}
        >
          <Plus aria-hidden className="size-4" />
          Thêm field
        </button>
      )}

      {conflict && (
        <Dialog
          title="Field đang có dữ liệu"
          tone="danger"
          submitLabel={session.canDelete ? 'Lưu và xoá dữ liệu' : undefined}
          onSubmit={session.canDelete ? () => void submit(true) : undefined}
          pending={saving}
          onClose={() => setConflict(null)}
        >
          <p className="text-sm text-stone-700">
            {conflict.affected} fragment đang có dữ liệu ở field bị xoá hoặc đổi kiểu: <strong>{conflict.fields.join(', ')}</strong>.
          </p>
          <p className="text-sm text-stone-700">
            {session.canDelete
              ? 'Lưu tiếp sẽ xoá dữ liệu các field này khỏi bản đang soạn của các fragment đó (bản đã publish vẫn giữ cho tới lần publish sau).'
              : 'Chỉ quản trị viên được xoá dữ liệu này.'}
          </p>
        </Dialog>
      )}
      {confirmDelete && (
        <Dialog title="Xoá model?" tone="danger" submitLabel="Xoá" onSubmit={() => void removeModel()} onClose={() => setConfirmDelete(false)}>
          <p className="text-sm text-stone-600">Chỉ xoá được model chưa có fragment nào.</p>
        </Dialog>
      )}
    </>
  )
}
