import { ArrowLeft, ExternalLink, FolderInput, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { btn, card, input } from '../../admin/styles'
import { Dialog, Field, PageHeader, UnsavedChangesGuard } from '../../admin/ui'
import CopyButton from '../../components/CopyButton'
import { ErrorMessage, Spinner } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { ApiError } from '../../lib/api'
import { formatAdminDateTime } from '../../lib/format'
import { useAuthorSession } from '../AuthorSessionContext'
import { dimensions, formatBytes, KIND_LABEL } from './assetFormat'
import { damApi, type AssetDetail, type AssetUsage, type FolderNode, type MetadataInput } from './damApi'
import { FolderSelect } from './FolderTree'
import TagInput from './TagInput'
import { acceptFor, uploadProblem } from './uploadRules'

const SOURCE_LABEL: Record<AssetUsage['sourceType'], string> = { PAGE: 'Trang (Sites)', FRAGMENT: 'Content Fragment' }

const RENDITION_LABEL: Record<string, string> = {
  thumb: 'Thumbnail (240×240)',
  card: 'Thẻ (rộng 600)',
  hero: 'Banner lớn (rộng 1600)',
  og: 'Ảnh chia sẻ mạng xã hội (1200×630)',
}

const formOf = (a: AssetDetail): MetadataInput => ({ title: a.title, alt: a.alt, description: a.description, tags: a.tags })

const sameForm = (a: MetadataInput, b: MetadataInput) =>
  a.title === b.title &&
  (a.alt ?? '') === (b.alt ?? '') &&
  (a.description ?? '') === (b.description ?? '') &&
  a.tags.join('\n') === b.tags.join('\n')

function Usages({ usages }: { usages: AssetUsage[] }) {
  if (!usages.length) return <p className="text-sm text-muted">Chưa được dùng ở đâu.</p>
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {usages.map((u) => (
        <li key={`${u.sourceType}:${u.sourceId}`}>
          <span className="font-medium text-stone-900">{SOURCE_LABEL[u.sourceType] ?? u.sourceType}</span>{' '}
          <span className="text-stone-600">{u.sourceId}</span>
        </li>
      ))}
    </ul>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-stone-100 py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right break-words text-stone-900">{children}</dd>
    </div>
  )
}

/**
 * One asset: large preview, metadata form (title required, alt expected on images), file facts, the stable link and
 * renditions to copy, and the actions: replace the file (same kind), move, delete (canDelete, and only when nothing
 * uses it).
 */
