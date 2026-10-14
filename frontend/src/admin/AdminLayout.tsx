import { useCallback, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import type { Role } from '../lib/api'
import { useFocusTrap } from '../lib/useFocusTrap'
import { BRAND, usePageMeta } from '../lib/usePageMeta'

const NAV: { to: string; label: string; icon: string; roles: Role[]; end?: boolean }[] = [
  { to: '/admin', label: 'Tổng quan', icon: '📊', roles: ['STAFF', 'ADMIN'], end: true },
  { to: '/admin/don-hang', label: 'Đơn hàng', icon: '🧾', roles: ['STAFF', 'ADMIN'] },
  { to: '/admin/kho', label: 'Tồn kho', icon: '📦', roles: ['STAFF', 'ADMIN'] },
  { to: '/admin/san-pham', label: 'Sản phẩm', icon: '🌰', roles: ['ADMIN'] },
  { to: '/admin/danh-muc', label: 'Danh mục', icon: '🗂️', roles: ['ADMIN'] },
  { to: '/admin/khuyen-mai', label: 'Khuyến mại', icon: '🏷️', roles: ['ADMIN'] },
  { to: '/admin/nguoi-dung', label: 'Người dùng', icon: '👥', roles: ['ADMIN'] },
  { to: '/admin/nhat-ky', label: 'Nhật ký', icon: '📜', roles: ['ADMIN'] },
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

function NavList({ items, onNavigate }: { items: typeof NAV; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((n) => (
        <li key={n.to}>
          <NavLink to={n.to} end={n.end} className={linkClass} onClick={onNavigate}>
            <span aria-hidden="true">{n.icon}</span>
            {n.label}
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
      <p className="truncate font-semibold text-stone-900">{user?.fullName}</p>
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
function NavDrawer({ items, onClose, onLogout }: { items: typeof NAV; onClose: () => void; onLogout: () => void }) {
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
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-lg font-extrabold text-brand-700">Hạt Lành</span>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label="Đóng menu"
            className="flex size-10 items-center justify-center rounded-full text-2xl text-stone-600 hover:bg-stone-100"
          >
            ×
          </button>
        </div>
        <nav aria-label="Quản trị" className="flex-1 px-3">
          <NavList items={items} onNavigate={onClose} />
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
  usePageMeta(`${currentTitle(pathname)} | Quản trị | ${BRAND}`)

  if (user?.passwordChangeRequired) {
    return <Navigate to={`/tai-khoan/doi-mat-khau?next=${encodeURIComponent(pathname)}`} replace />
  }

  return (
    <div className="min-h-screen bg-stone-50 lg:flex">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white px-3 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOn(pathname)}
          aria-label="Mở menu quản trị"
          aria-haspopup="dialog"
          aria-expanded={drawerOn === pathname}
          className="flex size-10 items-center justify-center rounded-xl text-stone-700 hover:bg-stone-100"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>
        <p className="min-w-0 flex-1 truncate font-bold text-stone-900">{currentTitle(pathname)}</p>
        <Link to="/" className="shrink-0 text-sm text-stone-600 hover:text-brand-700">
          Cửa hàng
        </Link>
      </header>
      {drawerOn === pathname && <NavDrawer items={items} onClose={closeDrawer} onLogout={() => void logout()} />}

      <aside className="hidden border-r border-stone-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col">
        <div className="px-5 py-5">
          <Link to="/admin" className="text-lg font-extrabold text-brand-700">
            Hạt Lành <span className="font-medium text-stone-500">· Quản trị</span>
          </Link>
          <Link to="/" className="mt-1 block text-sm text-stone-600 hover:text-brand-700">
            ← Về cửa hàng
          </Link>
        </div>
        <nav aria-label="Quản trị" className="flex-1 overflow-y-auto px-3">
          <NavList items={items} />
        </nav>
        <Account onLogout={() => void logout()} />
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  )
}
