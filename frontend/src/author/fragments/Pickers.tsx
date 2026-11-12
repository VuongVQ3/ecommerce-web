import { useEffect, useState, type ReactNode } from 'react'
import { filterInput } from '../../admin/styles'
import { Badge } from '../../admin/ui'
import { ErrorMessage, Spinner } from '../../components/Feedback'
import Modal from '../../components/Modal'
import { api } from '../../lib/api'
import { formatPrice } from '../../lib/format'
import { useAsync } from '../../lib/useAsync'
import { cfApi, FRAGMENT_STATUS_LABEL, type RefSummary } from './cfApi'

/** Search text that settles 300 ms after the last key. */
function useSettled(value: string) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [value])
  return settled
}

function PickerList<T>({
  items,
  keyOf,
  selected,
  onSelect,
  onChoose,
  render,
}: {
  items: T[]
  keyOf: (item: T) => string
  selected: string | null
  onSelect: (item: T) => void
  onChoose: (item: T) => void
  render: (item: T) => ReactNode
}) {
  return (
    <ul className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
      {items.map((item) => (
        <li key={keyOf(item)}>
          <button
            type="button"
            aria-pressed={selected === keyOf(item)}
            onClick={() => onSelect(item)}
            onDoubleClick={() => onChoose(item)}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm ${
              selected === keyOf(item) ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-stone-200 hover:border-indigo-300'
            }`}
          >
            {render(item)}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Choose a fragment, limited to some models (a fragment field's allowedModels); never the fragment being edited. */
export function FragmentPicker({
  modelSlugs,
  exclude,
  onSelect,
  onClose,
}: {
  modelSlugs: string[]
  exclude?: string
  onSelect: (ref: RefSummary) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const q = useSettled(text)
  const [selected, setSelected] = useState<RefSummary | null>(null)
  const list = useAsync((signal) => cfApi.fragments({ modelSlugs, q, size: 50 }, signal), [modelSlugs.join(','), q])
  const items = (list.data?.items ?? []).filter((f) => f.id !== exclude)
  const toRef = (f: (typeof items)[number]): RefSummary => ({ id: f.id, type: 'FRAGMENT', title: f.title, thumb: null, status: f.status })
  return (
    <Modal
      title="Chọn fragment"
      width="40rem"
      submitLabel="Chọn"
      cancelLabel="Huỷ"
      submitDisabled={!selected}
      onClose={onClose}
      onSubmit={() => selected && onSelect(selected)}
    >
      <input type="search" aria-label="Tìm fragment" placeholder="Tìm theo tiêu đề…" className={filterInput} value={text} onChange={(e) => setText(e.target.value)} />
      {list.error && !list.data ? (
        <ErrorMessage message={list.error.message} onRetry={list.reload} />
      ) : !list.data ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Không có fragment nào phù hợp.</p>
      ) : (
        <PickerList
          items={items}
          keyOf={(f) => f.id}
          selected={selected?.id ?? null}
          onSelect={(f) => setSelected(toRef(f))}
          onChoose={(f) => onSelect(toRef(f))}
          render={(f) => (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-stone-900">{f.title}</span>
                <span className="block truncate text-xs text-muted">
                  {f.model.name} · {f.folderPath}
                </span>
              </span>
              <Badge tone={f.status === 'DRAFT' ? 'gray' : f.status === 'PUBLISHED' ? 'green' : 'amber'}>{FRAGMENT_STATUS_LABEL[f.status]}</Badge>
            </>
          )}
        />
      )}
    </Modal>
  )
}

/** Choose a product on sale (the shop's own search). */
export function ProductPicker({ onSelect, onClose }: { onSelect: (ref: RefSummary) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const q = useSettled(text)
  const [selected, setSelected] = useState<RefSummary | null>(null)
  const list = useAsync((signal) => api.products({ q: q || undefined, size: 30 }, signal), [q])
  const toRef = (p: { id: number; name: string; imageUrl: string | null }): RefSummary => ({
    id: String(p.id),
    type: 'PRODUCT',
    title: p.name,
    thumb: p.imageUrl,
    status: 'ACTIVE',
  })
  return (
    <Modal
      title="Chọn sản phẩm"
      width="40rem"
      submitLabel="Chọn"
      cancelLabel="Huỷ"
      submitDisabled={!selected}
      onClose={onClose}
      onSubmit={() => selected && onSelect(selected)}
    >
      <input type="search" aria-label="Tìm sản phẩm" placeholder="Tìm theo tên…" className={filterInput} value={text} onChange={(e) => setText(e.target.value)} />
      {list.error && !list.data ? (
        <ErrorMessage message={list.error.message} onRetry={list.reload} />
      ) : !list.data ? (
        <Spinner />
      ) : list.data.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Không tìm thấy sản phẩm.</p>
      ) : (
        <PickerList
          items={list.data.items}
          keyOf={(p) => String(p.id)}
          selected={selected?.id ?? null}
          onSelect={(p) => setSelected(toRef(p))}
          onChoose={(p) => onSelect(toRef(p))}
          render={(p) => (
            <>
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span aria-hidden className="size-10 shrink-0 rounded-lg bg-stone-100" />
              )}
              <span className="min-w-0 flex-1 truncate font-medium text-stone-900">{p.name}</span>
              <span className="text-stone-600 tabular-nums">{formatPrice(p.price)}</span>
            </>
          )}
        />
      )}
    </Modal>
  )
}
