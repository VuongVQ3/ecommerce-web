import { FolderPlus, LayoutGrid, Pencil, Rows3, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router'
import { btn, filterBtn, filterInput, input } from '../../admin/styles'
import { Dialog, EmptyState, PageHeader, Pagination } from '../../admin/ui'
import { ErrorMessage, Spinner } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { ApiError } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { useAuthorSession } from '../AuthorSessionContext'
import { AssetGrid, AssetTable, UploadPanel } from './AssetViews'
import { damApi, flattenFolders, type AssetKind } from './damApi'
import { FolderSelect, FolderTree } from './FolderTree'
import { acceptFor } from './uploadRules'
import { useUploadQueue } from './useUploadQueue'

export const PAGE_SIZE = 40
const VIEW_KEY = 'author.assets.view'
const SEARCH_DELAY_MS = 300

type View = 'grid' | 'table'
type FolderDialog = { type: 'create' | 'rename' | 'delete'; name: string } | null

const toNumber = (value: string | null) => (value && /^\d+$/.test(value) ? Number(value) : null)
const toKind = (value: string | null): AssetKind | null => (value === 'IMAGE' || value === 'PDF' ? value : null)

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid'
  } catch {
    return 'grid'
  }
}

/**
 * Text typed into a filter box reaches the URL 300 ms after the last key (replacing the history entry, so Back
 * returns to the previous folder or filter, not to every letter). Follows the URL when it changes from outside
 * (Back/Forward).
 */
