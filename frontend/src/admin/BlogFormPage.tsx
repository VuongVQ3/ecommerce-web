import { ExternalLink, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ErrorMessage } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { adminApi, type AdminProductRow } from '../lib/adminApi'
import { ApiError } from '../lib/api'
import {
  adminBlogApi,
  BLOG_CONTENT_MAX,
  type AdminBlogImage,
  type AdminBlogPost,
  type AdminRelatedProduct,
  type BlogPostInput,
} from '../lib/adminBlogApi'
import { formatAdminDateTime } from '../lib/format'
import { cloudinaryUrl } from '../lib/images'
import { slugify, SLUG_PATTERN } from '../lib/slug'
import { useAsync } from '../lib/useAsync'
import NotFoundPage from '../pages/NotFoundPage'
import { EXCERPT_IDEAL, EXCERPT_MAX, excerptHint, healthClaims, imageFileProblem, publishProblems } from './blogRules'
import MarkdownEditor, { ImageDetailsDialog } from './MarkdownEditor'
import { Skeleton } from './Skeleton'
import { btn, card, input } from './styles'
import { Badge, Dialog, Field, PageHeader, UnsavedChangesGuard } from './ui'
import { useDragReorder } from './useDragReorder'

const RELATED_MAX = 4

interface Form {
  title: string
  slug: string
  excerpt: string
  content: string
  coverImageAlt: string
  products: AdminRelatedProduct[]
}

const formOf = (p: AdminBlogPost | null): Form => ({
  title: p?.title ?? '',
  slug: p?.slug ?? '',
  excerpt: p?.excerpt ?? '',
  content: p?.content ?? '',
  coverImageAlt: p?.coverImageAlt ?? '',
  products: p?.products ?? [],
})

const inputOf = (f: Form): BlogPostInput => ({
  title: f.title.trim(),
  slug: f.slug.trim(),
  excerpt: f.excerpt.trim(),
  content: f.content,
  coverImageAlt: f.coverImageAlt.trim(),
  productIds: f.products.map((p) => p.id),
})

const snapshot = (f: Form) => JSON.stringify(inputOf(f))

/** What the server's BLOG_NOT_READY "missing" codes mean */
const MISSING: Record<string, string> = {
  EXCERPT: 'Chưa có tóm tắt.',
  COVER: 'Chưa có ảnh bìa.',
  COVER_ALT: 'Ảnh bìa chưa có mô tả (alt).',
}

type Confirm =
  | { kind: 'delete' }
  | { kind: 'unpublish' }
  | { kind: 'deleteImage'; image: AdminBlogImage; inContent: boolean }

