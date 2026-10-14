import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { userApi, type AuditRow } from '../lib/adminApi'
import { formatAdminDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { DateRangeFilter } from './DateField'
import { input } from './styles'
import { EmptyState, PageHeader, Pagination } from './ui'

const ENTITY_LABEL: Record<string, string> = {
  ORDER: 'Đơn hàng',
  PRODUCT: 'Sản phẩm',
  CATEGORY: 'Danh mục',
  USER: 'Người dùng',
  PHONE: 'Số điện thoại',
}

const ACTION_LABEL: Record<string, string> = {
  ORDER_CLAIMED: 'Gắn đơn vào tài khoản',
  ORDER_CONTACT_FAILED: 'Chưa liên hệ được khách',
  ORDER_NOTE_ADDED: 'Thêm ghi chú đơn',
  PHONE_FLAG_CREATED: 'Đánh dấu số điện thoại',
  PHONE_FLAG_UPDATED: 'Sửa đánh dấu số điện thoại',
  PHONE_FLAG_REMOVED: 'Bỏ đánh dấu số điện thoại',
  PRODUCT_CREATED: 'Thêm sản phẩm',
  PRODUCT_UPDATED: 'Sửa sản phẩm',
  PRODUCT_HIDDEN: 'Ẩn sản phẩm',
  PRODUCT_SHOWN: 'Hiện sản phẩm',
  PRODUCT_IMAGE_ADDED: 'Thêm ảnh sản phẩm',
  PRODUCT_IMAGE_DELETED: 'Xoá ảnh sản phẩm',
  PRODUCT_IMAGE_PRIMARY: 'Đổi ảnh chính',
  PROMOTION_CREATED: 'Tạo khuyến mại',
  PROMOTION_UPDATED: 'Sửa khuyến mại',
  PROMOTION_CANCELLED: 'Huỷ khuyến mại',
  PROMOTION_ENDED: 'Kết thúc khuyến mại',
  STOCK_IMPORTED: 'Nhập kho',
  STOCK_ADJUSTED: 'Kiểm kho',
  CATEGORY_CREATED: 'Thêm danh mục',
  CATEGORY_UPDATED: 'Sửa danh mục',
  USER_INVITED: 'Mời nhân viên',
  USER_ROLE_CHANGED: 'Đổi vai trò',
  USER_LOCKED: 'Khoá tài khoản',
  USER_UNLOCKED: 'Mở khoá tài khoản',
  USER_PROMOTED: 'Cấp quyền quản trị',
  USER_EMAIL_VERIFIED: 'Xác minh email',
  USER_PASSWORD_SET: 'Đặt mật khẩu',
}

/** Where an entity id leads in the back office, when there is a page for it. */
function entityLink(row: AuditRow): string | null {
  if (row.entityType === 'ORDER') return `/admin/don-hang/${row.entityId}`
  if (row.entityType === 'USER') return `/admin/nguoi-dung/${row.entityId}`
  if (row.entityType === 'PRODUCT') return `/admin/san-pham/${row.entityId}`
  if (row.entityType === 'PHONE') return `/admin/don-hang?q=${encodeURIComponent(row.entityId)}`
  return null
}

function pretty(json: string | null): string {
  if (!json) return '—'
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

function Row({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false)
  const link = entityLink(row)
  const hasChanges = row.before !== null || row.after !== null
  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold text-stone-900">{ACTION_LABEL[row.action] ?? row.action}</p>
        <time dateTime={row.createdAt} className="text-muted tabular-nums">
          {formatAdminDateTime(row.createdAt)}
        </time>
      </div>
      <p className="mt-1 break-words text-stone-700">
        {row.actorName ?? 'Hệ thống'}
        {row.actorEmail && <span className="text-muted"> · {row.actorEmail}</span>}
      </p>
      <p className="mt-1 text-stone-600">
        {ENTITY_LABEL[row.entityType] ?? row.entityType}:{' '}
        {link ? (
          <Link to={link} className="font-mono break-all text-brand-700 hover:underline">
            {row.entityId}
          </Link>
        ) : (
          <span className="font-mono break-all">{row.entityId}</span>
        )}
      </p>
      {hasChanges && (
        <>
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mt-2 text-sm font-semibold text-brand-700 hover:underline">
            {open ? 'Ẩn chi tiết' : 'Xem trước / sau'}
          </button>
          {open && (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold text-muted uppercase">Trước</p>
                <pre className="overflow-x-auto rounded-xl bg-stone-50 p-3 text-xs whitespace-pre-wrap break-words">{pretty(row.before)}</pre>
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold text-muted uppercase">Sau</p>
                <pre className="overflow-x-auto rounded-xl bg-stone-50 p-3 text-xs whitespace-pre-wrap break-words">{pretty(row.after)}</pre>
              </div>
            </div>
          )}
        </>
      )}
    </li>
  )
}

/** Admin only: who changed what, newest first. */
export default function AuditLogPage() {
  const [params, setParams] = useSearchParams()
  const actor = params.get('actor') ?? ''
  const entityType = params.get('entityType') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const page = Number(params.get('page') ?? 0)
  const actors = useAsync((signal) => userApi.auditActors(signal), [])
  const { data, error, loading, reload } = useAsync(
    (signal) => userApi.auditLogs({ actor, entityType, from, to, page }, signal),
    [actor, entityType, from, to, page],
  )

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  return (
    <>
      <PageHeader title="Nhật ký thao tác" />
      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
        <select aria-label="Người thao tác" value={actor} onChange={(e) => update({ actor: e.target.value })} className={input}>
          <option value="">Mọi người thao tác</option>
          {actors.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.email})
            </option>
          ))}
        </select>
        <select aria-label="Loại đối tượng" value={entityType} onChange={(e) => update({ entityType: e.target.value })} className={input}>
          <option value="">Mọi đối tượng</option>
          {Object.entries(ENTITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <DateRangeFilter from={from} to={to} onChange={(r) => update(r)} />
      </div>

      {error ? (
        <ErrorMessage message={error.message} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="Không có thao tác nào khớp bộ lọc." />
      ) : (
        <div aria-busy={loading}>
          <ul className="space-y-3">
            {data.items.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(n) => update({ page: String(n) })} />
        </div>
      )}
    </>
  )
}
