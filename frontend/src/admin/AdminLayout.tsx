import {
  BadgePercent,
  FolderTree,
  History,
  LayoutDashboard,
  Menu,
  Package,
  Receipt,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import type { Role } from '../lib/api'
import { adminApi } from '../lib/adminApi'
import { useAsync } from '../lib/useAsync'
import { useFocusTrap } from '../lib/useFocusTrap'
import { BRAND, usePageMeta } from '../lib/usePageMeta'

const ORDERS = '/admin/don-hang'

const NAV: { to: string; label: string; icon: LucideIcon; roles: Role[]; end?: boolean }[] = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, roles: ['STAFF', 'ADMIN'], end: true },
  { to: ORDERS, label: 'Đơn hàng', icon: Receipt, roles: ['STAFF', 'ADMIN'] },
  { to: '/admin/kho', label: 'Tồn kho', icon: Warehouse, roles: ['STAFF', 'ADMIN'] },
  { to: '/admin/san-pham', label: 'Sản phẩm', icon: Package, roles: ['ADMIN'] },
  { to: '/admin/danh-muc', label: 'Danh mục', icon: FolderTree, roles: ['ADMIN'] },
  { to: '/admin/khuyen-mai', label: 'Khuyến mại', icon: BadgePercent, roles: ['ADMIN'] },
  { to: '/admin/nguoi-dung', label: 'Người dùng', icon: Users, roles: ['ADMIN'] },
  { to: '/admin/nhat-ky', label: 'Nhật ký', icon: History, roles: ['ADMIN'] },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium whitespace-nowrap transition ${
    isActive ? 'bg-brand-600 text-white' : 'text-stone-700 hover:bg-stone-100'
  }`

/** Title of the current admin page for the phone/tablet top bar. */
function currentTitle(pathname: string) {
  const match = [...NAV].sort((a, b) => b.to.length - a.to.length).find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))
  return match?.label ?? 'Quản trị'
}

function Brand() {
  return (
    <span className="flex items-center gap-2 text-base font-extrabold whitespace-nowrap text-brand-700">
      <img src="/brand/logo-hat-lanh-96.webp" alt="" width={30} height={28} className="h-7 w-auto shrink-0" />
      <span>
        Hạt Lành <span className="font-medium text-stone-500">· Quản trị</span>
      </span>
    </span>
  )
}

/** pending: orders waiting for confirmation, shown as a badge on "Đơn hàng" when above 0 */
function NavList({ items, pending, onNavigate }: { items: typeof NAV; pending: number; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((n) => (
        <li key={n.to}>
          <NavLink to={n.to} end={n.end} className={linkClass} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                <n.icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
                <span className="flex-1">{n.label}</span>
                {n.to === ORDERS && pending > 0 && (
                  <span
                    className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums ${
                      isActive ? 'bg-white text-brand-800' : 'bg-amber-500 text-white'
                    }`}
                  >
                    {pending}
                    <span className="sr-only"> đơn chờ xác nhận</span>
                  </span>
                )}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

function Account({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth()
  return (
    <div className="border-t border-stone-200 px-5 py-4 text-sm">
      <p className="truncate font-semibold text-stone-900" title={user?.fullName}>
        {user?.fullName}
      </p>
      <p className="text-muted">{user?.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link to="/tai-khoan/doi-mat-khau" className="text-stone-700 underline hover:text-brand-700">
          Đổi mật khẩu
        </Link>
        <button type="button" onClick={onLogout} className="text-stone-700 underline hover:text-brand-700">
          Đăng xuất
        </button>
      </div>
    </div>
  )
}

/** Phone/tablet: slide-over with the menu. Focus stays inside, Esc closes. */
function NavDrawer({ items, pending, onClose, onLogout }: { items: typeof NAV; pending: number; onClose: () => void; onLogout: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(true, panel, onClose)
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        id="admin-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu quản trị"
        className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2 py-3 pr-2 pl-4">
          <Brand />
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label="Đóng menu"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <nav aria-label="Quản trị" className="flex-1 px-3">
          <NavList items={items} pending={pending} onNavigate={onClose} />
          <Link to="/" onClick={onClose} className="mt-3 block px-3 py-2 text-sm text-stone-600 hover:text-brand-700">
            ← Về cửa hàng
          </Link>
        </nav>
        <Account onLogout={onLogout} />
      </div>
    </div>
  )
}

/**
 * Back-office shell: a sidebar from 1024px; below that a top bar with the page title and a menu button opening a
 * drawer. Menu entries follow the role (the API enforces the same rules). Staff/admins whose password must change
 * are sent to the change-password page first.
 */
export default function AdminLayout() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const items = NAV.filter((n) => user && n.roles.includes(user.role))
  // The drawer remembers the page it was opened on, so navigating closes it
  const [drawerOn, setDrawerOn] = useState<string | null>(null)
  const closeDrawer = useCallback(() => setDrawerOn(null), [])
  // Asked again on every page change, so the badge follows confirmations made meanwhile
  const pending = useAsync((signal) => adminApi.orders({ status: 'PENDING', size: 1 }, signal), [pathname]).data?.pendingCount ?? 0
  usePageMeta(`${currentTitle(pathname)} | Quản trị | ${BRAND}`)

  if (user?.passwordChangeRequired) {
    return <Navigate to={`/tai-khoan/doi-mat-khau?next=${encodeURIComponent(pathname)}`} replace />
  }

  return (
    <div className="min-h-screen bg-stone-50 lg:flex">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-stone-200 bg-white px-3 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOn(pathname)}
          aria-label="Mở menu quản trị"
          aria-haspopup="dialog"
          aria-expanded={drawerOn === pathname}
          className="relative flex size-10 items-center justify-center rounded-xl text-stone-700 hover:bg-stone-100"
        >
          <Menu aria-hidden className="size-6" strokeWidth={1.8} />
          {pending > 0 && <span aria-hidden className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-white" />}
        </button>
        <p className="min-w-0 flex-1 truncate font-bold text-stone-900">{currentTitle(pathname)}</p>
        <Link to="/" className="shrink-0 text-sm text-stone-600 hover:text-brand-700">
          Cửa hàng
        </Link>
      </header>
      {drawerOn === pathname && <NavDrawer items={items} pending={pending} onClose={closeDrawer} onLogout={() => void logout()} />}

      <aside className="hidden border-r border-stone-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col">
        <div className="px-5 py-5">
          <Link to="/admin">
            <Brand />
          </Link>
          <Link to="/" className="mt-1 block text-sm text-stone-600 hover:text-brand-700">
            ← Về cửa hàng
          </Link>
        </div>
        <nav aria-label="Quản trị" className="flex-1 overflow-y-auto px-3">
          <NavList items={items} pending={pending} />
        </nav>
        <Account onLogout={() => void logout()} />
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  )
}
