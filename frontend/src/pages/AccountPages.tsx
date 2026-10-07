import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'

const ROLE_LABELS = { CUSTOMER: 'Khách hàng', STAFF: 'Nhân viên', ADMIN: 'Quản trị viên' } as const

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-medium ${isActive ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 hover:bg-brand-50'}`

/** Shell for /tai-khoan/*; only rendered for signed-in users (see RequireAuth). */
export function AccountLayout() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">Tài khoản của tôi</h1>
      <nav className="mt-6 flex flex-wrap gap-2">
        <NavLink to="/tai-khoan" end className={tabClass}>
          Thông tin
        </NavLink>
        <NavLink to="/tai-khoan/don-hang" className={tabClass}>
          Đơn hàng của tôi
        </NavLink>
      </nav>
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  )
}

export function AccountInfoPage() {
  const { user } = useAuth()
  if (!user) return null

  const rows = [
    ['Họ và tên', user.fullName],
    ['Email', user.email],
    ['Số điện thoại', user.phone ?? 'Chưa cập nhật'],
    ['Loại tài khoản', ROLE_LABELS[user.role]],
  ]
  return (
    <dl className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:justify-between">
          <dt className="text-sm text-stone-500">{label}</dt>
          <dd className="font-medium break-all text-stone-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function OrdersPage() {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
      <p className="text-4xl" aria-hidden>
        📦
      </p>
      <p className="mt-3 font-semibold text-stone-900">Bạn chưa có đơn hàng nào</p>
      <p className="mt-1 text-sm text-stone-500">Tính năng giỏ hàng và đặt hàng sẽ có trong phiên bản tiếp theo.</p>
    </div>
  )
}

/** Placeholder for /admin/*; only rendered for STAFF and ADMIN (see RequireAuth). */
export function AdminPage() {
  const { user } = useAuth()
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">Trang quản trị</h1>
      <p className="mt-2 text-stone-600">
        Xin chào {user?.fullName}. Khu vực quản lý sản phẩm và đơn hàng đang được xây dựng.
      </p>
    </div>
  )
}
