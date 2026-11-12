import { FilePlus2, FolderInput, Plus } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { btn, input } from '../../admin/styles'
import { useDragReorder } from '../../admin/useDragReorder'
import { Badge, Dialog, EmptyState, PageHeader } from '../../admin/ui'
import { ErrorMessage, Spinner } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { ApiError } from '../../lib/api'
import { numericKey } from '../../lib/numericKey'
import { useAsync } from '../../lib/useAsync'
import { TEMPLATES, type Template } from '../../cms/registry'
import { FRAGMENT_STATUS_LABEL, STATUS_TONE } from '../fragments/cfApi'
import { flattenTree, sitesApi, type TreeNode } from './sitesApi'

function Siblings({
  nodes,
  parentId,
  keyOf,
  onMove,
  onAddChild,
  onRelocate,
}: {
  nodes: TreeNode[]
  parentId: string | null
  keyOf: (id: string) => number
  onMove: (page: TreeNode, parentId: string | null, to: number) => void
  onAddChild: (parent: TreeNode) => void
  onRelocate: (page: TreeNode) => void
}) {
  const list = parentId ?? 'root'
  const { dragging, rowProps, handleProps } = useDragReorder(nodes, (n) => keyOf(n.id), (_key, from, to) => {
    if (from !== to) onMove(nodes[from], parentId, to)
  })
  return (
    <ol className="flex flex-col gap-1.5">
      {nodes.map((node, index) => (
        <li key={node.id}>
          <div
            {...rowProps(list, keyOf(node.id), index)}
            className={`flex flex-wrap items-center gap-2 rounded-xl border bg-white px-2 py-2 ${dragging === keyOf(node.id) ? 'border-indigo-500 shadow-lg' : 'border-stone-200'}`}
          >
            <button
              type="button"
              aria-label={`Đổi thứ tự: ${node.title}`}
              className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100"
              {...handleProps(list, keyOf(node.id), index)}
            >
              <span aria-hidden>⠿</span>
            </button>
            <span className="min-w-0 flex-1">
              <Link to={`/author/sites/${node.id}`} className="font-medium text-stone-900 hover:text-indigo-700 hover:underline">
                {node.title}
              </Link>
              <span className="block truncate font-mono text-xs text-muted">{node.path}</span>
            </span>
            <span className="text-xs text-stone-500">{TEMPLATES.find((t) => t.key === node.template)?.label ?? node.template}</span>
            <Badge tone={STATUS_TONE[node.status]}>{FRAGMENT_STATUS_LABEL[node.status]}</Badge>
            <button type="button" className={btn.link} onClick={() => onAddChild(node)} aria-label={`Thêm trang con vào ${node.title}`}>
              <FilePlus2 aria-hidden className="inline size-4" />
            </button>
            <button type="button" className={btn.link} onClick={() => onRelocate(node)} aria-label={`Chuyển ${node.title} sang trang cha khác`}>
              <FolderInput aria-hidden className="inline size-4" />
            </button>
          </div>
          {node.children.length > 0 && (
            <div className="mt-1.5 ml-6 border-l border-stone-200 pl-3">
              <Siblings nodes={node.children} parentId={node.id} keyOf={keyOf} onMove={onMove} onAddChild={onAddChild} onRelocate={onRelocate} />
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

/**
 * Sites console: every CMS page as a tree with its status. Drag the handle (or ↑/↓ on it) to reorder pages among
 * their siblings; the folder button moves a page under another parent (its address changes, the old one redirects).
 */
export default function SitesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const keyOf = numericKey
  const ids = { title: useId(), name: useId(), template: useId(), parent: useId() }
  const tree = useAsync((signal) => sitesApi.tree(signal), [])
  const flat = useMemo(() => flattenTree(tree.data ?? []), [tree.data])

  const [creating, setCreating] = useState<{ parentId: string | null; title: string; name: string; template: Template } | null>(null)
  const [moving, setMoving] = useState<{ page: TreeNode; parentId: string | null } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setPending(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fieldErrors)[0] ?? err.message) : 'Không thực hiện được')
    } finally {
      setPending(false)
    }
  }

  const reorder = (page: TreeNode, parentId: string | null, to: number) =>
    void sitesApi.move(page.id, parentId, to).then(tree.reload, (err: Error) => toast({ message: err.message, tone: 'error' }))

  const movingTargets = moving ? flat.filter((n) => n.id !== moving.page.id && !n.path.startsWith(`${moving.page.path}/`)) : []

  return (
    <>
      <PageHeader title="Sites">
        <button
          type="button"
          className={btn.primary}
          onClick={() => {
            setError(null)
            setCreating({ parentId: null, title: '', name: '', template: 'landing' })
          }}
        >
          <Plus aria-hidden className="size-4" />
          Trang mới
        </button>
      </PageHeader>
      {tree.error && !tree.data ? (
        <ErrorMessage message={tree.error.message} onRetry={tree.reload} />
      ) : !tree.data ? (
        <Spinner />
      ) : tree.data.length === 0 ? (
        <EmptyState title="Chưa có trang nào">Bấm “Trang mới” để dựng trang đầu tiên.</EmptyState>
      ) : (
        <Siblings
          nodes={tree.data}
          parentId={null}
          keyOf={keyOf}
          onMove={reorder}
          onAddChild={(parent) => {
            setError(null)
            setCreating({ parentId: parent.id, title: '', name: '', template: 'content' })
          }}
          onRelocate={(page) => {
            setError(null)
            setMoving({ page, parentId: page.parentId })
          }}
        />
      )}

      {creating && (
        <Dialog
          title="Trang mới"
          submitLabel="Tạo trang"
          pending={pending}
          error={error}
          submitDisabled={!creating.title.trim()}
          onClose={() => setCreating(null)}
          onSubmit={() =>
            void run(async () => {
              const page = await sitesApi.create({
                parentId: creating.parentId,
                title: creating.title.trim(),
                name: creating.name.trim() || undefined,
                template: creating.template,
              })
              navigate(`/author/sites/${page.id}`)
            })
          }
        >
          <div>
            <label htmlFor={ids.parent} className="mb-1 block text-sm font-medium text-stone-700">
              Trang cha
            </label>
            <select id={ids.parent} className={input} value={creating.parentId ?? ''} onChange={(e) => setCreating({ ...creating, parentId: e.target.value || null })}>
              <option value="">— Cấp cao nhất —</option>
              {flat.map((n) => (
                <option key={n.id} value={n.id}>
                  {`${'  '.repeat(n.depth)}${n.title} (${n.path})`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.title} className="mb-1 block text-sm font-medium text-stone-700">
              Tiêu đề
            </label>
            <input id={ids.title} className={input} value={creating.title} maxLength={200} onChange={(e) => setCreating({ ...creating, title: e.target.value })} />
          </div>
          <div>
            <label htmlFor={ids.name} className="mb-1 block text-sm font-medium text-stone-700">
              Tên trong đường dẫn
            </label>
            <input id={ids.name} className={`${input} font-mono`} placeholder="tự tạo từ tiêu đề" value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor={ids.template} className="mb-1 block text-sm font-medium text-stone-700">
              Mẫu trang
            </label>
            <select id={ids.template} className={input} value={creating.template} onChange={(e) => setCreating({ ...creating, template: e.target.value as Template })}>
              {TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </Dialog>
      )}

      {moving && (
        <Dialog
          title={`Chuyển “${moving.page.title}”`}
          submitLabel="Chuyển"
          pending={pending}
          error={error}
          submitDisabled={moving.parentId === moving.page.parentId}
          onClose={() => setMoving(null)}
          onSubmit={() =>
            void run(async () => {
              await sitesApi.move(moving.page.id, moving.parentId)
              setMoving(null)
              tree.reload()
              toast({ message: 'Đã chuyển trang. Địa chỉ cũ sẽ tự chuyển hướng.', tone: 'success' })
            })
          }
        >
          <label className="text-sm">
            <span className="mb-1 block font-medium text-stone-700">Trang cha mới</span>
            <select className={input} value={moving.parentId ?? ''} onChange={(e) => setMoving({ ...moving, parentId: e.target.value || null })}>
              <option value="">— Cấp cao nhất —</option>
              {movingTargets.map((n) => (
                <option key={n.id} value={n.id}>
                  {`${'  '.repeat(n.depth)}${n.title} (${n.path})`}
                </option>
              ))}
            </select>
          </label>
        </Dialog>
      )}
    </>
  )
}
