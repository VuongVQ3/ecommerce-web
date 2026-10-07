import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useCart } from '../cart/CartContext'
import CartDrawer from '../cart/CartDrawer'
import { LOGIN_PATH, REGISTER_PATH } from '../lib/redirect'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition ${isActive ? 'text-brand-700' : 'text-stone-600 hover:text-brand-700'}`

function SearchBox({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    navigate(q.trim() ? `/san-pham?q=${encodeURIComponent(q.trim())}` : '/san-pham')
  }

  return (
    <form onSubmit={onSubmit} role="search" className={className}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm hạnh nhân, hạt chia..."
        aria-label="Tìm sản phẩm"
        className="w-full rounded-full border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </form>
  )
}

/** Header cart icon with item count; opens the cart drawer (which returns focus here when closed). */
function CartButton() {
  const { count, openDrawer } = useCart()
  const label = count > 0 ? `Giỏ hàng, ${count} sản phẩm` : 'Giỏ hàng trống'
  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label={label}
      aria-haspopup="dialog"
      className="relative flex size-10 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="20" r="1.3" />
        <circle cx="17" cy="20" r="1.3" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}

const menuItemClass =
  'block w-full rounded-lg px-3 py-2.5 text-left text-sm text-stone-700 hover:bg-brand-50 hover:text-brand-800'

function AccountMenu() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // The menu remembers the page it was opened on, so navigating anywhere closes it
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const open = openedOn === pathname
  const setOpen = (value: boolean | ((o: boolean) => boolean)) =>
    setOpenedOn((current) => {
      const next = typeof value === 'function' ? value(current === pathname) : value
      return next ? pathname : null
    })
  const [loggingOut, setLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click and Escape
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpenedOn(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenedOn(null)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (loading) return <div className="h-9 w-24" />

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to={LOGIN_PATH} className="rounded-full px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100">
          Đăng nhập
        </Link>
        <Link
          to={REGISTER_PATH}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Đăng ký
        </Link>
      </div>
    )
  }

  const onLogout = async () => {
    setLoggingOut(true)
    // Leave first: on a protected page, clearing the user would otherwise bounce to the login page
    navigate('/')
    try {
      await logout()
    } finally {
      setLoggingOut(false)
      setOpen(false)
    }
  }

  const isStaff = user.role === 'STAFF' || user.role === 'ADMIN'

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex max-w-[12rem] items-center gap-2 rounded-full border border-stone-200 bg-white py-1.5 pr-3 pl-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {user.fullName.trim().charAt(0).toUpperCase()}
        </span>
        <span className="truncate">{user.fullName}</span>
        <span aria-hidden className="text-stone-400">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-stone-200 bg-white p-2 shadow-lg"
        >
          <p className="truncate px-3 pt-1 pb-2 text-xs text-stone-500">{user.email}</p>
          <Link role="menuitem" to="/tai-khoan" className={menuItemClass}>
            Tài khoản của tôi
          </Link>
          <Link role="menuitem" to="/tai-khoan/don-hang" className={menuItemClass}>
            Đơn hàng của tôi
          </Link>
          {isStaff && (
            <Link role="menuitem" to="/admin" className={menuItemClass}>
              Trang quản trị
            </Link>
          )}
          <div className="my-1 border-t border-stone-100" />
          <button
            role="menuitem"
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className={`${menuItemClass} disabled:opacity-60`}
          >
            {loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-xl font-extrabold text-brand-800">
            <span aria-hidden>🌰</span> Hạt Lành
          </Link>
          <nav className="flex gap-5">
            <NavLink to="/" end className={navClass}>
              Trang chủ
            </NavLink>
            <NavLink to="/san-pham" className={navClass}>
              Sản phẩm
            </NavLink>
          </nav>
          <SearchBox className="order-last w-full md:order-none md:ml-auto md:w-64" />
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <CartButton />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
      <CartDrawer />

      <footer className="mt-16 border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-stone-600 sm:grid-cols-3">
          <div>
            <p className="text-base font-bold text-brand-800">🌰 Hạt Lành</p>
            <p className="mt-2">Hạt dinh dưỡng sạch cho người ăn kiêng, eat clean và tập luyện.</p>
          </div>
          <div>
            <p className="font-semibold text-stone-900">Cam kết</p>
            <ul className="mt-2 space-y-1">
              <li>Không đường, không chất bảo quản</li>
              <li>Rõ nguồn gốc xuất xứ</li>
              <li>Đổi trả trong 7 ngày</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-stone-900">Liên hệ</p>
            <ul className="mt-2 space-y-1">
              <li>Hotline: 0900 000 000</li>
              <li>Email: hello@hatlanh.vn</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  )
}
