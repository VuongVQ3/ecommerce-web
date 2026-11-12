import { AlertCircle, CheckCircle2, FileText, Loader2, XCircle } from 'lucide-react'
import { Link } from 'react-router'
import { table } from '../../admin/styles'
import { TableFrame } from '../../admin/ui'
import { formatAdminDateTime } from '../../lib/format'
import { dimensions, formatBytes, KIND_LABEL, missingAlt } from './assetFormat'
import type { AssetRow } from './damApi'
import type { UploadItem } from './useUploadQueue'

/** Square thumbnail (rendition "thumb"); a PDF shows page 1 with "PDF · n trang". */
export function AssetThumb({ asset }: { asset: AssetRow }) {
  return (
    <span className="relative block aspect-square overflow-hidden rounded-xl bg-stone-100">
      {asset.renditions.thumb ? (
        <img src={asset.renditions.thumb} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-stone-400">
          <FileText aria-hidden className="size-10" />
        </span>
      )}
      {asset.kind === 'PDF' && (
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-stone-900/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          PDF{asset.pageCount ? ` · ${asset.pageCount} trang` : ''}
        </span>
      )}
    </span>
  )
}

export function MissingAlt() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
      <AlertCircle aria-hidden className="size-3.5" />
      Thiếu alt
    </span>
  )
}

export function AssetGrid({ items }: { items: AssetRow[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {items.map((asset) => (
        <li key={asset.id}>
          <Link
            to={`/author/assets/${asset.id}`}
            className="flex h-full flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-2 transition hover:border-indigo-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <AssetThumb asset={asset} />
            <span className="line-clamp-2 px-1 text-sm font-medium text-stone-900">{asset.title}</span>
            {missingAlt(asset) && (
              <span className="px-1">
                <MissingAlt />
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function AssetTable({ items }: { items: AssetRow[] }) {
  return (
    <TableFrame>
      <table className={table.table}>
        <thead>
          <tr>
            <th scope="col" className={table.th}>
              Tên
            </th>
            <th scope="col" className={table.th}>
              Loại
            </th>
            <th scope="col" className={table.th}>
              Dung lượng
            </th>
            <th scope="col" className={table.th}>
              Kích thước
            </th>
            <th scope="col" className={table.th}>
              Cập nhật lúc
            </th>
            <th scope="col" className={table.th}>
              Người cập nhật
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((asset) => (
            <tr key={asset.id} className="hover:bg-stone-50">
              <td className={table.td}>
                <Link to={`/author/assets/${asset.id}`} className="font-medium text-stone-900 hover:text-indigo-700 hover:underline">
                  {asset.title}
                </Link>
                <span className="block text-xs text-muted">{asset.fileName}</span>
                {missingAlt(asset) && <MissingAlt />}
              </td>
              <td className={table.td}>{KIND_LABEL[asset.kind]}</td>
              <td className={`${table.td} tabular-nums`}>{formatBytes(asset.sizeBytes)}</td>
              <td className={`${table.td} tabular-nums`}>{dimensions(asset)}</td>
              <td className={`${table.td} whitespace-nowrap`}>{formatAdminDateTime(asset.updatedAt)}</td>
              <td className={table.td}>{asset.updatedByName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  )
}

const STATUS_TEXT: Record<UploadItem['status'], string> = {
  waiting: 'Đang chờ',
  uploading: 'Đang tải',
  done: 'Xong',
  error: 'Lỗi',
  duplicate: 'Đã có trong kho',
}

/** One row per file: waiting / uploading / done / error with the reason / already in the library with a link. */
export function UploadPanel({ items, onClear }: { items: UploadItem[]; onClear?: () => void }) {
  if (!items.length) return null
  const finished = items.every((i) => i.status !== 'waiting' && i.status !== 'uploading')
  return (
    <section aria-label="Tải lên" className="rounded-2xl border border-stone-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-stone-900">Tải lên</h2>
        {finished && onClear && (
          <button type="button" onClick={onClear} className="text-sm text-stone-600 underline hover:text-indigo-700">
            Xoá danh sách
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-1.5 text-sm" aria-live="polite">
        {items.map((item) => (
          <li key={item.key} data-testid="upload-item" data-status={item.status} className="flex flex-wrap items-center gap-2">
            {item.status === 'uploading' || item.status === 'waiting' ? (
              <Loader2 aria-hidden className={`size-4 shrink-0 text-stone-400 ${item.status === 'uploading' ? 'animate-spin' : ''}`} />
            ) : item.status === 'done' ? (
              <CheckCircle2 aria-hidden className="size-4 shrink-0 text-brand-600" />
            ) : item.status === 'duplicate' ? (
              <AlertCircle aria-hidden className="size-4 shrink-0 text-amber-600" />
            ) : (
              <XCircle aria-hidden className="size-4 shrink-0 text-danger" />
            )}
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span className={item.status === 'error' ? 'text-danger' : 'text-stone-600'}>
              {item.status === 'error' && item.message ? item.message : STATUS_TEXT[item.status]}
            </span>
            {item.status === 'duplicate' && item.assetId && (
              <Link to={`/author/assets/${item.assetId}`} className="font-semibold text-indigo-700 underline">
                Xem asset đã có
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
