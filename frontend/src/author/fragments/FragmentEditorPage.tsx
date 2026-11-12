import { Eye, RotateCcw, Trash2, Upload, Undo2 } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { btn, card, input } from '../../admin/styles'
import { Badge, Dialog, PageHeader, UnsavedChangesGuard } from '../../admin/ui'
import CopyButton from '../../components/CopyButton'
import { ErrorMessage, Spinner } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { ApiError } from '../../lib/api'
import { formatAdminDateTime } from '../../lib/format'
import { useAuthorSession } from '../AuthorSessionContext'
import { cfApi, FRAGMENT_STATUS_LABEL, STATUS_TONE, type FragmentData, type FragmentDetail, type ModelDetail, type PendingReference, type RefSummary } from './cfApi'
import { fromLocalInput, toLocalInput } from './cfDates'
import FieldInput from './FieldInput'

interface Form {
  title: string
  name: string
  folderPath: string
  data: FragmentData
  publishAt: string
  unpublishAt: string
  comment: string
}

const formOf = (f: FragmentDetail): Form => ({
  title: f.title,
  name: f.name,
  folderPath: f.folderPath,
  data: f.data,
  publishAt: toLocalInput(f.publishAt),
  unpublishAt: toLocalInput(f.unpublishAt),
  comment: '',
})

/** Empty values are not sent (the server drops them too), so "typed then cleared" is not a change. */
function cleanData(data: FragmentData): FragmentData {
  const out: FragmentData = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value)) {
      const items = value.filter((v) => v !== null && v !== undefined && v !== '')
      if (items.length) out[key] = items
    } else out[key] = value
  }
  return out
}

/**
 * Edit one fragment (or create one of the model in ?model=). The form comes from the model's fields. Top bar: status,
 * save, publish / unpublish (canPublish), preview link, delete (canDelete). Side panel: versions with restore, and
 * where the fragment is used.
 */
