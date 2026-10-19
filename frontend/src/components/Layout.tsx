import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { useCartBadge } from '../cart/cartBadge'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useCart } from '../cart/CartContext'
import CartDrawer from '../cart/CartDrawer'
import QuickCart from '../cart/QuickCart'
import { LOGIN_PATH, REGISTER_PATH } from '../lib/redirect'
import { FINE_POINTER, useMediaQuery } from '../lib/media'
import { useRecentOrders } from '../lib/recentOrders'
import { telHref, useSiteInfo } from '../lib/siteInfo'
import FloatingContact from './FloatingContact'
import { useFocusTrap } from '../lib/useFocusTrap'
import { BRAND } from '../lib/usePageMeta'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition ${isActive ? 'text-brand-700' : 'text-stone-600 hover:text-brand-700'}`

function SearchBox({ className = '', autoFocus = false }: { className?: string; autoFocus?: boolean }) {
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
        autoFocus={autoFocus}
        enterKeyHint="search"
        placeholder="Tìm mắc ca, hạt điều, hạnh nhân…"
        aria-label="Tìm sản phẩm"
        className="w-full rounded-full border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </form>
  )
}

/**
 * Desktop with a mouse: the icon links to /gio-hang and hovering it previews the cart (QuickCart).
 * Touch screens: the icon opens the cart drawer, as before.
 */
function CartButton() {
  const finePointer = useMediaQuery(FINE_POINTER)
  return finePointer ? <QuickCart /> : <DrawerCartButton />
}

/** Header cart icon with item count; opens the cart drawer (which returns focus here when closed). */
function DrawerCartButton() {
  const { count, openDrawer } = useCart()
  // Number shown in the badge: held back while a product flies here (cart/cartBadge.ts)
  const { shown: badgeCount, iconRef: cartIconRef, badgeRef } = useCartBadge(count)
  const label = count > 0 ? `Giỏ hàng, ${count} sản phẩm` : 'Giỏ hàng trống'
  return (
    <button
      ref={cartIconRef}
      type="button"
      onClick={openDrawer}
      aria-label={label}
      aria-haspopup="dialog"
      data-cart-target
      className="relative flex size-10 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="20" r="1.3" />
        <circle cx="17" cy="20" r="1.3" />
      </svg>
      {badgeCount > 0 && (
        <span
          ref={badgeRef}
          className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white tabular-nums"
        >
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </button>
  )
}

const menuItemClass =
  'block w-full rounded-lg px-3 py-2.5 text-left text-sm text-stone-700 hover:bg-brand-50 hover:text-brand-800'

/** Guests with orders remembered in this browser: "Đơn hàng của tôi (n)" → the list on the lookup page. */
function GuestOrdersLink({ className, onClick }: { className: string; onClick?: () => void }) {
  const count = useRecentOrders().length
  if (count === 0) return null
  return (
    <Link to="/tra-cuu-don-hang#don-hang-gan-day" onClick={onClick} className={className}>
      Đơn hàng của tôi ({count})
    </Link>
  )
}

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
        <GuestOrdersLink className="rounded-full px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100" />
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
          <p className="truncate px-3 pt-1 pb-2 text-xs text-muted">{user.email}</p>
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

const POLICY_LINKS = [
  { to: '/chinh-sach-doi-tra', label: 'Chính sách đổi trả' },
  { to: '/chinh-sach-van-chuyen', label: 'Chính sách vận chuyển' },
  { to: '/chinh-sach-bao-mat', label: 'Chính sách bảo mật' },
  { to: '/dieu-khoan-su-dung', label: 'Điều khoản sử dụng' },
  { to: '/lien-he', label: 'Liên hệ' },
]

const iconButtonClass = 'flex size-10 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100'

const drawerLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block w-full rounded-xl px-4 py-3 text-left text-base font-medium ${
    isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-800 hover:bg-stone-100'
  }`