export default function AssetDetailPage() {
  const { id = '' } = useParams()
  const session = useAuthorSession()
  const toast = useToast()
  const navigate = useNavigate()
  const tagsId = useId()

  const [asset, setAsset] = useState<AssetDetail | null>(null)
  const [loadError, setLoadError] = useState<ApiError | Error | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [form, setForm] = useState<MetadataInput | null>(null)
  const [saving, setSaving] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'replace' | null>(null)
  const [dialog, setDialog] = useState<'move' | 'delete' | null>(null)
  const [tree, setTree] = useState<FolderNode[] | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  const [dialogPending, setDialogPending] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    damApi.get(id, controller.signal).then(
      (a) => {
        setAsset(a)
        setForm(formOf(a))
        setLoadError(null)
      },
      (err: Error) => {
        if (!controller.signal.aborted) setLoadError(err)
      },
    )
    return () => controller.abort()
  }, [id, attempt])

  const show = (a: AssetDetail) => {
    setAsset(a)
    setForm(formOf(a))
  }

  if (loadError && !asset) {
    if (loadError instanceof ApiError && loadError.status === 404) {
      return (
        <>
          <PageHeader title="Không tìm thấy asset" />
          <p className="text-stone-600">
            Asset có thể đã bị xoá.{' '}
            <Link to="/author/assets" className={btn.link}>
              Về danh sách Assets
            </Link>
          </p>
        </>
      )
    }
    return <ErrorMessage message={loadError.message} onRetry={() => setAttempt((n) => n + 1)} />
  }
  if (!asset || !form) return <Spinner label="Đang tải asset..." />

  const dirty = !sameForm(form, formOf(asset))
  const isImage = asset.kind === 'IMAGE'
  const fullLink = `${window.location.origin}${asset.stableUrl}`
  const backTo = `/author/assets?folder=${asset.folderId}`

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setTitleError('Nhập tiêu đề')
      return
    }
    setTitleError(null)
    setSaveError(null)
    setSaving(true)
    try {
      show(await damApi.update(asset.id, { ...form, title: form.title.trim(), alt: form.alt?.trim() || null, description: form.description?.trim() || null }))
      toast({ message: 'Đã lưu thông tin asset', tone: 'success' })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Không lưu được, vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  const replaceWith = async (file: File | undefined) => {
    if (!file) return
    const problem = uploadProblem(file, asset.kind)
    if (problem) {
      toast({ message: problem, tone: 'error' })
      return
    }
    setBusy('replace')
    try {
      const replaced = await damApi.replace(asset.id, file)
      // Keep what the author was typing; only the file facts change
      setAsset(replaced)
      toast({ message: 'Đã thay file. Link ổn định vẫn giữ nguyên.', tone: 'success' })
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Không thay được file', tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const openMove = async () => {
    setDialogError(null)
    setTarget(asset.folderId)
    setDialog('move')
    if (!tree) {
      try {
        setTree(await damApi.folders())
      } catch (err) {
        setDialogError(err instanceof Error ? err.message : 'Không tải được danh sách thư mục')
      }
    }
  }

  const submitDialog = async () => {
    setDialogPending(true)
    setDialogError(null)
    try {
      if (dialog === 'move' && target !== null) {
        const moved = await damApi.move(asset.id, target)
        setAsset(moved)
        setDialog(null)
        toast({ message: `Đã chuyển sang ${moved.folderPath}`, tone: 'success' })
      } else if (dialog === 'delete') {
        await damApi.remove(asset.id)
        setDialog(null)
        toast({ message: `Đã xoá “${asset.title}”`, tone: 'success' })
        navigate(backTo, { state: { skipUnsavedGuard: true } })
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ASSET_IN_USE') {
        setAsset({ ...asset, usages: (err.details.usages as AssetUsage[] | undefined) ?? asset.usages })
      }
      setDialogError(err instanceof Error ? err.message : 'Không thực hiện được, vui lòng thử lại')
    } finally {
      setDialogPending(false)
    }
  }

  const inUse = asset.usages.length > 0

  return (
    <>
      <UnsavedChangesGuard when={dirty && !saving} />
      <Link to={backTo} className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-indigo-700">
        <ArrowLeft aria-hidden className="size-4" />
        {asset.folderPath}
      </Link>
      <PageHeader title={asset.title}>
        <input
          ref={fileInput}
          type="file"
          accept={acceptFor(asset.kind)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void replaceWith(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button type="button" className={btn.secondary} disabled={busy !== null} onClick={() => fileInput.current?.click()}>
          <RefreshCw aria-hidden className={`size-4 ${busy === 'replace' ? 'animate-spin' : ''}`} />
          {busy === 'replace' ? 'Đang thay file...' : 'Thay file'}
        </button>
        <button type="button" className={btn.secondary} onClick={() => void openMove()}>
          <FolderInput aria-hidden className="size-4" />
          Di chuyển
        </button>
        {session.canDelete && (
          <button
            type="button"
            className={btn.danger}
            disabled={inUse}
            title={inUse ? 'Đang được dùng, không xoá được' : undefined}
            onClick={() => {
              setDialogError(null)
              setDialog('delete')
            }}
          >
            <Trash2 aria-hidden className="size-4" />
            Xoá
          </button>
        )}
      </PageHeader>
      {session.canDelete && inUse && (
        <p className="-mt-4 mb-4 text-sm text-amber-800">Asset đang được dùng nên chưa xoá được. Hãy gỡ khỏi các nơi bên dưới trước.</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <figure className={`${card} overflow-hidden`}>
            <img
              src={isImage ? (asset.renditions.hero ?? asset.renditions.card ?? asset.url) : asset.renditions.card}
              alt={isImage ? (asset.alt ?? '') : `Trang 1 của ${asset.title}`}
              className="max-h-[32rem] w-full bg-stone-100 object-contain"
            />
            {!isImage && (
              <figcaption className="flex items-center justify-between gap-3 border-t border-stone-200 p-3 text-sm">
                <span className="text-muted">Trang 1 / {asset.pageCount ?? '?'}</span>
                <a href={asset.stableUrl} target="_blank" rel="noopener noreferrer" className={btn.secondary}>
                  <ExternalLink aria-hidden className="size-4" />
                  Mở PDF
                </a>
              </figcaption>
            )}
          </figure>

          <form onSubmit={(e) => void save(e)} noValidate className={`${card} flex flex-col gap-4 p-5`}>
            <h2 className="text-lg font-bold text-stone-900">Thông tin</h2>
            <Field label="Tiêu đề" requiredMark error={titleError ?? undefined}>
              {(props) => (
                <input {...props} value={form.title} maxLength={150} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              )}
            </Field>
            {isImage && (
              <Field
                label="Mô tả ảnh (alt)"
                requiredMark
                hint={
                  form.alt?.trim()
                    ? 'Đọc cho người khiếm thị và công cụ tìm kiếm.'
                    : 'Ảnh chưa có alt: vẫn lưu được, nhưng nên mô tả ngắn nội dung ảnh.'
                }
              >
                {(props) => (
                  <input
                    {...props}
                   
                    value={form.alt ?? ''}
                    maxLength={200}
                    onChange={(e) => setForm({ ...form, alt: e.target.value })}
                    className={`${props.className} ${form.alt?.trim() ? '' : 'border-amber-400'}`}
                  />
                )}
              </Field>
            )}
            <Field label="Mô tả">
              {(props) => (
                <textarea
                  {...props}
                 
                  rows={3}
                  maxLength={1000}
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              )}
            </Field>
            <div>
              <label htmlFor={tagsId} className="mb-1 block text-sm font-medium text-stone-700">
                Tag
              </label>
              <TagInput id={tagsId} value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
            </div>
            {saveError && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">
                {saveError}
              </p>
            )}
            <div className="flex justify-end">
              <button type="submit" className={btn.primary} disabled={saving || !dirty}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </form>
        </div>

        <div className="flex flex-col gap-6">
          <section className={`${card} p-5`} aria-labelledby="asset-link">
            <h2 id="asset-link" className="text-lg font-bold text-stone-900">
              Link
            </h2>
            <p className="mt-1 text-sm text-muted">Link này giữ nguyên kể cả khi thay file.</p>
            <input readOnly value={fullLink} aria-label="Link ổn định" className={`${input} mt-3 font-mono text-xs`} onFocus={(e) => e.target.select()} />
            <div className="mt-2">
              <CopyButton text={fullLink} label="Copy link" />
            </div>
            <h3 className="mt-5 text-sm font-semibold text-stone-900">Rendition</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {Object.entries(asset.renditions).map(([name, url]) => (
                <li key={name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate" title={url}>
                    {RENDITION_LABEL[name] ?? name}
                  </span>
                  <CopyButton text={url} label={`Copy ${name}`} />
                </li>
              ))}
            </ul>
          </section>

          <section className={`${card} p-5`} aria-labelledby="asset-file">
            <h2 id="asset-file" className="text-lg font-bold text-stone-900">
              File
            </h2>
            <dl className="mt-2">
              <InfoRow label="Tên file">{asset.fileName}</InfoRow>
              <InfoRow label="Loại">
                {KIND_LABEL[asset.kind]} ({asset.mime})
              </InfoRow>
              <InfoRow label="Dung lượng">{formatBytes(asset.sizeBytes)}</InfoRow>
              <InfoRow label={isImage ? 'Kích thước' : 'Số trang'}>{dimensions(asset)}</InfoRow>
              <InfoRow label="Thư mục">{asset.folderPath}</InfoRow>
              <InfoRow label="Ngày tạo">{formatAdminDateTime(asset.createdAt)}</InfoRow>
              <InfoRow label="Người tạo">{asset.createdByName ?? '—'}</InfoRow>
              <InfoRow label="Cập nhật">
                {formatAdminDateTime(asset.updatedAt)}
                {asset.updatedByName ? ` · ${asset.updatedByName}` : ''}
              </InfoRow>
            </dl>
          </section>

          <section className={`${card} p-5`} aria-labelledby="asset-usages">
            <h2 id="asset-usages" className="mb-2 text-lg font-bold text-stone-900">
              Được dùng ở đâu
            </h2>
            <Usages usages={asset.usages} />
          </section>
        </div>
      </div>

      {dialog === 'move' && (
        <Dialog
          title="Di chuyển asset"
          submitLabel="Di chuyển"
          pending={dialogPending}
          error={dialogError}
          submitDisabled={target === null || target === asset.folderId}
          onClose={() => setDialog(null)}
          onSubmit={() => void submitDialog()}
        >
          {tree ? (
            <FolderSelect tree={tree} value={target} onChange={setTarget} label="Thư mục đích" />
          ) : (
            !dialogError && <Spinner label="Đang tải thư mục..." />
          )}
        </Dialog>
      )}
      {dialog === 'delete' && (
        <Dialog
          title={`Xoá “${asset.title}”?`}
          submitLabel="Xoá"
          tone="danger"
          pending={dialogPending}
          error={dialogError}
          submitDisabled={inUse}
          onClose={() => setDialog(null)}
          onSubmit={() => void submitDialog()}
        >
          {inUse ? (
            <Usages usages={asset.usages} />
          ) : (
            <p className="text-sm text-stone-600">File sẽ bị xoá khỏi kho và link ổn định sẽ không mở được nữa.</p>
          )}
        </Dialog>
      )}
    </>
  )
}
