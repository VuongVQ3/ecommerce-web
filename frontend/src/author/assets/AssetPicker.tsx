import { Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { btn, filterInput } from '../../admin/styles'
import { Pagination } from '../../admin/ui'
import { ErrorMessage, Spinner } from '../../components/Feedback'
import Modal from '../../components/Modal'
import { ApiError } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { AssetThumb, MissingAlt } from './AssetViews'
import { missingAlt } from './assetFormat'
import { damApi, type AssetKind, type AssetRow } from './damApi'
import { FolderSelect, FolderTree } from './FolderTree'
import { acceptFor, uploadProblem } from './uploadRules'

const PAGE_SIZE = 24

/**
 * Choose an asset from the DAM (for Sites and Content Fragments): folders, search, a grid limited to the kind asked
 * for, and a quick upload into the open folder (the new file is selected at once). Click selects, double click or
 * "Chọn" confirms.
 */
export default function AssetPicker({
  kind,
  onSelect,
  onClose,
  title = 'Chọn asset',
}: {
  kind: AssetKind | 'ANY'
  onSelect: (asset: AssetRow) => void
  onClose: () => void
  title?: string
}) {
  const [folderId, setFolderId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AssetRow | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(draft.trim())
      setPage(0)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [draft])

  const tree = useAsync((signal) => damApi.folders(signal), [])
  const list = useAsync(
    (signal) =>
      damApi.list(
        { folderId, includeSubfolders: folderId !== null, q, kind: kind === 'ANY' ? null : kind, page, size: PAGE_SIZE },
        signal,
      ),
    [folderId, q, kind, page],
  )

  const chooseFolder = (id: number | null) => {
    setFolderId(id)
    setPage(0)
  }

  const quickUpload = async (file: File | undefined) => {
    if (!file || folderId === null) return
    const problem = uploadProblem(file, kind)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setUploading(true)
    try {
      const asset = await damApi.upload(file, folderId)
      setSelected(asset)
      list.reload()
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'DUPLICATE_ASSET' ? `${err.message} (tìm theo tên để chọn)` : err instanceof Error ? err.message : 'Tải lên không thành công')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal
      title={title}
      width="60rem"
      submitLabel="Chọn"
      cancelLabel="Huỷ"
      submitDisabled={!selected}
      error={error}
      onClose={onClose}
      onSubmit={() => selected && onSelect(selected)}
    >
      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div>
          {tree.data ? (
            <>
              <div className="md:hidden">
                <FolderSelect tree={tree.data} value={folderId} onChange={chooseFolder} allLabel="Tất cả thư mục" label="Thư mục" />
              </div>
              <div className="hidden max-h-[50vh] overflow-y-auto md:block">
                <FolderTree tree={tree.data} selectedId={folderId} onSelect={chooseFolder} allLabel="Tất cả thư mục" />
              </div>
            </>
          ) : tree.error ? (
            <ErrorMessage message={tree.error.message} onRetry={tree.reload} />
          ) : (
            <Spinner label="Đang tải thư mục..." />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              aria-label="Tìm asset"
              placeholder="Tìm theo tên, tên file, tag…"
              className={`${filterInput} min-w-0 flex-1`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <input
              ref={fileInput}
              type="file"
              accept={acceptFor(kind)}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                void quickUpload(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <button
              type="button"
              className={btn.secondary}
              disabled={folderId === null || uploading}
              title={folderId === null ? 'Chọn một thư mục để tải lên' : undefined}
              onClick={() => fileInput.current?.click()}
            >
              <Upload aria-hidden className="size-4" />
              {uploading ? 'Đang tải...' : 'Tải lên'}
            </button>
          </div>
          {list.error && !list.data ? (
            <ErrorMessage message={list.error.message} onRetry={list.reload} />
          ) : !list.data ? (
            <Spinner label="Đang tải asset..." />
          ) : list.data.items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Không có asset nào phù hợp.</p>
          ) : (
            <>
              <ul className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-4">
                {list.data.items.map((asset) => {
                  const isSelected = selected?.id === asset.id
                  return (
                    <li key={asset.id}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelected(asset)}
                        onDoubleClick={() => onSelect(asset)}
                        className={`flex w-full flex-col gap-1.5 rounded-xl border p-1.5 text-left ${
                          isSelected ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-stone-200 hover:border-indigo-300'
                        }`}
                      >
                        <AssetThumb asset={asset} />
                        <span className="line-clamp-2 text-xs font-medium text-stone-900">{asset.title}</span>
                        {missingAlt(asset) && <MissingAlt />}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <Pagination page={list.data.page} totalPages={list.data.totalPages} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