/** Phone menu: slide-over with the main links and the account actions. Tab stays inside, Esc closes. */
function MobileMenu({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(true, panel, onClose)
  const isStaff = user?.role === 'STAFF' || user?.role === 'ADMIN'

  const onLogout = async () => {
    onClose()
    navigate('/')
    await logout()
  }

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 right-0 flex w-[min(20rem,100%)] flex-col overflow-y-auto bg-white p-4 shadow-2xl"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="px-2 text-lg font-extrabold text-brand-800">Hạt Lành</span>
          <button type="button" data-autofocus onClick={onClose} aria-label="Đóng menu" className={`${iconButtonClass} text-2xl`}>
            ×
          </button>
        </div>
        <nav aria-label="Menu chính">
          <NavLink to="/" end className={drawerLinkClass} onClick={onClose}>
            Trang chủ
          </NavLink>
          <NavLink to="/san-pham" className={drawerLinkClass} onClick={onClose}>
            Sản phẩm
          </NavLink>
          <NavLink to="/tra-cuu-don-hang" className={drawerLinkClass} onClick={onClose}>
            Tra cứu đơn hàng
          </NavLink>
        </nav>
        <div className="mt-4 border-t border-stone-200 pt-4">
          {user ? (
            <>
              <p className="truncate px-4 pb-2 text-sm text-muted">{user.email}</p>
              <NavLink to="/tai-khoan" end className={drawerLinkClass} onClick={onClose}>
                Tài khoản của tôi
              </NavLink>
              <NavLink to="/tai-khoan/don-hang" className={drawerLinkClass} onClick={onClose}>
                Đơn hàng của tôi
              </NavLink>
              {isStaff && (
                <NavLink to="/admin" className={drawerLinkClass} onClick={onClose}>
                  Trang quản trị
                </NavLink>
              )}
              <button type="button" onClick={onLogout} className={drawerLinkClass({ isActive: false })}>
                Đăng xuất
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 px-2">
              <GuestOrdersLink onClick={onClose} className="rounded-xl px-2 py-2 text-base font-medium text-stone-800 hover:bg-stone-100" />
              <Link
                to={LOGIN_PATH}
                onClick={onClose}
                className="rounded-full border border-stone-300 px-4 py-3 text-center font-semibold text-stone-800"
              >
                Đăng nhập
              </Link>
              <Link
                to={REGISTER_PATH}
                onClick={onClose}
                className="rounded-full bg-brand-600 px-4 py-3 text-center font-semibold text-white"
              >
                Đăng ký
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Business details come from the server config; anything not configured is simply not shown. */
function Footer() {
  const site = useSiteInfo()
  const b = site?.business ?? {}
  const hasContact = Boolean(b.hotline || b.email || b.address)
  const hasLegal = Boolean(b.ownerName || b.registrationNumber || b.moitUrl)
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {/* Phones: 64px clear on the right for the floating chat / back-to-top buttons */}
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-10 pb-8 pr-16 text-sm text-stone-600 sm:grid-cols-2 sm:pr-4 lg:grid-cols-4">
        <div>
          <p className="text-base font-bold text-brand-800">
            <span aria-hidden="true">🌰 </span>Hạt Lành
          </p>
          <p className="mt-2">Hạt dinh dưỡng, bánh hạt và đặc sản chọn lọc.</p>
        </div>
        <div>
          <p className="font-semibold text-stone-900">Mua sắm</p>
          <ul className="mt-2 space-y-1.5">
            <li>
              <Link to="/san-pham" className="hover:text-brand-700 hover:underline">
                Tất cả sản phẩm
              </Link>
            </li>
            <li>
              <Link to="/tra-cuu-don-hang" className="hover:text-brand-700 hover:underline">
                Tra cứu đơn hàng
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-stone-900">Chính sách</p>
          <ul className="mt-2 space-y-1.5">
            {POLICY_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-brand-700 hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {hasContact && (
          <div>
            <p className="font-semibold text-stone-900">Liên hệ</p>
            <ul className="mt-2 space-y-1.5">
              {b.hotline && (
                <li>
                  Hotline:{' '}
                  <a href={telHref(b.hotline)} className="font-semibold text-brand-700 hover:underline">
                    {b.hotline}
                  </a>
                </li>
              )}
              {b.email && <li className="break-all select-text">Email: {b.email}</li>}
              {b.address && <li>Địa chỉ: {b.address}</li>}
            </ul>
          </div>
        )}
      </div>
      {hasLegal && (
        <div className="border-t border-stone-100">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-stone-600">
            <p>
              {b.ownerName && <span>Chủ sở hữu: {b.ownerName}</span>}
              {b.ownerName && b.registrationNumber && <span aria-hidden="true"> · </span>}
              {b.registrationNumber && <span>Mã số ĐKKD: {b.registrationNumber}</span>}
            </p>
            {b.moitUrl && (
              <a href={b.moitUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 hover:underline">
                Đã thông báo Bộ Công Thương ↗
              </a>
            )}
          </div>
        </div>
      )}
    </footer>
  )
}

/** Titles of pages that do not set their own (products, categories, policies and 404 do). Same as the server's. */
const ROUTE_TITLES: [RegExp, string][] = [
  [/^\/$/, `${BRAND} – Hạt dinh dưỡng & đặc sản chọn lọc`],
  [/^\/dang-nhap$/, `Đăng nhập | ${BRAND}`],
  [/^\/dang-ky$/, `Đăng ký | ${BRAND}`],
  [/^\/quen-mat-khau$/, `Quên mật khẩu | ${BRAND}`],
  [/^\/dat-lai-mat-khau$/, `Đặt lại mật khẩu | ${BRAND}`],
  [/^\/gio-hang$/, `Giỏ hàng | ${BRAND}`],
  [/^\/thanh-toan$/, `Thanh toán | ${BRAND}`],
  [/^\/tra-cuu-don-hang$/, `Tra cứu đơn hàng | ${BRAND}`],
  [/^\/dat-hang-thanh-cong\//, `Đặt hàng thành công | ${BRAND}`],
  [/^\/tai-khoan(\/|$)/, `Tài khoản | ${BRAND}`],
]

/**
 * Publishes the header's real height as the CSS variable --header-h (kept up to date when it changes, e.g. the
 * mobile search row opens), so sticky bars sit right under it without hard-coded pixels.
 */
function useHeaderHeight() {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const header = ref.current
    if (!header) return
    const publish = () => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`)
    publish()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(publish)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])
  return ref
}

export default function Layout() {
  const { pathname } = useLocation()
  const headerRef = useHeaderHeight()
  useEffect(() => {
    const match = ROUTE_TITLES.find(([pattern]) => pattern.test(pathname))
    if (match) document.title = match[1]
  }, [pathname])
  // Both panels remember the page they were opened on, so navigating anywhere closes them
  const [menuOn, setMenuOn] = useState<string | null>(null)
  const [searchOn, setSearchOn] = useState<string | null>(null)
  const closeMenu = useCallback(() => setMenuOn(null), [])

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Bỏ qua đến nội dung chính
      </a>
      <header ref={headerRef} className="sticky top-0 z-20 border-b border-stone-200 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2.5 md:gap-6 md:py-3">
          <Link to="/" className="mr-auto flex shrink-0 items-center gap-2 text-xl font-extrabold text-brand-800 md:mr-0">
            <span aria-hidden="true">🌰</span> Hạt Lành
          </Link>
          <nav className="hidden gap-5 md:flex" aria-label="Menu chính">
            <NavLink to="/" end className={navClass}>
              Trang chủ
            </NavLink>
            <NavLink to="/san-pham" className={navClass}>
              Sản phẩm
            </NavLink>
          </nav>
          <SearchBox className="hidden md:ml-auto md:block md:w-56 lg:w-64" />
          <button
            type="button"
            className={`${iconButtonClass} md:hidden`}
            aria-label="Tìm kiếm"
            aria-expanded={searchOn === pathname}
            aria-controls="mobile-search"
            onClick={() => setSearchOn((s) => (s === pathname ? null : pathname))}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" strokeLinecap="round" />
            </svg>
          </button>
          <CartButton />
          <div className="hidden md:block">
            <AccountMenu />
          </div>
          <button
            type="button"
            className={`${iconButtonClass} md:hidden`}
            aria-label="Mở menu"
            aria-haspopup="dialog"
            aria-expanded={menuOn === pathname}
            onClick={() => setMenuOn(pathname)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {searchOn === pathname && (
          <div id="mobile-search" className="border-t border-stone-200 px-4 py-2.5 md:hidden">
            <SearchBox autoFocus />
          </div>
        )}
      </header>
      {menuOn === pathname && <MobileMenu onClose={closeMenu} />}

      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <CartDrawer />
      <Footer />
      <FloatingContact />
    </div>
  )
}
