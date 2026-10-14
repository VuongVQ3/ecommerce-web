import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import type { Role } from '../lib/api'
import { BRAND, usePageMeta } from '../lib/usePageMeta'

const NAV: { to: string; label: string; icon: string; roles: Role[]; end?: boolean }[] = [
  { to: '/admin', label: 'Tổng quan', icon: '📊', roles: ['STAFF', 'ADMIN'], end: true },
  { to: '/admin/don-hang', label: 'Đơn hàng', icon: '🧾', roles: ['STAFF', 'ADMIN'] },
  { to: '/admin/kho', label: 'Tồn kho', icon: '📦', roles: ['STAFF', 'ADMIN'] },
  { to: '/admin/san-pham', label: 'Sản phẩm', icon: '🌰', roles: ['ADMIN'] },
  { to: '/admin/danh-muc', label: 'Danh mục', icon: '🗂️', roles: ['ADMIN'] },
  { to: '/admin/khuyen-mai', label: 'Khuyến mại', icon: '🏷️', roles: ['ADMIN'] },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium whitespace-nowrap transition ${
    isActive ? 'bg-brand-600 text-white' : 'text-stone-700 hover:bg-stone-100'
  }`

/**
 * Back-office shell: a sidebar from tablet width up, a scrollable tab bar on phones. Menu entries follow the role
 * (catalogue pages are ADMIN only); the API enforces the same rules.
 */
export default function AdminLayout() {
  const { user, logout } = useAuth()
  const items = NAV.filter((n) => user && n.roles.includes(user.role))
  usePageMeta(`Quản trị | ${BRAND}`)

  return (
    <div className="min-h-screen bg-stone-50 md:flex">
      <aside className="border-b border-stone-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:block md:px-5 md:py-5">
          <Link to="/admin" className="text-lg font-extrabold text-brand-700">
            Hạt Lành <span className="font-medium text-stone-500">· Quản trị</span>
          </Link>
          <Link to="/" className="text-sm text-stone-600 hover:text-brand-700 md:mt-1 md:block">
            ← Về cửa hàng
          </Link>
        </div>
        <nav aria-label="Quản trị" className="overflow-x-auto px-2 pb-2 md:flex-1 md:px-3">
          <ul className="flex gap-1 md:flex-col">
            {items.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end} className={linkClass}>
                  <span aria-hidden>{n.icon}</span>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden border-t border-stone-200 px-5 py-4 text-sm md:block">
          <p className="truncate font-semibold text-stone-900">{user?.fullName}</p>
          <p className="text-muted">{user?.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}</p>
          <button type="button" onClick={() => void logout()} className="mt-2 text-stone-700 underline hover:text-brand-700">
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}

