import { Link, useParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { StatusBadge } from '../components/OrderDetails'
import { ApiError } from '../lib/api'
import { userApi } from '../lib/adminApi'
import { formatAdminDateTime, formatPrice } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import NotFoundPage from '../pages/NotFoundPage'
import { card } from './styles'
import { EmptyState } from './ui'
import { AccountStatus, RoleBadge, UserActions } from './userActions'

/** One account: details, role/lock actions and its orders. */
export default function UserDetailPage() {
  const { id = '' } = useParams()
  const { data, error, reload } = useAsync((signal) => userApi.detail(id, signal), [id])

  if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return <NotFoundPage />
  if (error) return <ErrorMessage message={error.message} onRetry={reload} />
  if (!data) return <Spinner />
  const { user, orders } = data

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/admin/nguoi-dung" className="text-sm text-stone-600 hover:text-brand-700">
        ← Danh sách người dùng
      </Link>
      <section className={`${card} mt-4 p-5`} aria-labelledby="user-title">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 id="user-title" className="text-2xl font-bold break-words text-stone-900">
              {user.fullName}
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <RoleBadge role={user.role} />
              <AccountStatus user={user} />
            </div>
          </div>
          <UserActions user={user} onChanged={reload} />
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">Email</dt>
          <dd className="break-all">
            {user.email} {user.emailVerified ? <span className="text-success">(đã xác minh)</span> : <span className="text-muted">(chưa xác minh)</span>}
          </dd>
          <dt className="text-muted">Số điện thoại</dt>
          <dd className="tabular-nums">{user.phone ?? '—'}</dd>
          <dt className="text-muted">Ngày tạo</dt>
          <dd className="tabular-nums">{formatAdminDateTime(user.createdAt)}</dd>
          <dt className="text-muted">Đã mua (đơn hoàn tất)</dt>
          <dd className="tabular-nums">
            {formatPrice(user.spent)} · {user.orderCount} đơn
          </dd>
        </dl>
      </section>

      <section className="mt-6" aria-labelledby="user-orders-title">
        <h2 id="user-orders-title" className="mb-3 text-lg font-bold text-stone-900">
          Đơn hàng
        </h2>
        {orders.length === 0 ? (
          <EmptyState title="Chưa có đơn hàng nào." />
        ) : (
          <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
            {orders.map((o) => (
              <li key={o.code}>
                <Link
                  to={`/admin/don-hang/${o.code}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-stone-50"
                >
                  <span className="font-mono font-semibold text-brand-700">{o.code}</span>
                  <span className="text-muted tabular-nums">{formatAdminDateTime(o.createdAt)}</span>
                  <span className="font-semibold tabular-nums">{formatPrice(o.total)}</span>
                  <StatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
