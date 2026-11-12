import { ArrowDown, ArrowUp, ExternalLink, History, Link2, Plus, RotateCcw, Trash2, Undo2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { btn, card, input } from '../../admin/styles'
import { useDragReorder } from '../../admin/useDragReorder'
import { Badge, Dialog, UnsavedChangesGuard } from '../../admin/ui'
import CopyButton from '../../components/CopyButton'
import { ErrorMessage, Spinner } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { ApiError } from '../../lib/api'
import { formatAdminDateTime } from '../../lib/format'
import { numericKey } from '../../lib/numericKey'
import { allowedTypes, componentDef, newBlock, REGISTRY, type PageContent, type StoredBlock } from '../../cms/registry'
import { useAuthorSession } from '../AuthorSessionContext'
import { fromLocalInput, toLocalInput } from '../fragments/cfDates'
import { FRAGMENT_STATUS_LABEL, STATUS_TONE, type PendingReference, type RefSummary } from '../fragments/cfApi'
import PropInput from './PropInput'
import { sitesApi, type PageDetail, type PageProperties } from './sitesApi'

interface Form {
  title: string
  content: PageContent
  properties: PageProperties
  publishAt: string
  unpublishAt: string
}

const formOf = (p: PageDetail): Form => ({
  title: p.title,
  content: p.content?.regions?.main ? p.content : { regions: { main: [] } },
  properties: p.properties ?? {},
  publishAt: toLocalInput(p.publishAt),
  unpublishAt: toLocalInput(p.unpublishAt),
})

// ---- block tree helpers ----------------------------------------------------------------------------------

function findBlock(blocks: StoredBlock[], id: string): StoredBlock | undefined {
  for (const b of blocks) {
    if (b.id === id) return b
    const inside = b.children && findBlock(b.children, id)
    if (inside) return inside
  }
  return undefined
}

const mapBlocks = (blocks: StoredBlock[], id: string, fn: (b: StoredBlock) => StoredBlock): StoredBlock[] =>
  blocks.map((b) => (b.id === id ? fn(b) : b.children ? { ...b, children: mapBlocks(b.children, id, fn) } : b))

const removeBlock = (blocks: StoredBlock[], id: string): StoredBlock[] =>
  blocks.filter((b) => b.id !== id).map((b) => (b.children ? { ...b, children: removeBlock(b.children, id) } : b))

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** A few words to tell blocks of the same type apart in the list. */
function summary(block: StoredBlock): string {
  const p = block.props
  const text = [p.headline, p.title, p.text, p.markdown, p.caption, p.label].find((v) => typeof v === 'string' && v.trim())
  return typeof text === 'string' ? text.replace(/[#*_>`[\]]/g, '').slice(0, 48) : ''
}

// ---- the editor ------------------------------------------------------------------------------------------

/**
 * Edit one CMS page. Left: the page's components (drag to reorder, add from the template's palette; a container
 * holds its own list). Middle: the working copy in an iframe (preview link), reloaded after every save. Right: the
 * props form of the selected component, generated from the registry, or the page properties. Top: save, preview
 * link, publish / unpublish (canPublish), history, delete (canDelete).
 */
export default function PageEditorPage() {
  const { id = '' } = useParams()
  const session = useAuthorSession()
  const toast = useToast()
  const navigate = useNavigate()
  const ids = { title: useId(), name: useId(), publishAt: useId(), unpublishAt: useId() }

  const [page, setPage] = useState<PageDetail | null>(null)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [initial, setInitial] = useState('')
  const [refs, setRefs] = useState<Record<string, RefSummary>>({})
  const [selected, setSelected] = useState<string>('page')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [frameKey, setFrameKey] = useState(0)
  const [palette, setPalette] = useState<{ parentId: string | null } | null>(null)
  const [pending, setPending] = useState<PendingReference[] | null>(null)
  const [history, setHistory] = useState(false)
  const [restore, setRestore] = useState<{ id: string; versionNo: number } | null>(null)
  const [deleting, setDeleting] = useState<{ childCount: number } | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [linkShown, setLinkShown] = useState(false)

  const snapshot = (f: Form) => JSON.stringify(f)
  const show = useCallback((p: PageDetail) => {
    const next = formOf(p)
    setPage(p)
    setForm(next)
    setInitial(JSON.stringify(next))
    setRefs(p.refs)
    setNameDraft(p.name)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    sitesApi.page(id, controller.signal).then(show, (err: Error) => !controller.signal.aborted && setLoadError(err))
    sitesApi.previewLink(id).then(
      (link) => !controller.signal.aborted && setPreviewUrl(link.url),
      () => {
        // The editor still works without the preview pane
      },
    )
    return () => controller.abort()
  }, [id, show])

  const dirty = useMemo(() => (form ? snapshot(form) !== initial : false), [form, initial])

  // Numeric keys for drag and drop, stable per block id
  const keyOf = numericKey
  const blocks = form?.content.regions.main ?? []
  const setBlocks = (next: StoredBlock[]) => form && setForm({ ...form, content: { regions: { main: next } } })
  const { dragging, rowProps, handleProps } = useDragReorder(blocks, (b) => keyOf(b.id), (_k, from, to) => setBlocks(move(blocks, from, to)))

  if (loadError) {
    return loadError instanceof ApiError && loadError.status === 404 ? (
      <p className="text-stone-600">
        Không tìm thấy trang.{' '}
        <Link to="/author/sites" className={btn.link}>
          Về Sites
        </Link>
      </p>
    ) : (
      <ErrorMessage message={loadError.message} />
    )
  }
  if (!page || !form) return <Spinner />

  const fail = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
      setErrors(err.fieldErrors)
      setMessage(err.message)
      // Show the first component with a problem
      const first = Object.keys(err.fieldErrors).find((k) => k.startsWith('blocks.'))
      if (first) setSelected(first.split('.')[1])
      else if (Object.keys(err.fieldErrors).some((k) => k.startsWith('properties.'))) setSelected('page')
    } else {
      setMessage(err instanceof Error ? err.message : fallback)
    }
  }

  const act = async (name: string, action: () => Promise<void>, fallback: string) => {
    setBusy(name)
    setMessage(null)
    try {
      await action()
    } catch (err) {
      fail(err, fallback)
    } finally {
      setBusy(null)
    }
  }

  const save = () =>
    act(
      'save',
      async () => {
        if (!form.title.trim()) {
          setErrors({ title: 'Nhập tiêu đề' })
          setSelected('page')
          return
        }
        setErrors({})
        const saved = await sitesApi.save(page.id, {
          title: form.title.trim(),
          content: form.content,
          properties: form.properties,
          publishAt: fromLocalInput(form.publishAt),
          unpublishAt: fromLocalInput(form.unpublishAt),
        })
        show(saved)
        setFrameKey((k) => k + 1)
        toast({ message: `Đã lưu (phiên bản ${saved.versions[0]?.versionNo ?? ''})`, tone: 'success' })
      },
      'Không lưu được',
    )

  const publish = (along: boolean) =>
    act(
      'publish',
      async () => {
        try {
          show(await sitesApi.publish(page.id, along))
          setPending(null)
          setErrors({})
          toast({ message: 'Đã publish', tone: 'success' })
        } catch (err) {
          if (err instanceof ApiError && err.code === 'UNPUBLISHED_REFERENCES') {
            setPending((err.details.references as PendingReference[] | undefined) ?? [])
            return
          }
          setPending(null)
          throw err
        }
      },
      'Không publish được',
    )

  const remove = (includeChildren: boolean) =>
    act(
      'delete',
      async () => {
        try {
          await sitesApi.remove(page.id, includeChildren)
          toast({ message: 'Đã xoá trang', tone: 'success' })
          navigate('/author/sites', { state: { skipUnsavedGuard: true } })
        } catch (err) {
          if (err instanceof ApiError && err.code === 'PAGE_HAS_CHILDREN') {
            setDeleting({ childCount: Number(err.details.childCount ?? 0) })
            return
          }
          setDeleting(null)
          throw err
        }
      },
      'Không xoá được',
    )

  const addBlock = (type: string) => {
    const block = newBlock(type)
    const parentId = palette?.parentId ?? null
    setBlocks(parentId ? mapBlocks(blocks, parentId, (b) => ({ ...b, children: [...(b.children ?? []), block] })) : [...blocks, block])
    setSelected(block.id)
    setPalette(null)
  }

  const selectedBlock = selected === 'page' ? undefined : findBlock(blocks, selected)
  const selectedDef = selectedBlock && componentDef(selectedBlock.type)
  const hasError = (blockId: string) => Object.keys(errors).some((k) => k.startsWith(`blocks.${blockId}.`))
  const published = page.publishedVersionId !== null
  const latest = page.versions[0]

  const blockButton = (b: StoredBlock) => (
    <button
      type="button"
      onClick={() => setSelected(b.id)}
      aria-current={selected === b.id ? 'true' : undefined}
      className="min-w-0 flex-1 text-left"
    >
      <span className="block text-sm font-semibold text-stone-900">
        {componentDef(b.type)?.label ?? b.type}
        {hasError(b.id) && <span className="ml-1.5 text-xs font-semibold text-danger">· cần sửa</span>}
      </span>
      {summary(b) && <span className="block truncate text-xs text-muted">{summary(b)}</span>}
    </button>
  )

  return (
    <>
      <UnsavedChangesGuard when={dirty && busy === null} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/author/sites" className="text-sm text-stone-600 hover:text-indigo-700">
          ← Sites
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-stone-900">
          {form.title || page.title} <span className="font-mono text-sm font-normal text-muted">{page.path}</span>
        </h1>
        <Badge tone={STATUS_TONE[page.status]}>{FRAGMENT_STATUS_LABEL[page.status]}</Badge>
        <button type="button" className={btn.primary} disabled={busy !== null || !dirty} onClick={() => void save()}>
          {busy === 'save' ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button type="button" className={btn.secondary} disabled={!previewUrl} onClick={() => setLinkShown((v) => !v)}>
          <Link2 aria-hidden className="size-4" />
          Preview link
        </button>
        {session.canPublish && (
          <button
            type="button"
            className={btn.secondary}
            disabled={busy !== null || dirty || page.status === 'PUBLISHED'}
            title={dirty ? 'Lưu trước khi publish' : undefined}
            onClick={() => void publish(false)}
          >
            <Upload aria-hidden className="size-4" />
            Publish
          </button>
        )}
        {session.canPublish && published && (
          <button type="button" className={btn.secondary} disabled={busy !== null} onClick={() => void act('unpublish', async () => show(await sitesApi.unpublish(page.id)), 'Không gỡ được')}>
            <Undo2 aria-hidden className="size-4" />
            Unpublish
          </button>
        )}
        <button type="button" className={btn.secondary} onClick={() => setHistory(true)}>
          <History aria-hidden className="size-4" />
          Lịch sử version
        </button>
        {session.canDelete && (
          <button type="button" className={btn.secondary} aria-label="Xoá trang" disabled={busy !== null} onClick={() => setDeleting({ childCount: 0 })}>
            <Trash2 aria-hidden className="size-4" />
          </button>
        )}
      </div>

      {message && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">
          {message}
        </p>
      )}
      {linkShown && previewUrl && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm">
          <span className="font-medium text-indigo-900">Link xem bản đang soạn (24 giờ):</span>
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className={btn.link}>
            Mở preview
          </a>
          <CopyButton text={`${window.location.origin}${previewUrl}`} label="Copy link preview" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_22rem]">
        {/* Left: components */}
        <section className={`${card} flex flex-col gap-2 p-3`} aria-label="Component của trang">
          <button
            type="button"
            onClick={() => setSelected('page')}
            aria-current={selected === 'page' ? 'true' : undefined}
            className={`rounded-lg px-3 py-2 text-left text-sm font-semibold ${selected === 'page' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-800'}`}
          >
            Thuộc tính trang
            {Object.keys(errors).some((k) => k.startsWith('properties.') || k === 'title') && <span className="ml-1.5 text-xs">· cần sửa</span>}
          </button>
          <ol className="flex flex-col gap-1.5" aria-label="Danh sách component">
            {blocks.map((b, index) => (
              <li key={b.id}>
                <div
                  {...rowProps('blocks', keyOf(b.id), index)}
                  className={`flex items-start gap-1 rounded-lg border p-1.5 ${selected === b.id ? 'border-indigo-500 bg-indigo-50' : 'border-stone-200 bg-white'} ${dragging === keyOf(b.id) ? 'shadow-lg' : ''}`}
                >
                  <button
                    type="button"
                    aria-label={`Đổi thứ tự: ${componentDef(b.type)?.label ?? b.type}`}
                    className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-stone-400 hover:bg-stone-100"
                    {...handleProps('blocks', keyOf(b.id), index)}
                  >
                    <span aria-hidden>⠿</span>
                  </button>
                  {blockButton(b)}
                  <button
                    type="button"
                    aria-label={`Bỏ ${componentDef(b.type)?.label ?? b.type}`}
                    onClick={() => {
                      setBlocks(removeBlock(blocks, b.id))
                      if (selected === b.id) setSelected('page')
                    }}
                    className="flex size-7 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-danger"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
                {b.children && (
                  <div className="mt-1 ml-4 flex flex-col gap-1 border-l border-stone-200 pl-2">
                    {b.children.map((c, ci) => (
                      <div key={c.id} className={`flex items-start gap-1 rounded-lg border p-1.5 ${selected === c.id ? 'border-indigo-500 bg-indigo-50' : 'border-stone-200 bg-white'}`}>
                        {blockButton(c)}
                        <button
                          type="button"
                          aria-label={`Đưa ${componentDef(c.type)?.label ?? c.type} lên`}
                          disabled={ci === 0}
                          onClick={() => setBlocks(mapBlocks(blocks, b.id, (x) => ({ ...x, children: move(x.children ?? [], ci, ci - 1) })))}
                          className="flex size-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                        >
                          <ArrowUp aria-hidden className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Đưa ${componentDef(c.type)?.label ?? c.type} xuống`}
                          disabled={ci === b.children!.length - 1}
                          onClick={() => setBlocks(mapBlocks(blocks, b.id, (x) => ({ ...x, children: move(x.children ?? [], ci, ci + 1) })))}
                          className="flex size-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                        >
                          <ArrowDown aria-hidden className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Bỏ ${componentDef(c.type)?.label ?? c.type}`}
                          onClick={() => {
                            setBlocks(removeBlock(blocks, c.id))
                            if (selected === c.id) setSelected(b.id)
                          }}
                          className="flex size-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-danger"
                        >
                          <X aria-hidden className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    <button type="button" className="self-start text-xs font-semibold text-indigo-700 hover:underline" onClick={() => setPalette({ parentId: b.id })}>
                      + Thêm vào khung
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <button type="button" className={`${btn.secondary} mt-1`} onClick={() => setPalette({ parentId: null })}>
            <Plus aria-hidden className="size-4" />
            Thêm component
          </button>
        </section>

        {/* Middle: preview of the saved working copy */}
        <section className={`${card} hidden min-h-[32rem] flex-col overflow-hidden lg:flex`} aria-label="Xem trước">
          <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-3 py-2 text-xs text-muted">
            <span>{dirty ? 'Xem trước bản đã lưu · lưu để cập nhật' : 'Xem trước bản đã lưu'}</span>
            {previewUrl && (
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-700">
                <ExternalLink aria-hidden className="size-3.5" />
                Tab mới
              </a>
            )}
          </div>
          {previewUrl ? (
            <iframe key={frameKey} src={previewUrl} title="Xem trước trang" className="min-h-[32rem] w-full flex-1 bg-white" />
          ) : (
            <p className="p-6 text-sm text-muted">Chưa mở được bản xem trước.</p>
          )}
        </section>

        {/* Right: props of the selected component, or the page properties */}
        <section className={`${card} flex flex-col gap-4 p-4`} aria-label="Thuộc tính">
          {selectedBlock && selectedDef ? (
            <>
              <h2 className="font-bold text-stone-900">{selectedDef.label}</h2>
              {selectedDef.props.map((prop) => (
                <PropInput
                  key={`${selectedBlock.id}:${prop.name}`}
                  prop={prop}
                  value={selectedBlock.props[prop.name]}
                  error={errors[`blocks.${selectedBlock.id}.props.${prop.name}`]}
                  refs={refs}
                  onRef={(ref) => setRefs((r) => ({ ...r, [ref.id]: ref }))}
                  onChange={(v) => setBlocks(mapBlocks(blocks, selectedBlock.id, (b) => ({ ...b, props: { ...b.props, [prop.name]: v } })))}
                />
              ))}
              {errors[`blocks.${selectedBlock.id}.type`] && <p className="text-sm text-danger">{errors[`blocks.${selectedBlock.id}.type`]}</p>}
            </>
          ) : (
            <>
              <h2 className="font-bold text-stone-900">Thuộc tính trang</h2>
              <div>
                <label htmlFor={ids.title} className="mb-1 block text-sm font-medium text-stone-700">
                  Tiêu đề <span className="text-danger">*</span>
                </label>
                <input id={ids.title} className={input} value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                {errors.title && <p className="mt-1 text-sm text-danger">{errors.title}</p>}
              </div>
              <div>
                <label htmlFor={ids.name} className="mb-1 block text-sm font-medium text-stone-700">
                  Tên trong đường dẫn
                </label>
                <div className="flex gap-2">
                  <input id={ids.name} className={`${input} font-mono`} value={nameDraft} maxLength={120} onChange={(e) => setNameDraft(e.target.value)} />
                  <button
                    type="button"
                    className={btn.secondary}
                    disabled={busy !== null || !nameDraft.trim() || nameDraft === page.name}
                    onClick={() =>
                      void act(
                        'rename',
                        async () => {
                          const renamed = await sitesApi.rename(page.id, nameDraft)
                          setPage(renamed)
                          setNameDraft(renamed.name)
                          toast({ message: `Đường dẫn mới: ${renamed.path}. Địa chỉ cũ sẽ tự chuyển hướng.`, tone: 'success' })
                        },
                        'Không đổi được đường dẫn',
                      )
                    }
                  >
                    Đổi
                  </button>
                </div>
                {errors.name && <p className="mt-1 text-sm text-danger">{errors.name}</p>}
                {page.oldPaths.length > 0 && <p className="mt-1 text-xs text-muted">Địa chỉ cũ chuyển về đây: {page.oldPaths.join(', ')}</p>}
              </div>
              {REGISTRY.pageProperties.map((prop) => (
                <PropInput
                  key={prop.name}
                  prop={prop}
                  value={form.properties[prop.name]}
                  error={errors[`properties.${prop.name}`]}
                  refs={refs}
                  onRef={(ref) => setRefs((r) => ({ ...r, [ref.id]: ref }))}
                  onChange={(v) => setForm({ ...form, properties: { ...form.properties, [prop.name]: v } })}
                />
              ))}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <label htmlFor={ids.publishAt} className="mb-1 block text-sm font-medium text-stone-700">
                    Hiện từ (giờ Việt Nam)
                  </label>
                  <input id={ids.publishAt} type="datetime-local" className={input} value={form.publishAt} onChange={(e) => setForm({ ...form, publishAt: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={ids.unpublishAt} className="mb-1 block text-sm font-medium text-stone-700">
                    Ẩn từ
                  </label>
                  <input id={ids.unpublishAt} type="datetime-local" className={input} value={form.unpublishAt} onChange={(e) => setForm({ ...form, unpublishAt: e.target.value })} />
                  {errors.unpublishAt && <p className="mt-1 text-sm text-danger">{errors.unpublishAt}</p>}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {palette && (
        <Dialog title={palette.parentId ? 'Thêm vào khung nhiều cột' : 'Thêm component'} onClose={() => setPalette(null)} width="36rem">
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Bảng component">
            {allowedTypes(page.template, palette.parentId !== null).map((type) => (
              <li key={type}>
                <button type="button" onClick={() => addBlock(type)} className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-left text-sm font-medium hover:border-indigo-400 hover:bg-indigo-50">
                  {componentDef(type)?.label ?? type}
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {pending && (
        <Dialog title="Có fragment chưa publish" submitLabel="Publish cùng lúc" pending={busy === 'publish'} onSubmit={() => void publish(true)} onClose={() => setPending(null)}>
          <p className="text-sm text-stone-700">Trang dùng các fragment chưa từng publish. Chúng sẽ được publish cùng lúc:</p>
          <ul className="list-disc pl-5 text-sm">
            {pending.map((p) => (
              <li key={p.id}>
                {p.title} <span className="text-muted">({p.model})</span>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {history && (
        <Dialog title="Lịch sử version" onClose={() => setHistory(false)} width="32rem">
          <ol className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto text-sm">
            {page.versions.map((v) => (
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
                  {v.comment && ` · ${v.comment}`}
                </p>
              </li>
            ))}
          </ol>
        </Dialog>
      )}
      {restore && (
        <Dialog
          title={`Khôi phục phiên bản ${restore.versionNo}?`}
          submitLabel="Khôi phục"
          pending={busy === 'rollback'}
          onClose={() => setRestore(null)}
          onSubmit={() =>
            void act(
              'rollback',
              async () => {
                show(await sitesApi.rollback(page.id, restore.id))
                setRestore(null)
                setHistory(false)
                setFrameKey((k) => k + 1)
                toast({ message: `Đã khôi phục phiên bản ${restore.versionNo}`, tone: 'success' })
              },
              'Không khôi phục được',
            )
          }
        >
          <p className="text-sm text-stone-600">Nội dung đang soạn sẽ thành nội dung của phiên bản này (lưu thành phiên bản mới).</p>
        </Dialog>
      )}
      {deleting && (
        <Dialog
          title={deleting.childCount ? `Xoá trang và ${deleting.childCount} trang con?` : 'Xoá trang?'}
          tone="danger"
          submitLabel={deleting.childCount ? 'Xoá cả trang con' : 'Xoá'}
          pending={busy === 'delete'}
          onClose={() => setDeleting(null)}
          onSubmit={() => void remove(deleting.childCount > 0)}
        >
          <p className="text-sm text-stone-600">
            {deleting.childCount
              ? `Trang này có ${deleting.childCount} trang con. Tất cả sẽ bị xoá cùng mọi phiên bản.`
              : 'Trang và mọi phiên bản của nó sẽ bị xoá; địa chỉ của trang sẽ báo không tìm thấy.'}
          </p>
        </Dialog>
      )}
    </>
  )
}