function useDebouncedParam(value: string, apply: (next: string) => void): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value)
  const applied = useRef(value)
  useEffect(() => {
    if (value !== applied.current) {
      applied.current = value
      setDraft(value)
    }
  }, [value])
  useEffect(() => {
    const next = draft.trim()
    if (next === applied.current) return
    const timer = window.setTimeout(() => {
      applied.current = next
      apply(next)
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [draft, apply])
  return [draft, setDraft]
}

/**
 * Assets (DAM): folder tree on the left (a select on phones), filters, grid or table, uploads by drag and drop or
 * file picker into the open folder. Folder, filters and page live in the URL (?folder=&q=&kind=&tag=&page=), so a
 * reload or Back keeps them.
 */
export default function AssetsPage() {
  const session = useAuthorSession()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const folderId = toNumber(params.get('folder'))
  const q = params.get('q') ?? ''
  const kind = toKind(params.get('kind'))
  const tag = params.get('tag') ?? ''
  const page = toNumber(params.get('page')) ?? 0

  /** Changes some parameters; any filter or folder change goes back to page 1. */
  const update = useCallback(
    (changes: Record<string, string | null>, replace = false) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '') next.delete(key)
            else next.set(key, value)
          }
          if (!('page' in changes)) next.delete('page')
          return next
        },
        { replace },
      ),
    [setParams],
  )
  const applySearch = useCallback((next: string) => update({ q: next }, true), [update])
  const applyTag = useCallback((next: string) => update({ tag: next }, true), [update])
  const [search, setSearch] = useDebouncedParam(q, applySearch)
  const [tagDraft, setTagDraft] = useDebouncedParam(tag, applyTag)

  const tree = useAsync((signal) => damApi.folders(signal), [])
  const list = useAsync(
    (signal) => damApi.list({ folderId, q, kind, tag, page, size: PAGE_SIZE }, signal),
    [folderId, q, kind, tag, page],
  )
  const reloadTree = tree.reload
  const reloadList = list.reload
  const queue = useUploadQueue(
    useCallback(() => {
      reloadList()
      reloadTree()
    }, [reloadList, reloadTree]),
  )

  const folders = useMemo(() => flattenFolders(tree.data ?? []), [tree.data])
  const folder = folders.find((f) => f.id === folderId) ?? null
  const root = folders.find((f) => f.parentId === null) ?? null

  const [view, setView] = useState<View>(readView)
  const changeView = (next: View) => {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Private mode: the choice simply is not remembered
    }
  }

  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const addFiles = (files: FileList | File[] | null) => {
    if (!files || !files.length) return
    if (folderId === null) {
      toast({ message: 'Chọn một thư mục trước khi tải lên', tone: 'error' })
      return
    }
    queue.add(Array.from(files), folderId)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const [dialog, setDialog] = useState<FolderDialog>(null)
  const [pending, setPending] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const openDialog = (type: 'create' | 'rename' | 'delete') => {
    setDialogError(null)
    setDialog({ type, name: type === 'rename' ? (folder?.name ?? '') : '' })
  }
  const submitDialog = async () => {
    if (!dialog) return
    setPending(true)
    setDialogError(null)
    try {
      if (dialog.type === 'create') {
        const parent = folder ?? root
        if (!parent) return
        const created = await damApi.createFolder(parent.id, dialog.name)
        update({ folder: String(created.id) })
      } else if (dialog.type === 'rename' && folder) {
        await damApi.renameFolder(folder.id, dialog.name)
      } else if (dialog.type === 'delete' && folder) {
        await damApi.deleteFolder(folder.id)
        update({ folder: folder.parentId === null ? null : String(folder.parentId) })
      }
      setDialog(null)
      reloadTree()
    } catch (err) {
      setDialogError(err instanceof ApiError ? err.message : 'Không thực hiện được, vui lòng thử lại')
    } finally {
      setPending(false)
    }
  }

  const canChangeFolder = folder !== null && folder.parentId !== null

  return (
    <>
      <PageHeader title="Assets">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={acceptFor('ANY')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className={btn.primary}
          disabled={folderId === null}
          title={folderId === null ? 'Chọn một thư mục để tải lên' : undefined}
          onClick={() => fileInput.current?.click()}
        >
          <Upload aria-hidden className="size-4" />
          Tải lên
        </button>
      </PageHeader>

      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
        <aside className="mb-4 lg:mb-0">
          {tree.error && !tree.data ? (
            <ErrorMessage message={tree.error.message} onRetry={reloadTree} />
          ) : !tree.data ? (
            <Spinner label="Đang tải thư mục..." />
          ) : (
            <>
              <div className="lg:hidden">
                <FolderSelect
                  tree={tree.data}
                  value={folderId}
                  onChange={(id) => update({ folder: id === null ? null : String(id) })}
                  allLabel="Tất cả asset"
                  label="Chọn thư mục"
                />
              </div>
              <div className="hidden rounded-2xl border border-stone-200 bg-white p-2 lg:block">
                <FolderTree
                  tree={tree.data}
                  selectedId={folderId}
                  onSelect={(id) => update({ folder: id === null ? null : String(id) })}
                  allLabel="Tất cả asset"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <button type="button" className={btn.link} onClick={() => openDialog('create')}>
                  <FolderPlus aria-hidden className="mr-1 inline size-4" />
                  {folder ? 'Thư mục con mới' : 'Thư mục mới'}
                </button>
                {canChangeFolder && (
                  <button type="button" className={btn.link} onClick={() => openDialog('rename')}>
                    <Pencil aria-hidden className="mr-1 inline size-4" />
                    Đổi tên
                  </button>
                )}
                {canChangeFolder && session.canDelete && (
                  <button type="button" className="text-sm font-semibold text-danger underline-offset-2 hover:underline" onClick={() => openDialog('delete')}>
                    <Trash2 aria-hidden className="mr-1 inline size-4" />
                    Xoá thư mục
                  </button>
                )}
              </div>
            </>
          )}
        </aside>

        <section
          aria-label="Danh sách asset"
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex min-w-0 flex-col gap-4 rounded-2xl ${dragging ? 'outline-2 outline-offset-4 outline-indigo-400 outline-dashed' : ''}`}
        >
          <p className="text-sm text-muted">
            {folder ? (
              <>
                Thư mục <span className="font-semibold text-stone-800">{folder.path}</span> · kéo thả file vào đây để tải lên
              </>
            ) : (
              'Tất cả asset · chọn một thư mục để tải lên'
            )}
          </p>

          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <input
              type="search"
              aria-label="Tìm asset"
              placeholder="Tìm theo tên, tên file, tag…"
              className={`${filterInput} md:w-72`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Loại"
              className={`${filterInput} md:w-36`}
              value={kind ?? ''}
              onChange={(e) => update({ kind: e.target.value || null })}
            >
              <option value="">Tất cả loại</option>
              <option value="IMAGE">Ảnh</option>
              <option value="PDF">PDF</option>
            </select>
            <input
              aria-label="Lọc tag"
              placeholder="Tag"
              className={`${filterInput} md:w-40`}
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
            />
            <div className="flex gap-1 md:ml-auto" role="group" aria-label="Kiểu hiển thị">
              <button
                type="button"
                aria-pressed={view === 'grid'}
                onClick={() => changeView('grid')}
                className={view === 'grid' ? filterBtn.primary : filterBtn.secondary}
              >
                <LayoutGrid aria-hidden className="size-4" />
                Lưới
              </button>
              <button
                type="button"
                aria-pressed={view === 'table'}
                onClick={() => changeView('table')}
                className={view === 'table' ? filterBtn.primary : filterBtn.secondary}
              >
                <Rows3 aria-hidden className="size-4" />
                Bảng
              </button>
            </div>
          </div>

          <UploadPanel items={queue.items} onClear={queue.clearFinished} />

          {list.error && !list.data ? (
            <ErrorMessage message={list.error.message} onRetry={reloadList} />
          ) : !list.data ? (
            <Spinner label="Đang tải asset..." />
          ) : list.data.items.length === 0 ? (
            <EmptyState title={q || kind || tag ? 'Không có asset nào khớp bộ lọc' : 'Chưa có asset nào'}>
              {folder ? 'Kéo thả ảnh hoặc PDF vào đây, hoặc bấm “Tải lên”.' : 'Chọn một thư mục để tải file lên.'}
            </EmptyState>
          ) : (
            <>
              <p className="text-sm text-muted">{list.data.totalItems.toLocaleString('vi-VN')} asset</p>
              {view === 'grid' ? <AssetGrid items={list.data.items} /> : <AssetTable items={list.data.items} />}
              <Pagination
                page={list.data.page}
                totalPages={list.data.totalPages}
                onChange={(p) => update({ page: p > 0 ? String(p) : null })}
              />
            </>
          )}
        </section>
      </div>

      {dialog && (
        <Dialog
          title={
            dialog.type === 'create'
              ? `Thư mục mới trong ${(folder ?? root)?.path ?? ''}`
              : dialog.type === 'rename'
                ? 'Đổi tên thư mục'
                : `Xoá thư mục ${folder?.path ?? ''}?`
          }
          submitLabel={dialog.type === 'delete' ? 'Xoá' : dialog.type === 'rename' ? 'Đổi tên' : 'Tạo'}
          tone={dialog.type === 'delete' ? 'danger' : 'primary'}
          pending={pending}
          error={dialogError}
          submitDisabled={dialog.type !== 'delete' && !dialog.name.trim()}
          onClose={() => setDialog(null)}
          onSubmit={() => void submitDialog()}
        >
          {dialog.type === 'delete' ? (
            <p className="text-sm text-stone-600">Chỉ xoá được thư mục rỗng (không còn asset hay thư mục con).</p>
          ) : (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-stone-700">Tên thư mục</span>
              <input
                className={input}
                value={dialog.name}
                maxLength={80}
                onChange={(e) => setDialog({ ...dialog, name: e.target.value })}
                autoFocus
              />
              <span className="mt-1 block text-muted">Viết thường, không dấu, nối bằng gạch ngang (tự chuyển khi lưu).</span>
            </label>
          )}
        </Dialog>
      )}
    </>
  )
}
