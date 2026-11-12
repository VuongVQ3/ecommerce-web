import { ExternalLink, LayoutDashboard, Menu, Settings2, X, type LucideIcon } from 'lucide-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useFocusTrap } from '../lib/useFocusTrap'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import { AUTHOR_MODULES } from './authorModules'
import { AuthorSessionProvider } from './AuthorSessionContext'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/author', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  ...AUTHOR_MODULES.map(({ to, label, icon }) => ({ to, label, icon })),
]

// Same shape as the back office menu, in indigo so nobody mistakes one environment for the other
const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium whitespace-nowrap transition ${
    isActive ? 'bg-indigo-600 text-white' : 'text-stone-700 hover:bg-stone-100'
  }`

/** Menu entry of the page (tab title, phone top bar); null outside the menu, so the not-found page keeps its title. */
function currentTitle(pathname: string): string | null {
  const match = [...NAV]
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) => pathname === n.to || (!n.end && pathname.startsWith(`${n.to}/`)))
  return match?.label ?? null
}

function Brand() {
  return (
    <span className="flex flex-col">
      <span className="flex items-center gap-2 text-base font-extrabold whitespace-nowrap text-indigo-800">
        <img src="/brand/logo-hat-lanh-96.webp" alt="" width={30} height={28} className="h-7 w-auto shrink-0" />
        <span>
          Author <span className="font-medium text-stone-500">· Nội dung</span>
        </span>
      </span>
      <span className="mt-1 w-fit rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-indigo-800 uppercase">
        Môi trường soạn thảo
      </span>
    </span>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV.map((n) => (
        <li key={n.to}>
          <NavLink to={n.to} end={n.end} className={linkClass} onClick={onNavigate}>
            <n.icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
            <span className="flex-1">{n.label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

/** Ways out of the Author environment, at the bottom of the menu. */
function ExitLinks({ onNavigate }: { onNavigate?: () => void }) {
  const exit = 'flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-indigo-800'
  return (
    <div className="flex flex-col gap-1 border-t border-stone-200 px-3 py-3">
      <Link to="/admin" onClick={onNavigate} className={exit}>
        <Settings2 aria-hidden className="size-4 shrink-0" />
        Về trang quản trị
      </Link>
      <Link to="/" onClick={onNavigate} className={exit}>
        <ExternalLink aria-hidden className="size-4 shrink-0" />
        Xem website
      </Link>
    </div>
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
      <button type="button" onClick={onLogout} className="mt-2 text-stone-700 underline hover:text-indigo-800">
        Đăng xuất
      </button>
    </div>
  )
}

/** Phone/tablet: slide-over with the menu. Focus stays inside, Esc closes. */
function NavDrawer({ onClose, account }: { onClose: () => void; account: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(true, panel, onClose)
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu Author"
        className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2 py-3 pr-2 pl-4">
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
        <nav aria-label="Author" className="flex-1 px-3">
          <NavList onNavigate={onClose} />
        </nav>
        <ExitLinks onNavigate={onClose} />
        {account}
      </div>
    </div>
  )
}

function AuthorShell() {
  const { logout } = useAuth()
  const { pathname } = useLocation()
  // The drawer remembers the page it was opened on, so navigating closes it
  const [drawerOn, setDrawerOn] = useState<string | null>(null)
  const closeDrawer = useCallback(() => setDrawerOn(null), [])
  const title = currentTitle(pathname)
  usePageMeta(title ? `${title} | Author | ${BRAND}` : null)
  const account = <Account onLogout={() => void logout()} />

  return (
    <div className="min-h-screen bg-stone-50 lg:flex">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b-2 border-indigo-200 bg-white px-3 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOn(pathname)}
          aria-label="Mở menu Author"
          aria-haspopup="dialog"
          aria-expanded={drawerOn === pathname}
          className="flex size-10 items-center justify-center rounded-xl text-stone-700 hover:bg-stone-100"
        >
          <Menu aria-hidden className="size-6" strokeWidth={1.8} />
        </button>
        <p className="min-w-0 flex-1 truncate font-bold text-stone-900">{title ?? 'Author'}</p>
        <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">Author</span>
      </header>
      {drawerOn === pathname && <NavDrawer onClose={closeDrawer} account={account} />}

      <aside className="hidden border-r border-stone-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col">
        <div className="border-t-4 border-indigo-500 px-5 py-5">
          <Link to="/author">
            <Brand />
          </Link>
        </div>
        <nav aria-label="Author" className="flex-1 overflow-y-auto px-3">
          <NavList />
        </nav>
        <ExitLinks />
        {account}
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  )
}

/**
 * Author environment shell (/author): STAFF and ADMIN (RequireAuth above), with the permissions from
 * GET /api/author/session available to every page. Built like AdminLayout (sidebar from 1024px, drawer below), but
 * in indigo with its own title and label so it is never mistaken for the back office.
 */
export default function AuthorLayout() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  if (user?.passwordChangeRequired) {
    return <Navigate to={`/tai-khoan/doi-mat-khau?next=${encodeURIComponent(pathname)}`} replace />
  }
  return (
    <AuthorSessionProvider>
      <AuthorShell />
    </AuthorSessionProvider>
  )
}
