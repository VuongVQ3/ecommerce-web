import { Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { btn, filterInput, table } from '../../admin/styles'
import { Badge, Dialog, EmptyState, PageHeader, Pagination, TableFrame } from '../../admin/ui'
import { ErrorMessage, Spinner } from '../../components/Feedback'
import { formatAdminDateTime } from '../../lib/format'
import { useAsync } from '../../lib/useAsync'
import { cfApi, FRAGMENT_STATUS_LABEL, STATUS_TONE, type FragmentStatus } from './cfApi'
import { FragmentsTabs } from './FragmentsTabs'

const PAGE_SIZE = 30

const toNumber = (value: string | null) => (value && /^\d+$/.test(value) ? Number(value) : null)
const toStatus = (value: string | null): FragmentStatus | null =>
  value === 'DRAFT' || value === 'PUBLISHED' || value === 'MODIFIED' ? value : null

/**
 * Fragments, filtered by model, folder, status and text (all in the URL: ?model=&folder=&status=&q=&page=), with a
 * "new fragment" button that asks for the model first.
 */
export default function FragmentsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const modelId = toNumber(params.get('model'))
  const folder = params.get('folder') ?? ''
  const status = toStatus(params.get('status'))
  const q = params.get('q') ?? ''
  const page = toNumber(params.get('page')) ?? 0

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

  // Search text reaches the URL 300 ms after the last key
  const [search, setSearch] = useState(q)
  const applied = useRef(q)
  useEffect(() => {
    if (q !== applied.current) {
      applied.current = q
      setSearch(q)
    }
  }, [q])
  useEffect(() => {
    const next = search.trim()
    if (next === applied.current) return
    const timer = window.setTimeout(() => {
      applied.current = next
      update({ q: next }, true)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search, update])

  const models = useAsync((signal) => cfApi.models(signal), [])
  const folders = useAsync((signal) => cfApi.folders(signal), [])
  const list = useAsync(
    (signal) => cfApi.fragments({ modelId, folder, status, q, page, size: PAGE_SIZE }, signal),
    [modelId, folder, status, q, page],
  )
  const enabled = (models.data ?? []).filter((m) => m.status === 'ENABLED')
  const [choosing, setChoosing] = useState(false)
  const [newModel, setNewModel] = useState<number | null>(null)

  return (
    <>
      <PageHeader title="Content Fragments">
        <button
          type="button"
          className={btn.primary}
          disabled={!enabled.length}
          onClick={() => {
            setNewModel(modelId && enabled.some((m) => m.id === modelId) ? modelId : (enabled[0]?.id ?? null))
            setChoosing(true)
          }}
        >
          <Plus aria-hidden className="size-4" />
          Tạo fragment
        </button>
      </PageHeader>
      <FragmentsTabs />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <input
          type="search"
          aria-label="Tìm fragment"
          placeholder="Tìm theo tiêu đề hoặc tên…"
          className={`${filterInput} md:w-72`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Model" className={`${filterInput} md:w-48`} value={modelId ?? ''} onChange={(e) => update({ model: e.target.value || null })}>
          <option value="">Tất cả model</option>
          {(models.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select aria-label="Thư mục" className={`${filterInput} md:w-48`} value={folder} onChange={(e) => update({ folder: e.target.value || null })}>
          <option value="">Tất cả thư mục</option>
          {(folders.data ?? []).map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select aria-label="Trạng thái" className={`${filterInput} md:w-48`} value={status ?? ''} onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">Mọi trạng thái</option>
          {(Object.keys(FRAGMENT_STATUS_LABEL) as FragmentStatus[]).map((s) => (
            <option key={s} value={s}>
              {FRAGMENT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {list.error && !list.data ? (
        <ErrorMessage message={list.error.message} onRetry={list.reload} />
      ) : !list.data ? (
        <Spinner />
      ) : list.data.items.length === 0 ? (
        <EmptyState title={q || modelId || folder || status ? 'Không có fragment nào khớp bộ lọc' : 'Chưa có fragment nào'} />
      ) : (
        <>
          <TableFrame>
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col" className={table.th}>
                    Tiêu đề
                  </th>
                  <th scope="col" className={table.th}>
                    Model
                  </th>
                  <th scope="col" className={table.th}>
                    Thư mục
                  </th>
                  <th scope="col" className={table.th}>
                    Trạng thái
                  </th>
                  <th scope="col" className={table.th}>
                    Cập nhật
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((f) => (
                  <tr key={f.id} className="hover:bg-stone-50">
                    <td className={table.td}>
                      <Link to={`/author/fragments/${f.id}`} className="font-medium text-stone-900 hover:text-indigo-700 hover:underline">
                        {f.title}
                      </Link>
                      <span className="block font-mono text-xs text-muted">{f.name}</span>
                    </td>
                    <td className={table.td}>{f.model.name}</td>
                    <td className={`${table.td} font-mono text-xs`}>{f.folderPath}</td>
                    <td className={table.td}>
                      <Badge tone={STATUS_TONE[f.status]}>{FRAGMENT_STATUS_LABEL[f.status]}</Badge>
                    </td>
                    <td className={`${table.td} whitespace-nowrap`}>
                      {formatAdminDateTime(f.updatedAt)}
                      {f.updatedByName && <span className="block text-xs text-muted">{f.updatedByName}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
          <Pagination page={list.data.page} totalPages={list.data.totalPages} onChange={(p) => update({ page: p > 0 ? String(p) : null })} />
        </>
      )}

      {choosing && (
        <Dialog
          title="Tạo fragment"
          submitLabel="Tiếp tục"
          submitDisabled={newModel === null}
          onClose={() => setChoosing(false)}
          onSubmit={() => navigate(`/author/fragments/new?model=${newModel}${folder ? `&folder=${encodeURIComponent(folder)}` : ''}`)}
        >
          <label className="text-sm">
            <span className="mb-1 block font-medium text-stone-700">Theo model</span>
            <select className={filterInput} value={newModel ?? ''} onChange={(e) => setNewModel(Number(e.target.value))}>
              {enabled.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </Dialog>
      )}
    </>
  )
}
