import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { ErrorMessage } from '../components/Feedback'
import { useToast } from '../components/Toast'
import type { Role } from '../lib/api'
import { adminApi, userApi, type AdminUserRow, type PhoneFlagLevel, type PhoneFlagView } from '../lib/adminApi'
import { formatAdminDateTime, formatPrice } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { Skeleton } from './Skeleton'
import { FLAG_LABEL, FLAG_STYLE, ROLE_LABEL } from './labels'
import { FlagDialog } from './phoneFlags'
import { btn, filterInput, table } from './styles'
import { EmptyState, FilterBar, PageHeader, Pagination, SearchFilter, TableFrame } from './ui'
import { AccountStatus, InviteDialog, RoleBadge, UserActions } from './userActions'

type Params = ReturnType<typeof useSearchParams>

function useUpdate([params, setParams]: Params) {
  return (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }
}

function Accounts({ params }: { params: Params }) {
  const update = useUpdate(params)
  const p = params[0]
  const q = p.get('q') ?? ''
  const role = (p.get('role') ?? '') as Role | ''
  const active = (p.get('active') ?? '') as '' | 'true' | 'false'
  const page = Number(p.get('page') ?? 0)
  const { data, error, loading, reload } = useAsync((signal) => userApi.list({ q, role, active, page }, signal), [q, role, active, page])

  return (
    <>
      <FilterBar>
        <SearchFilter
          key={q}
          initial={q}
          placeholder="Tên, email hoặc số điện thoại"
          label="Tìm theo tên, email hoặc số điện thoại"
          onSearch={(text) => update({ q: text })}
        />
        <select aria-label="Lọc theo vai trò" value={role} onChange={(e) => update({ role: e.target.value })} className={`${filterInput} md:w-44`}>
          <option value="">Mọi vai trò</option>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select aria-label="Lọc theo trạng thái" value={active} onChange={(e) => update({ active: e.target.value })} className={`${filterInput} md:w-44`}>
          <option value="">Mọi trạng thái</option>
          <option value="true">Hoạt động</option>
          <option value="false">Đã khoá</option>
        </select>
      </FilterBar>

      {error ? (
        <ErrorMessage message={error.message} onRetry={reload} />
      ) : !data ? (
        <Skeleton variant="table" />
      ) : data.items.length === 0 ? (
        <EmptyState title="Không có tài khoản nào." />
      ) : (
        <div aria-busy={loading}>
          <ul className="space-y-3 md:hidden">
            {data.items.map((u) => (
              <li key={u.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/admin/nguoi-dung/${u.id}`} title={u.fullName} className="min-w-0 truncate font-semibold text-brand-700 hover:underline">
                    {u.fullName}
                  </Link>
                  <UserActions user={u} onChanged={reload} />
                </div>
                <p className="truncate text-sm text-stone-600" title={u.email}>
                  {u.email}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <RoleBadge role={u.role} />
                  <AccountStatus user={u} />
                </div>
                <p className="mt-2 text-sm text-muted tabular-nums">
                  {u.orderCount} đơn · {formatPrice(u.spent)}
                </p>
              </li>
            ))}
          </ul>
          <UserTable rows={data.items} onChanged={reload} />
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(n) => update({ page: String(n) })} />
        </div>
      )}
    </>
  )
}

function UserTable({ rows, onChanged }: { rows: AdminUserRow[]; onChanged: () => void }) {
  return (
    <TableFrame className="hidden md:block">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className={table.th}>Người dùng</th>
            <th className={table.th}>Vai trò</th>
            <th className={table.th}>Trạng thái</th>
            <th className={`${table.th} text-right`}>Đơn / Đã mua</th>
            <th className={`${table.th} hidden xl:table-cell`}>Ngày tạo</th>
            <th className={table.th}>
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="hover:bg-stone-50">
              <td className={table.td}>
                <Link to={`/admin/nguoi-dung/${u.id}`} title={u.fullName} className="block max-w-72 truncate font-semibold text-brand-700 hover:underline">
                  {u.fullName}
                </Link>
                <div className="max-w-72 truncate text-stone-600" title={u.email}>
                  {u.email}
                </div>
                {u.phone && <div className="text-stone-600 tabular-nums">{u.phone}</div>}
              </td>
              <td className={table.td}>
                <RoleBadge role={u.role} />
              </td>
              <td className={table.td}>
                <AccountStatus user={u} />
              </td>
              <td className={`${table.td} text-right whitespace-nowrap tabular-nums`}>
                {u.orderCount}
                <div className="text-muted">{formatPrice(u.spent)}</div>
              </td>
              <td className={`${table.td} hidden whitespace-nowrap tabular-nums xl:table-cell`}>{formatAdminDateTime(u.createdAt)}</td>
              <td className={`${table.td} w-14`}>
                <UserActions user={u} onChanged={onChanged} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  )
}

function PhoneFlags({ params }: { params: Params }) {
  const update = useUpdate(params)
  const { user } = useAuth()
  const toast = useToast()
  const p = params[0]
  const q = p.get('q') ?? ''
  const level = (p.get('level') ?? '') as PhoneFlagLevel | ''
  const page = Number(p.get('page') ?? 0)
  const { data, error, loading, reload } = useAsync((signal) => adminApi.phoneFlags(level, q, page, signal), [level, q, page])
  const [editing, setEditing] = useState<PhoneFlagView | null>(null)

  return (
    <>
      <FilterBar>
        <SearchFilter key={q} initial={q} placeholder="Số điện thoại" label="Tìm số điện thoại" onSearch={(text) => update({ q: text })} />
        <select aria-label="Lọc theo mức" value={level} onChange={(e) => update({ level: e.target.value })} className={`${filterInput} md:w-44`}>
          <option value="">Mọi mức</option>
          <option value="WATCH">{FLAG_LABEL.WATCH}</option>
          <option value="BLOCK_COD">{FLAG_LABEL.BLOCK_COD}</option>
        </select>
      </FilterBar>
      {error ? (
        <ErrorMessage message={error.message} onRetry={reload} />
      ) : !data ? (
        <Skeleton variant="list" />
      ) : data.items.length === 0 ? (
        <EmptyState title="Chưa có số điện thoại nào bị đánh dấu.">Đánh dấu từ trang chi tiết đơn hàng, ở khối Khách hàng.</EmptyState>
      ) : (
        <div aria-busy={loading}>
          <ul className="space-y-3">
            {data.items.map((f) => (
              <li key={f.phone} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/admin/don-hang?q=${encodeURIComponent(f.phone)}`} className="font-semibold text-brand-700 tabular-nums hover:underline">
                      {f.phone}
                    </Link>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${FLAG_STYLE[f.level]}`}>{FLAG_LABEL[f.level]}</span>
                  </div>
                  <p className="mt-1 break-words text-stone-800">{f.reason}</p>
                  <p className="mt-1 text-xs text-muted">
                    {f.updatedByName ?? 'Không rõ'} · {formatAdminDateTime(f.updatedAt)}
                  </p>
                </div>
                <button type="button" className={btn.secondary} onClick={() => setEditing(f)}>
                  Sửa
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(n) => update({ page: String(n) })} />
        </div>
      )}
      {editing && user && (
        <FlagDialog
          phone={editing.phone}
          current={editing}
          role={user.role}
          onClose={() => setEditing(null)}
          onDone={(flag) => {
            setEditing(null)
            reload()
            toast({ message: flag ? 'Đã lưu đánh dấu' : 'Đã bỏ đánh dấu', tone: 'success' })
          }}
        />
      )}
    </>
  )
}

const tabClass = (active: boolean) =>
  `shrink-0 border-b-2 px-1 pb-2 text-sm font-semibold whitespace-nowrap ${
    active ? 'border-brand-600 text-brand-700' : 'border-transparent text-stone-600 hover:text-stone-900'
  }`

/** Admin only: accounts (role, lock, staff invitations) and flagged phone numbers. */
export default function UsersPage() {
  const params = useSearchParams()
  const [p, setParams] = params
  const tab = p.get('tab') === 'so-dien-thoai' ? 'phones' : 'accounts'
  const toast = useToast()
  const [inviting, setInviting] = useState(false)
  // Remounts the account list after an invitation so it shows the new row
  const [listKey, setListKey] = useState(0)

  return (
    <>
      <PageHeader title="Người dùng">
        <button type="button" className={btn.primary} onClick={() => setInviting(true)}>
          Mời nhân viên
        </button>
      </PageHeader>
      <div className="mb-4 flex gap-5 overflow-x-auto border-b border-stone-200" role="tablist" aria-label="Người dùng">
        <button type="button" role="tab" aria-selected={tab === 'accounts'} className={tabClass(tab === 'accounts')} onClick={() => setParams(new URLSearchParams())}>
          Tài khoản
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'phones'}
          className={tabClass(tab === 'phones')}
          onClick={() => setParams(new URLSearchParams({ tab: 'so-dien-thoai' }))}
        >
          Số điện thoại bị đánh dấu
        </button>
      </div>
      <div role="tabpanel">{tab === 'accounts' ? <Accounts key={listKey} params={params} /> : <PhoneFlags params={params} />}</div>
      {inviting && (
        <InviteDialog
          onClose={() => setInviting(false)}
          onDone={(u) => {
            setInviting(false)
            setListKey((k) => k + 1)
            toast({ message: `Đã gửi lời mời tới ${u.email}`, tone: 'success' })
          }}
        />
      )}
    </>
  )
}
