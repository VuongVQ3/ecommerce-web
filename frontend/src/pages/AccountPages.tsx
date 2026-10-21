import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'

const ROLE_LABELS = { CUSTOMER: 'Khách hàng', STAFF: 'Nhân viên', ADMIN: 'Quản trị viên' } as const

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-medium ${isActive ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 hover:bg-brand-50'}`

/** Shell for /tai-khoan/*; only rendered for signed-in users (see RequireAuth). */
export function AccountLayout() {
  const { user } = useAuth()
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900">Tài khoản của tôi</h1>
      <nav className="mt-6 flex flex-wrap gap-2">
        <NavLink to="/tai-khoan" end className={tabClass}>
          Thông tin
        </NavLink>
        <NavLink to="/tai-khoan/doi-mat-khau" className={tabClass}>
          {user?.hasPassword === false ? 'Đặt mật khẩu' : 'Đổi mật khẩu'}
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

/** Unverified email: explains why it matters and sends a new link (limited server-side). */
function VerifyEmailNotice() {
  const toast = useToast()
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const resend = async () => {
    setState('sending')
    try {
      await api.resendVerification()
      setState('sent')
    } catch (err) {
      setState('idle')
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Không gửi được email' })
    }
  }
  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-stone-800">
      <p className="font-semibold">Email chưa được xác minh</p>
      <p className="mt-1">
        Xác minh email để các đơn hàng bạn đã đặt bằng email này (khi chưa đăng nhập) được tự động lưu vào tài khoản.
      </p>
      {state === 'sent' ? (
        <p className="mt-2 font-semibold text-success" role="status">
          Đã gửi email xác minh. Vui lòng kiểm tra hộp thư (cả mục Spam).
        </p>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={state === 'sending'}
          className="mt-2 rounded-full border border-stone-300 bg-white px-4 py-2 font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60"
        >
          {state === 'sending' ? 'Đang gửi...' : 'Gửi lại email xác minh'}
        </button>
      )}
    </div>
  )
}

export function AccountInfoPage() {
  const { user } = useAuth()
  if (!user) return null

  const rows = [
    ['Họ và tên', user.fullName],
    ['Email', `${user.email}${user.emailVerified ? ' (đã xác minh)' : ''}`],
    ['Số điện thoại', user.phone ?? 'Chưa cập nhật'],
    ['Loại tài khoản', ROLE_LABELS[user.role]],
  ]
  return (
    <>
    {!user.emailVerified && <VerifyEmailNotice />}
    <dl className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:justify-between">
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="font-medium break-all text-stone-900">{value}</dd>
        </div>
      ))}
    </dl>
    </>
  )
}

