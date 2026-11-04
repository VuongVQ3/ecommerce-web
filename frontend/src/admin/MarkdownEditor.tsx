import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, Quote } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react'
import { BLOG_CONTENT_MAX, adminBlogApi } from '../lib/adminBlogApi'
import { IMAGE_TYPES, imageFileProblem } from './blogRules'
import { imageMarkdown, insertBlock, prefixLines, wrapSelection, type Edit } from './markdownEdit'
import { input } from './styles'
import { Dialog, Field } from './ui'

const PREVIEW_DELAY_MS = 400

/**
 * Asks for the alt text (required) and an optional caption of a chosen image while it uploads; "Chèn ảnh" waits for
 * the upload. With `caption` false it serves the cover (alt only).
 */
export function ImageDetailsDialog({
  file,
  upload,
  title,
  submitLabel,
  caption = true,
  initialAlt = '',
  onDone,
  onClose,
}: {
  file: File
  /** Started when the file was chosen */
  upload: Promise<{ url: string; id: string }>
  title: string
  submitLabel: string
  caption?: boolean
  initialAlt?: string
  onDone: (image: { url: string; id: string }, alt: string, caption: string) => void | Promise<void>
  onClose: () => void
}) {
  const [alt, setAlt] = useState(initialAlt)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [preview] = useState(() => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null))
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const submit = async () => {
    if (!alt.trim()) {
      setError('Vui lòng nhập mô tả ảnh (alt): người khiếm thị và Google đọc mô tả này.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await onDone(await upload, alt.trim(), text.trim())
    } catch (e) {
      setError((e as Error).message)
      setPending(false)
    }
  }

  return (
    <Dialog title={title} submitLabel={submitLabel} onSubmit={submit} onClose={onClose} pending={pending} error={error}>
      {preview && <img src={preview} alt="" className="max-h-48 w-full rounded-xl bg-stone-100 object-contain" />}
      <Field label="Mô tả ảnh (alt)" requiredMark hint="Tả ngắn gọn nội dung ảnh, ví dụ: Hạt mắc ca rang bơ trong hũ thuỷ tinh">
        {(props) => <input {...props} value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} autoFocus />}
      </Field>
      {caption && (
        <Field label="Chú thích (không bắt buộc)" hint="Hiện bằng chữ nhỏ dưới ảnh">
          {(props) => <input {...props} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />}
        </Field>
      )}
    </Dialog>
  )
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      // Keep the textarea's selection: the button must not take the focus on mouse down
      onMouseDown={(e) => e.preventDefault()}
      className="flex size-9 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-brand-700"
    >
      {children}
    </button>
  )
}

/**
 * Markdown textarea with a toolbar, image insertion (button, drag and drop, paste) at the cursor, and a preview
 * rendered by the server (the same HTML as the live page): side by side from 1024px, as a tab below.
 */
