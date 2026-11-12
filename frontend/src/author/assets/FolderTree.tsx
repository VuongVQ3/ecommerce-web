import { ChevronRight, Folder, FolderOpen, Layers } from 'lucide-react'
import { useMemo, useState } from 'react'
import { input } from '../../admin/styles'
import { flattenFolders, type FolderNode } from './damApi'

/** Ids of the folders above (and including) the given one. */
function pathTo(tree: FolderNode[], id: number | null): number[] {
  if (id === null) return []
  for (const node of tree) {
    if (node.id === id) return [node.id]
    const below = pathTo(node.children, id)
    if (below.length) return [node.id, ...below]
  }
  return []
}

function Node({
  node,
  selectedId,
  open,
  onToggle,
  onSelect,
}: {
  node: FolderNode
  selectedId: number | null
  open: Set<number>
  onToggle: (id: number) => void
  onSelect: (id: number) => void
}) {
  const expanded = open.has(node.id)
  const selected = node.id === selectedId
  const Icon = expanded && node.children.length ? FolderOpen : Folder
  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded-lg pr-2 text-sm ${selected ? 'bg-indigo-600 text-white' : 'text-stone-700 hover:bg-stone-100'}`}
      >
        {node.children.length ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Đóng' : 'Mở'} thư mục ${node.name}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md"
          >
            <ChevronRight aria-hidden className={`size-4 transition ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="size-7 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          aria-current={selected ? 'true' : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        >
          <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{node.name}</span>
          <span className={`ml-auto text-xs tabular-nums ${selected ? 'text-indigo-100' : 'text-stone-500'}`}>
            {node.assetCount}
            <span className="sr-only"> asset</span>
          </span>
        </button>
      </div>
      {expanded && node.children.length > 0 && (
        <ul className="ml-4 border-l border-stone-200 pl-1">
          {node.children.map((child) => (
            <Node key={child.id} node={child} selectedId={selectedId} open={open} onToggle={onToggle} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * The folder tree: open/close, asset count per folder, the selected folder highlighted. Starts with the root and
 * the way down to the selected folder opened. {@code allLabel} adds an entry for "every folder" (selection null).
 */
export function FolderTree({
  tree,
  selectedId,
  onSelect,
  allLabel,
}: {
  tree: FolderNode[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  allLabel?: string
}) {
  const [toggled, setToggled] = useState<Map<number, boolean>>(new Map())
  const open = useMemo(() => {
    const ids = new Set<number>([...tree.map((n) => n.id), ...pathTo(tree, selectedId)])
    for (const [id, on] of toggled) {
      if (on) ids.add(id)
      else ids.delete(id)
    }
    return ids
  }, [tree, selectedId, toggled])
  const toggle = (id: number) => setToggled((m) => new Map(m).set(id, !open.has(id)))
  return (
    <ul aria-label="Thư mục" className="flex flex-col gap-0.5">
      {allLabel && (
        <li>
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-current={selectedId === null ? 'true' : undefined}
            className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 pl-8 text-left text-sm ${
              selectedId === null ? 'bg-indigo-600 text-white' : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <Layers aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            {allLabel}
          </button>
        </li>
      )}
      {tree.map((node) => (
        <Node key={node.id} node={node} selectedId={selectedId} open={open} onToggle={toggle} onSelect={onSelect} />
      ))}
    </ul>
  )
}

/** The same folders as a select (phones, the move dialog): indented by depth, with the asset count. */
export function FolderSelect({
  tree,
  value,
  onChange,
  allLabel,
  id,
  label = 'Thư mục',
}: {
  tree: FolderNode[]
  value: number | null
  onChange: (id: number | null) => void
  allLabel?: string
  id?: string
  label?: string
}) {
  return (
    <select
      id={id}
      aria-label={id ? undefined : label}
      className={input}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      {allLabel && <option value="">{allLabel}</option>}
      {flattenFolders(tree).map((f) => (
        <option key={f.id} value={f.id}>
          {`${'  '.repeat(f.depth)}${f.name} (${f.assetCount})`}
        </option>
      ))}
    </select>
  )
}