export default function FragmentEditorPage() {
  const { id } = useParams()
  const isNew = id === undefined || id === 'new'
  const [params] = useSearchParams()
  const session = useAuthorSession()
  const toast = useToast()
  const navigate = useNavigate()
  const ids = { title: useId(), name: useId(), folder: useId(), publishAt: useId(), unpublishAt: useId(), comment: useId() }

  const [fragment, setFragment] = useState<FragmentDetail | null>(null)
  const [model, setModel] = useState<ModelDetail | null>(null)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [initial, setInitial] = useState('')
  const [refs, setRefs] = useState<Record<string, RefSummary>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'publish' | 'unpublish' | 'preview' | 'delete' | 'rollback' | null>(null)
  const [pending, setPending] = useState<PendingReference[] | null>(null)
  const [restore, setRestore] = useState<{ id: string; versionNo: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const snapshot = (f: Form) => JSON.stringify({ ...f, data: cleanData(f.data), comment: '' })

  const show = (f: FragmentDetail) => {
    const next = formOf(f)
    setFragment(f)
    setModel(f.model)
    setForm(next)
    setInitial(snapshot(next))
    setRefs(f.refs)
  }

  useEffect(() => {
    const controller = new AbortController()
    if (isNew) {
      const modelId = Number(params.get('model'))
      cfApi.model(modelId, controller.signal).then(
        (m) => {
          const next: Form = { title: '', name: '', folderPath: params.get('folder') || '/', data: {}, publishAt: '', unpublishAt: '', comment: '' }
          setModel(m)
          setForm(next)
          setInitial(snapshot(next))
        },
        (err: Error) => !controller.signal.aborted && setLoadError(err),
      )
    } else {
      cfApi.fragment(id, controller.signal).then(show, (err: Error) => !controller.signal.aborted && setLoadError(err))
    }
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew])

  const dirty = useMemo(() => (form ? snapshot(form) !== initial : false), [form, initial])

  if (loadError) {
    return loadError instanceof ApiError && loadError.status === 404 ? (
      <>
        <PageHeader title="Không tìm thấy fragment" />
        <Link to="/author/fragments" className={btn.link}>
          Về danh sách
        </Link>
      </>
    ) : (
      <ErrorMessage message={loadError.message} />
    )
  }
  if (!model || !form) return <Spinner />

  const fail = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
      setErrors(err.fieldErrors)
      setMessage(err.message)
    } else {
      setMessage(err instanceof Error ? err.message : fallback)
    }
  }

  const save = async () => {
    if (!form.title.trim()) {
      setErrors({ title: 'Nhập tiêu đề' })
      return
    }
    setBusy('save')
    setErrors({})
    setMessage(null)
    try {
      const data = cleanData(form.data)
      if (isNew) {
        const created = await cfApi.create({ modelId: model.id, folderPath: form.folderPath, name: form.name || undefined, title: form.title, data })
        setInitial(snapshot(form))
        toast({ message: 'Đã tạo fragment', tone: 'success' })
        navigate(`/author/fragments/${created.id}`, { replace: true, state: { skipUnsavedGuard: true } })
        return
      }
      const saved = await cfApi.save(fragment!.id, {
        title: form.title,
        data,
        comment: form.comment.trim() || undefined,
        publishAt: fromLocalInput(form.publishAt),
        unpublishAt: fromLocalInput(form.unpublishAt),
      })
      show(saved)
      toast({ message: `Đã lưu (phiên bản ${saved.versions[0]?.versionNo ?? ''})`, tone: 'success' })
    } catch (err) {
      fail(err, 'Không lưu được')
    } finally {
      setBusy(null)
    }
  }

  const publish = async (along: boolean) => {
    if (!fragment) return
    setBusy('publish')
    setErrors({})
    setMessage(null)
    try {
      show(await cfApi.publish(fragment.id, along))
      setPending(null)
      toast({ message: 'Đã publish', tone: 'success' })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNPUBLISHED_REFERENCES') {
        setPending((err.details.references as PendingReference[] | undefined) ?? [])
      } else {
        setPending(null)
        fail(err, 'Không publish được')
      }
    } finally {
      setBusy(null)
    }
  }

  const act = async (kind: 'unpublish' | 'preview' | 'delete' | 'rollback') => {
    if (!fragment) return
    setBusy(kind)
    setMessage(null)
    try {
      if (kind === 'unpublish') {
        show(await cfApi.unpublish(fragment.id))
        toast({ message: 'Đã gỡ publish', tone: 'success' })
      } else if (kind === 'preview') {
        setPreviewUrl((await cfApi.previewLink(fragment.id)).url)
      } else if (kind === 'delete') {
        await cfApi.remove(fragment.id)
        toast({ message: 'Đã xoá fragment', tone: 'success' })
        navigate('/author/fragments', { state: { skipUnsavedGuard: true } })
      } else if (kind === 'rollback' && restore) {
        show(await cfApi.rollback(fragment.id, restore.id))
        toast({ message: `Đã khôi phục phiên bản ${restore.versionNo}`, tone: 'success' })
      }
    } catch (err) {
      fail(err, 'Không thực hiện được')
    } finally {
      setBusy(null)
      setRestore(null)
      setConfirmDelete(false)
    }
  }

  const setValue = (name: string, value: unknown) => setForm({ ...form, data: { ...form.data, [name]: value } })
  const published = fragment?.publishedVersionId != null
  const latest = fragment?.versions[0]

  return (
    <>
      <UnsavedChangesGuard when={dirty && busy === null} />
      <Link to="/author/fragments" className="mb-3 inline-block text-sm text-stone-600 hover:text-indigo-700">
        ← Fragments
      </Link>
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:top-0 lg:-mx-8 lg:px-8">
        <PageHeader title={isNew ? `${model.name} mới` : form.title || fragment?.title || ''}>
          {fragment && (
            <span className="self-center">
              <Badge tone={STATUS_TONE[fragment.status]}>{FRAGMENT_STATUS_LABEL[fragment.status]}</Badge>
            </span>
          )}
          <button type="button" className={btn.primary} disabled={busy !== null || (!isNew && !dirty)} onClick={() => void save()}>
            {busy === 'save' ? 'Đang lưu...' : 'Lưu'}
          </button>
          {fragment && session.canPublish && (
            <button
              type="button"
              className={btn.secondary}
              disabled={busy !== null || dirty || fragment.status === 'PUBLISHED'}
              title={dirty ? 'Lưu trước khi publish' : undefined}
              onClick={() => void publish(false)}
            >
              <Upload aria-hidden className="size-4" />
              Publish
            </button>
          )}
          {fragment && session.canPublish && published && (
            <button type="button" className={btn.secondary} disabled={busy !== null} onClick={() => void act('unpublish')}>
              <Undo2 aria-hidden className="size-4" />
              Unpublish
            </button>
          )}
          {fragment && (
            <button type="button" className={btn.secondary} disabled={busy !== null} onClick={() => void act('preview')}>
              <Eye aria-hidden className="size-4" />
              Xem preview
            </button>
          )}
          {fragment && session.canDelete && (
            <button type="button" className={btn.secondary} disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden className="size-4" />
              Xoá
            </button>
          )}
        </PageHeader>
        <p className="-mt-4 text-xs text-muted">
          {model.name} · {form.folderPath}
          {fragment && ` · ${fragment.name}`}
          {fragment?.status === 'MODIFIED' && ' · Bản đang soạn khác bản đã publish'}
        </p>
      </div>

      {message && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">
          {message}
        </p>
      )}
      {previewUrl && (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm">
          <p className="font-medium text-indigo-900">Link xem bản đang soạn (hết hạn sau 24 giờ)</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className={btn.link}>
              Mở preview
            </a>
            <CopyButton text={`${window.location.origin}${previewUrl}`} label="Copy link preview" />
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className={`${card} flex flex-col gap-5 p-5`} aria-label="Nội dung">
          <div>
            <label htmlFor={ids.title} className="mb-1 block text-sm font-medium text-stone-700">
              Tiêu đề <span className="text-danger">*</span>
            </label>
            <input id={ids.title} className={input} value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            {errors.title && <p className="mt-1 text-sm text-danger">{errors.title}</p>}
          </div>
          {isNew && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor={ids.folder} className="mb-1 block text-sm font-medium text-stone-700">
                  Thư mục
                </label>
                <input id={ids.folder} className={`${input} font-mono`} value={form.folderPath} onChange={(e) => setForm({ ...form, folderPath: e.target.value })} />
                {errors.folderPath && <p className="mt-1 text-sm text-danger">{errors.folderPath}</p>}
              </div>
              <div>
                <label htmlFor={ids.name} className="mb-1 block text-sm font-medium text-stone-700">
                  Tên (trong đường dẫn)
                </label>
                <input id={ids.name} className={`${input} font-mono`} placeholder="tự tạo từ tiêu đề" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                {errors.name && <p className="mt-1 text-sm text-danger">{errors.name}</p>}
              </div>
            </div>
          )}
          {model.fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={form.data[field.name]}
              onChange={(v) => setValue(field.name, v)}
              error={errors[`data.${field.name}`]}
              refs={refs}
              onRef={(ref) => setRefs((r) => ({ ...r, [ref.id]: ref }))}
              self={fragment?.id}
            />
          ))}
          {!isNew && (
            <details className="rounded-xl border border-stone-200 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-stone-700">Lịch hiển thị và ghi chú phiên bản</summary>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor={ids.publishAt} className="mb-1 block text-stone-600">
                    Hiện từ (giờ Việt Nam)
                  </label>
                  <input id={ids.publishAt} type="datetime-local" className={input} value={form.publishAt} onChange={(e) => setForm({ ...form, publishAt: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={ids.unpublishAt} className="mb-1 block text-stone-600">
                    Ẩn từ
                  </label>
                  <input id={ids.unpublishAt} type="datetime-local" className={input} value={form.unpublishAt} onChange={(e) => setForm({ ...form, unpublishAt: e.target.value })} />
                  {errors.unpublishAt && <p className="mt-1 text-danger">{errors.unpublishAt}</p>}
                </div>
                <div className="md:col-span-2">
                  <label htmlFor={ids.comment} className="mb-1 block text-stone-600">
                    Ghi chú cho lần lưu này
                  </label>
                  <input id={ids.comment} className={input} maxLength={300} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
                </div>
              </div>
            </details>
          )}
        </section>

        {fragment && (
          <aside className="flex flex-col gap-6">
            <section className={`${card} p-4`} aria-labelledby="cf-versions">
              <h2 id="cf-versions" className="mb-2 font-bold text-stone-900">
                Lịch sử phiên bản
              </h2>
              <ol className="flex flex-col gap-2 text-sm">
                {fragment.versions.map((v) => (
                  <li key={v.id} className="rounded-lg border border-stone-100 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-900">
                        Phiên bản {v.versionNo}
                        {v.published && (
                          <span className="ml-1.5">
                            <Badge tone="green">Đang publish</Badge>
                          </span>
                        )}
                      </span>
                      {v.id !== latest?.id && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
                          disabled={busy !== null}
                          onClick={() => setRestore({ id: v.id, versionNo: v.versionNo })}
                        >
                          <RotateCcw aria-hidden className="size-3.5" />
                          Khôi phục
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {formatAdminDateTime(v.createdAt)}
                      {v.createdByName && ` · ${v.createdByName}`}
                    </p>
                    {v.comment && <p className="mt-0.5 text-xs text-stone-700">{v.comment}</p>}
                  </li>
                ))}
              </ol>
            </section>
            <section className={`${card} p-4`} aria-labelledby="cf-usages">
              <h2 id="cf-usages" className="mb-2 font-bold text-stone-900">
                Được dùng ở đâu
              </h2>
              {fragment.usages.length === 0 ? (
                <p className="text-sm text-muted">Chưa được dùng ở đâu.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {fragment.usages.map((u) => (
                    <li key={`${u.sourceType}:${u.sourceId}`}>
                      {u.sourceType === 'FRAGMENT' ? (
                        <Link to={`/author/fragments/${u.sourceId}`} className="text-indigo-700 hover:underline">
                          {u.title ?? u.sourceId}
                        </Link>
                      ) : (
                        <span>
                          Trang <span className="font-mono">{u.sourceId}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        )}
      </div>

      {pending && (
        <Dialog
          title="Có fragment chưa publish"
          submitLabel="Publish cùng lúc"
          pending={busy === 'publish'}
          onSubmit={() => void publish(true)}
          onClose={() => setPending(null)}
        >
          <p className="text-sm text-stone-700">Fragment này dùng các fragment chưa từng publish. Chúng sẽ được publish cùng lúc:</p>
          <ul className="list-disc pl-5 text-sm">
            {pending.map((p) => (
              <li key={p.id}>
                {p.title} <span className="text-muted">({p.model})</span>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {restore && (
        <Dialog
          title={`Khôi phục phiên bản ${restore.versionNo}?`}
          submitLabel="Khôi phục"
          pending={busy === 'rollback'}
          onSubmit={() => void act('rollback')}
          onClose={() => setRestore(null)}
        >
          <p className="text-sm text-stone-600">
            Nội dung đang soạn sẽ thành nội dung của phiên bản {restore.versionNo} (lưu thành phiên bản mới, không mất phiên bản nào).
            {dirty && ' Các thay đổi chưa lưu sẽ mất.'}
          </p>
        </Dialog>
      )}
      {confirmDelete && (
        <Dialog title="Xoá fragment?" tone="danger" submitLabel="Xoá" pending={busy === 'delete'} onSubmit={() => void act('delete')} onClose={() => setConfirmDelete(false)}>
          <p className="text-sm text-stone-600">Fragment và mọi phiên bản của nó sẽ bị xoá. Không xoá được khi đang được dùng ở nơi khác.</p>
        </Dialog>
      )}
    </>
  )
}