export default function MarkdownEditor({
  value,
  onChange,
  uploadImage,
  label = 'Nội dung',
}: {
  value: string
  onChange: (value: string) => void
  /** Uploads to the post (saving a new post as a draft first) */
  uploadImage: (file: File) => Promise<{ url: string; id: string }>
  label?: string
}) {
  const area = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const id = useId()
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [pendingImage, setPendingImage] = useState<{ file: File; upload: Promise<{ url: string; id: string }>; at: [number, number] } | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ html: string; readingMinutes: number } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [selectionAfter, setSelectionAfter] = useState<[number, number] | null>(null)

  // Server preview, a moment after typing stops
  useEffect(() => {
    if (value.length > BLOG_CONTENT_MAX) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      adminBlogApi.preview(value, controller.signal).then(
        (p) => {
          setPreview(p)
          setPreviewError(null)
        },
        (e: Error) => {
          if (!controller.signal.aborted) setPreviewError(e.message)
        },
      )
    }, PREVIEW_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [value])

  // Put the cursor where an edit says, once the new text is in the textarea
  useEffect(() => {
    if (!selectionAfter || !area.current) return
    area.current.focus()
    area.current.setSelectionRange(selectionAfter[0], selectionAfter[1])
    setSelectionAfter(null)
  }, [selectionAfter, value])

  const selection = (): [number, number] => [area.current?.selectionStart ?? value.length, area.current?.selectionEnd ?? value.length]

  const apply = (edit: (text: string, start: number, end: number) => Edit) => {
    const [start, end] = selection()
    const next = edit(value, start, end)
    onChange(next.text)
    setSelectionAfter([next.selectionStart, next.selectionEnd])
  }

  const chooseImage = (file: File) => {
    const problem = imageFileProblem(file)
    if (problem) {
      setImageError(problem)
      return
    }
    setImageError(null)
    const upload = uploadImage(file)
    upload.catch(() => {}) // reported by the dialog when "Chèn ảnh" is pressed
    setPendingImage({ file, upload, at: selection() })
  }

  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
    if (!file) return
    e.preventDefault()
    chooseImage(file)
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    if (!file) return
    e.preventDefault()
    chooseImage(file)
  }

  const tooLong = value.length > BLOG_CONTENT_MAX
  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${active ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}`

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-stone-700">
          {label}
        </label>
        <span className={`text-xs tabular-nums ${tooLong ? 'font-semibold text-danger' : 'text-muted'}`}>
          {value.length.toLocaleString('vi-VN')}/{BLOG_CONTENT_MAX.toLocaleString('vi-VN')} ký tự
          {preview && ` · ${preview.readingMinutes} phút đọc`}
        </span>
      </div>

      <div className="mb-2 flex rounded-xl bg-stone-100 p-1 lg:hidden" role="tablist" aria-label="Chế độ soạn">
        <button type="button" role="tab" aria-selected={tab === 'write'} className={tabClass(tab === 'write')} onClick={() => setTab('write')}>
          Soạn
        </button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className={tabClass(tab === 'preview')} onClick={() => setTab('preview')}>
          Xem trước
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={tab === 'write' ? '' : 'hidden lg:block'}>
          <div className="flex flex-wrap items-center gap-0.5 rounded-t-xl border border-b-0 border-stone-300 bg-stone-50 px-1 py-1" role="toolbar" aria-label="Định dạng">
            <ToolButton label="Tiêu đề lớn (H2)" onClick={() => apply((t, s, e) => prefixLines(t, s, e, '## '))}>
              <Heading2 className="size-4" />
            </ToolButton>
            <ToolButton label="Tiêu đề nhỏ (H3)" onClick={() => apply((t, s, e) => prefixLines(t, s, e, '### '))}>
              <Heading3 className="size-4" />
            </ToolButton>
            <ToolButton label="Chữ đậm" onClick={() => apply((t, s, e) => wrapSelection(t, s, e, '**', '**', 'chữ đậm'))}>
              <Bold className="size-4" />
            </ToolButton>
            <ToolButton label="Chữ nghiêng" onClick={() => apply((t, s, e) => wrapSelection(t, s, e, '_', '_', 'chữ nghiêng'))}>
              <Italic className="size-4" />
            </ToolButton>
            <ToolButton label="Danh sách" onClick={() => apply((t, s, e) => prefixLines(t, s, e, '- '))}>
              <List className="size-4" />
            </ToolButton>
            <ToolButton label="Trích dẫn" onClick={() => apply((t, s, e) => prefixLines(t, s, e, '> '))}>
              <Quote className="size-4" />
            </ToolButton>
            <ToolButton label="Chèn link" onClick={() => apply((t, s, e) => wrapSelection(t, s, e, '[', '](https://)', 'chữ hiển thị'))}>
              <Link2 className="size-4" />
            </ToolButton>
            <ToolButton label="Chèn ảnh" onClick={() => fileInput.current?.click()}>
              <ImagePlus className="size-4" />
            </ToolButton>
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_TYPES.join(',')}
              className="hidden"
              data-testid="editor-image-input"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) chooseImage(file)
              }}
            />
          </div>
          <textarea
            ref={area}
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onDrop={onDrop}
            onDragOver={(e) => {
              if ([...e.dataTransfer.types].includes('Files')) e.preventDefault()
            }}
            onPaste={onPaste}
            aria-invalid={tooLong || undefined}
            aria-describedby={`${id}-help`}
            rows={22}
            spellCheck
            className={`${input} min-h-80 rounded-t-none font-mono text-sm leading-relaxed lg:min-h-[32rem]`}
          />
          <p id={`${id}-help`} className="mt-1 text-xs text-muted">
            Kéo thả hoặc dán ảnh vào ô soạn để chèn. Xem cú pháp ở docs/blog.md.
          </p>
          {imageError && (
            <p className="mt-1 text-sm text-danger" role="alert">
              {imageError}
            </p>
          )}
        </div>

        <div className={tab === 'preview' ? '' : 'hidden lg:block'}>
          <div className="min-h-80 rounded-xl border border-stone-200 bg-white p-4 lg:min-h-[34rem]" aria-label="Xem trước" role="region">
            {previewError ? (
              <p className="text-sm text-danger">{previewError}</p>
            ) : preview && preview.html ? (
              <div className="prose-blog" dangerouslySetInnerHTML={{ __html: preview.html }} />
            ) : (
              <p className="text-sm text-muted">Nội dung xem trước hiện ở đây.</p>
            )}
          </div>
        </div>
      </div>

      {pendingImage && (
        <ImageDetailsDialog
          file={pendingImage.file}
          upload={pendingImage.upload}
          title="Chèn ảnh vào bài"
          submitLabel="Chèn ảnh"
          onClose={() => setPendingImage(null)}
          onDone={(image, alt, caption) => {
            const [start, end] = pendingImage.at
            const next = insertBlock(value, start, end, imageMarkdown(image.url, alt, caption))
            onChange(next.text)
            setSelectionAfter([next.selectionStart, next.selectionEnd])
            setPendingImage(null)
          }}
        />
      )}
    </div>
  )
}