/** Search the catalogue by name and add up to four products; the chosen ones are reordered by dragging or ↑/↓. */
function RelatedProductsPicker({ value, onChange }: { value: AdminRelatedProduct[]; onChange: (v: AdminRelatedProduct[]) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<AdminProductRow[]>([])
  const full = value.length >= RELATED_MAX

  useEffect(() => {
    const term = q.trim()
    if (!term) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      adminApi.products(term, '', 0, controller.signal, false, 8).then(
        (page) => setResults(page.items),
        () => {},
      )
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  const move = (_id: number, from: number, to: number) => {
    const next = [...value]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }
  const { dragging, rowProps, handleProps } = useDragReorder(value, (p) => p.id, move)

  return (
    <div>
      {value.length > 0 && (
        <ol className="mb-3 space-y-2" aria-label="Sản phẩm đã chọn">
          {value.map((p, index) => (
            <li
              key={p.id}
              {...rowProps('related', p.id, index)}
              className={`flex items-center gap-2 rounded-xl border bg-white p-2 ${dragging === p.id ? 'border-brand-500 shadow-lg' : 'border-stone-200'}`}
            >
              <button
                type="button"
                aria-label={`Đổi thứ tự: ${p.name}`}
                className="flex size-9 shrink-0 cursor-grab items-center justify-center rounded-lg text-lg text-stone-400 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-brand-700"
                {...handleProps('related', p.id, index)}
              >
                <span aria-hidden>⠿</span>
              </button>
              {p.imageUrl ? (
                <img src={cloudinaryUrl(p.imageUrl, 80)} alt="" width={40} height={40} className="size-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span aria-hidden className="size-10 shrink-0 rounded-lg bg-stone-100" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">{p.name}</span>
              {!p.active && <Badge tone="amber">Đang ẩn · không hiện</Badge>}
              <button
                type="button"
                aria-label={`Bỏ ${p.name}`}
                onClick={() => onChange(value.filter((x) => x.id !== p.id))}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-danger"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={full ? `Đã đủ ${RELATED_MAX} sản phẩm` : 'Tìm sản phẩm theo tên...'}
        aria-label="Tìm sản phẩm liên quan"
        disabled={full}
        className={input}
      />
      {q.trim() !== '' && results.length > 0 && !full && (
        <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white" aria-label="Kết quả tìm sản phẩm">
          {results.map((r) => {
            const added = value.some((p) => p.id === r.id)
            return (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {!r.active && <Badge tone="gray">Đang ẩn</Badge>}
                <button
                  type="button"
                  className={btn.link}
                  disabled={added}
                  onClick={() => {
                    onChange([...value, { id: r.id, name: r.name, slug: r.slug, imageUrl: r.imageUrl, active: r.active && r.price > 0 }])
                    setQ('')
                  }}
                >
                  {added ? 'Đã thêm' : 'Thêm'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function BlogEditor({ initial, onCreated }: { initial: AdminBlogPost | null; onCreated: (post: AdminBlogPost) => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [post, setPost] = useState(initial)
  const [form, setForm] = useState(() => formOf(initial))
  const [saved, setSaved] = useState(() => snapshot(formOf(initial)))
  // A new post's slug follows its title until edited by hand; a post that has been public keeps its address
  const [slugTouched, setSlugTouched] = useState(initial !== null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [cover, setCover] = useState<{ file: File; upload: Promise<AdminBlogImage> } | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const creating = useRef<Promise<AdminBlogPost> | null>(null)
  const alertBox = useRef<HTMLDivElement>(null)

  // The message sits below a possibly long post: bring it into view
  useEffect(() => {
    if (problems.length > 0 || error) alertBox.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [problems, error])

  const dirty = snapshot(form) !== saved
  const claims = useMemo(() => healthClaims(`${form.title}\n${form.excerpt}\n${form.content}`), [form.title, form.excerpt, form.content])
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  const accept = (next: AdminBlogPost, keepForm = false) => {
    setPost(next)
    const fresh = formOf(next)
    setSaved(snapshot(fresh))
    if (!keepForm) setForm(fresh)
  }

  const validate = (): string | null => {
    if (!form.title.trim()) return 'Vui lòng nhập tiêu đề.'
    if (form.slug.trim() && !SLUG_PATTERN.test(form.slug.trim())) return 'Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang.'
    if (form.content.length > BLOG_CONTENT_MAX) return 'Nội dung tối đa 100.000 ký tự.'
    if (post?.coverImageUrl && !form.coverImageAlt.trim()) return 'Vui lòng nhập mô tả ảnh bìa (alt).'
    return null
  }

  /** Creates or updates; returns the saved post. A new post moves to its own address (the editor stays). */
  const save = async (): Promise<AdminBlogPost> => {
    const problem = validate()
    if (problem) throw new Error(problem)
    if (post) {
      const next = await adminBlogApi.update(post.id, inputOf(form))
      accept(next)
      return next
    }
    creating.current ??= adminBlogApi.create(inputOf(form)).finally(() => {
      creating.current = null
    })
    const created = await creating.current
    accept(created)
    onCreated(created)
    navigate(`/admin/blog/${created.id}`, { replace: true, state: { skipUnsavedGuard: true } })
    return created
  }

  /** Images belong to a post: a new one is saved as a draft first (it needs a title). */
  const postIdForUpload = async (): Promise<number> => {
    if (post) return post.id
    if (!form.title.trim()) throw new Error('Nhập tiêu đề trước: bài sẽ được lưu nháp để tải ảnh lên.')
    return (await save()).id
  }

  const uploadImage = async (file: File) => {
    const id = await postIdForUpload()
    const image = await adminBlogApi.uploadImage(id, file)
    setPost((p) => (p ? { ...p, images: [...p.images, image] } : p))
    return image
  }

  const run = async (task: () => Promise<void>) => {
    setPending(true)
    setError(null)
    try {
      await task()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'BLOG_NOT_READY') {
        const missing = (e.details.missing as string[] | undefined) ?? []
        setProblems(missing.map((m) => MISSING[m] ?? m))
      } else {
        setError((e as Error).message)
      }
    } finally {
      setPending(false)
    }
  }

  const onSave = () =>
    run(async () => {
      setProblems([])
      await save()
      toast({ message: post?.status === 'PUBLISHED' ? 'Đã lưu thay đổi' : 'Đã lưu nháp', tone: 'success' })
    })

  const onPublish = () => {
    const missing = publishProblems({ excerpt: form.excerpt, coverImageUrl: post?.coverImageUrl ?? null, coverImageAlt: form.coverImageAlt })
    setProblems(missing)
    if (missing.length > 0) return
    void run(async () => {
      const current = dirty || !post ? await save() : post
      accept(await adminBlogApi.setStatus(current.id, 'PUBLISHED'))
      toast({ message: 'Đã đăng bài', tone: 'success' })
    })
  }

  const onConfirm = async () => {
    if (!confirm || !post) return
    const what = confirm
    await run(async () => {
      if (what.kind === 'delete') {
        await adminBlogApi.remove(post.id)
        toast({ message: 'Đã xoá bài viết', tone: 'success' })
        navigate('/admin/blog', { state: { skipUnsavedGuard: true } })
      } else if (what.kind === 'unpublish') {
        accept(await adminBlogApi.setStatus(post.id, 'DRAFT'), true)
        toast({ message: 'Đã gỡ bài (chuyển về nháp)', tone: 'success' })
      } else {
        const next = await adminBlogApi.deleteImage(post.id, what.image.id)
        setPost(next)
      }
    })
    setConfirm(null)
  }

  const chooseCover = (file: File) => {
    const problem = imageFileProblem(file) ?? (!post && !form.title.trim() ? 'Nhập tiêu đề trước: bài sẽ được lưu nháp để tải ảnh lên.' : null)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    const upload = postIdForUpload().then((id) => adminBlogApi.uploadImage(id, file))
    upload.catch(() => {})
    setCover({ file, upload })
  }

  const makeCover = (image: AdminBlogImage) => {
    const alt = form.coverImageAlt.trim() || image.alt || ''
    if (!alt) {
      setError('Nhập mô tả ảnh bìa (alt) trước khi chọn ảnh bìa.')
      return
    }
    void run(async () => {
      const next = await adminBlogApi.setCover(post!.id, image.id, alt)
      setPost(next)
      setForm((f) => ({ ...f, coverImageAlt: next.coverImageAlt ?? '' }))
      setSaved((s) => JSON.stringify({ ...JSON.parse(s), coverImageAlt: next.coverImageAlt ?? '' }))
    })
  }

  const published = post?.status === 'PUBLISHED'
  const excerptLength = form.excerpt.trim().length
  const excerptOk = excerptLength >= EXCERPT_IDEAL.min && excerptLength <= EXCERPT_IDEAL.max

  return (
    <div className="pb-24">
      <PageHeader title={post ? 'Sửa bài viết' : 'Viết bài mới'}>
        {post && (published ? <Badge tone="green">Đã đăng</Badge> : <Badge tone="gray">Nháp</Badge>)}
        {published && post && (
          <a href={`/blog/${post.slug}`} target="_blank" rel="noopener" className={`${btn.link} inline-flex items-center gap-1`}>
            Xem bài <ExternalLink aria-hidden className="size-3.5" />
          </a>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <section className={`${card} space-y-4 p-5`}>
            <Field label="Tiêu đề" requiredMark>
              {(props) => (
                <input
                  {...props}
                  value={form.title}
                  maxLength={150}
                  onChange={(e) => {
                    const title = e.target.value
                    setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }))
                  }}
                />
              )}
            </Field>
            <Field label="Đường dẫn (slug)" hint={`/blog/${form.slug || '…'}${post?.publishedAt ? ' · đổi slug thì link cũ tự chuyển sang link mới' : ''}`}>
              {(props) => (
                <input
                  {...props}
                  value={form.slug}
                  maxLength={200}
                  onChange={(e) => {
                    setSlugTouched(true)
                    set('slug', e.target.value)
                  }}
                />
              )}
            </Field>
            <Field label="Tóm tắt" hint={excerptHint(excerptLength)}>
              {(props) => (
                <textarea
                  {...props}
                  rows={3}
                  value={form.excerpt}
                  maxLength={EXCERPT_MAX}
                  onChange={(e) => set('excerpt', e.target.value)}
                  className={`${props.className} ${excerptLength > 0 && !excerptOk ? 'border-amber-400' : ''}`}
                />
              )}
            </Field>
          </section>

          <section className={`${card} p-5`}>
            <MarkdownEditor value={form.content} onChange={(v) => set('content', v)} uploadImage={uploadImage} />
          </section>

          {claims.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
              <p className="font-semibold">Lưu ý nội dung: bài có từ {claims.map((c) => `"${c}"`).join(', ')}.</p>
              <p className="mt-1">
                Bài viết về thực phẩm không được quảng cáo công dụng chữa bệnh hay thay thế thuốc. Hãy kiểm tra lại câu chữ (vẫn
                có thể lưu và đăng).
              </p>
            </div>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <section className={`${card} space-y-3 p-5`} aria-labelledby="cover-title">
            <h2 id="cover-title" className="font-semibold text-stone-900">
              Ảnh bìa
            </h2>
            {post?.coverImageUrl ? (
              <img
                src={cloudinaryUrl(post.coverImageUrl, 640, 336)}
                alt={form.coverImageAlt}
                className="aspect-[40/21] w-full rounded-xl bg-stone-100 object-cover"
              />
            ) : (
              <p className="flex aspect-[40/21] items-center justify-center rounded-xl border border-dashed border-stone-300 text-sm text-muted">
                Chưa có ảnh bìa
              </p>
            )}
            <button type="button" className={`${btn.secondary} w-full`} onClick={() => coverInput.current?.click()} disabled={pending}>
              {post?.coverImageUrl ? 'Đổi ảnh bìa' : 'Tải ảnh bìa'}
            </button>
            <input
              ref={coverInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              data-testid="cover-input"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) chooseCover(file)
              }}
            />
            <Field label="Mô tả ảnh bìa (alt)" requiredMark={Boolean(post?.coverImageUrl)}>
              {(props) => <input {...props} value={form.coverImageAlt} maxLength={200} onChange={(e) => set('coverImageAlt', e.target.value)} />}
            </Field>
          </section>

          <section className={`${card} space-y-3 p-5`} aria-labelledby="related-title">
            <h2 id="related-title" className="font-semibold text-stone-900">
              Sản phẩm liên quan <span className="font-normal text-muted">(tối đa {RELATED_MAX})</span>
            </h2>
            <RelatedProductsPicker value={form.products} onChange={(v) => set('products', v)} />
          </section>

          {post && post.images.length > 0 && (
            <section className={`${card} space-y-3 p-5`} aria-labelledby="images-title">
              <h2 id="images-title" className="font-semibold text-stone-900">
                Ảnh đã tải lên
              </h2>
              <ul className="grid grid-cols-2 gap-3">
                {post.images.map((image) => {
                  const isCover = image.url === post.coverImageUrl
                  return (
                    <li key={image.id} className="space-y-1">
                      <img src={cloudinaryUrl(image.url, 240, 160)} alt={image.alt ?? ''} className="aspect-[3/2] w-full rounded-lg bg-stone-100 object-cover" />
                      {isCover ? (
                        <p className="text-xs font-semibold text-brand-700">Ảnh bìa</p>
                      ) : (
                        <div className="flex items-center justify-between gap-1">
                          <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => makeCover(image)}>
                            Làm ảnh bìa
                          </button>
                          <button
                            type="button"
                            aria-label="Xoá ảnh"
                            className="flex size-7 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-danger"
                            onClick={() => setConfirm({ kind: 'deleteImage', image, inContent: form.content.includes(image.url) })}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {post && (
            <p className="text-xs text-muted">
              Tạo {formatAdminDateTime(post.createdAt)} · Sửa {formatAdminDateTime(post.updatedAt)}
              {post.publishedAt && ` · Đăng ${formatAdminDateTime(post.publishedAt)}`}
            </p>
          )}
        </aside>
      </div>

      {(problems.length > 0 || error) && (
        <div ref={alertBox} className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-danger" role="alert">
          {problems.length > 0 && (
            <>
              <p className="font-semibold">Chưa đăng được bài:</p>
              <ul className="mt-1 list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
          {error && <p className={problems.length > 0 ? 'mt-2' : ''}>{error}</p>}
        </div>
      )}

      {/* Sticks to the bottom of the window: the actions stay reachable in a long post */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2">
          {post && (
            <button type="button" className={`${btn.secondary} mr-auto text-danger`} onClick={() => setConfirm({ kind: 'delete' })} disabled={pending}>
              Xoá
            </button>
          )}
          {published && (
            <button type="button" className={btn.secondary} onClick={() => setConfirm({ kind: 'unpublish' })} disabled={pending}>
              Gỡ bài
            </button>
          )}
          <button type="button" className={btn.secondary} onClick={onSave} disabled={pending || (post !== null && !dirty)} aria-busy={pending}>
            {published ? 'Lưu thay đổi' : 'Lưu nháp'}
          </button>
          {!published && (
            <button type="button" className={btn.primary} onClick={onPublish} disabled={pending} aria-busy={pending}>
              Đăng
            </button>
          )}
        </div>
      </div>

      <UnsavedChangesGuard when={dirty && !pending} />

      {cover && (
        <ImageDetailsDialog
          file={cover.file}
          upload={cover.upload}
          title="Ảnh bìa"
          submitLabel="Dùng làm ảnh bìa"
          caption={false}
          initialAlt={form.coverImageAlt}
          onClose={() => setCover(null)}
          onDone={async (image, alt) => {
            const next = await adminBlogApi.setCover(post?.id ?? (await postIdForUpload()), image.id, alt)
            setPost(next)
            setForm((f) => ({ ...f, coverImageAlt: alt }))
            setSaved((s) => JSON.stringify({ ...JSON.parse(s), coverImageAlt: alt }))
            setCover(null)
          }}
        />
      )}

      {confirm && (
        <Dialog
          title={confirm.kind === 'delete' ? 'Xoá bài viết?' : confirm.kind === 'unpublish' ? 'Gỡ bài?' : 'Xoá ảnh?'}
          submitLabel={confirm.kind === 'delete' ? 'Xoá vĩnh viễn' : confirm.kind === 'unpublish' ? 'Gỡ bài' : 'Xoá ảnh'}
          tone={confirm.kind === 'unpublish' ? 'primary' : 'danger'}
          pending={pending}
          onSubmit={onConfirm}
          onClose={() => setConfirm(null)}
        >
          <p className="text-sm text-stone-600">
            {confirm.kind === 'delete'
              ? 'Bài viết và toàn bộ ảnh của bài sẽ bị xoá, không khôi phục được.'
              : confirm.kind === 'unpublish'
                ? 'Bài chuyển về nháp: khách không còn xem được, link của bài trả về "Không tìm thấy trang". Đăng lại bất cứ lúc nào.'
                : confirm.inContent
                  ? 'Ảnh này đang được dùng trong nội dung bài. Xoá ảnh thì chỗ đó trong bài sẽ bị lỗi ảnh.'
                  : 'Ảnh sẽ bị xoá khỏi bài.'}
          </p>
        </Dialog>
      )}
    </div>
  )
}

export default function BlogFormPage() {
  const { id } = useParams()
  const postId = id ? Number(id) : null
  // A post created by the editor on this screen keeps the same editor (no reload, an open image dialog stays open)
  const [createdHere, setCreatedHere] = useState<number | null>(null)
  const keep = postId !== null && postId === createdHere
  const { data, error, reload } = useAsync(
    (signal) => (postId && !keep ? adminBlogApi.get(postId, signal) : Promise.resolve(null)),
    [postId],
  )

  if (id && !Number.isInteger(postId)) return <NotFoundPage />
  if (keep) return <BlogEditor key="new" initial={null} onCreated={(p) => setCreatedHere(p.id)} />
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
  if (error) return <ErrorMessage message={error.message} onRetry={reload} />
  if (postId !== null && data?.id !== postId) return <Skeleton variant="form" />
  return (
    <BlogEditor
      key={postId ?? 'new'}
      initial={postId === null ? null : (data ?? null)}
      onCreated={(p) => setCreatedHere(p.id)}
    />
  )
}

