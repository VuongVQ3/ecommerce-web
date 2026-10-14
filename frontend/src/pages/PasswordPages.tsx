import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { acceptInviteSchema, changePasswordSchema, type ChangePasswordForm } from '../auth/schemas'
import { useAuthForm } from '../auth/useAuthForm'
import { FormError, PasswordChecklist, PasswordField, SubmitButton } from '../components/FormFields'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { LOGIN_PATH, safeNextPath } from '../lib/redirect'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import { AuthCard, LegalLinks, type LoginPageState } from './AuthPages'

/**
 * /tai-khoan/doi-mat-khau — same rules as registration. Staff/admins whose password no longer meets them are sent
 * here (with ?next=) and cannot use the back office until it is changed. Other devices are signed out.
 */
export function ChangePasswordPage() {
  usePageMeta(`Đổi mật khẩu | ${BRAND}`)
  const { user, signedIn } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const forced = user?.passwordChangeRequired === true
  const [visible, setVisible] = useState(false)

  const { form, onSubmit, formError, pending } = useAuthForm<ChangePasswordForm>(
    changePasswordSchema,
    { currentPassword: '', newPassword: '', confirmPassword: '' },
    async (values) => {
      const updated = await api.changePassword(values.currentPassword, values.newPassword)
      signedIn(updated)
      toast({ tone: 'success', message: 'Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.' })
      navigate(next === '/' ? '/tai-khoan' : next, { replace: true })
    },
  )
  const { errors } = form.formState
  const password = form.watch('newPassword')

  return (
    <div className="max-w-md">
      <h2 className="text-xl font-bold text-stone-900">Đổi mật khẩu</h2>
      {forced && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
          Mật khẩu hiện tại không còn đạt yêu cầu bảo mật. Vui lòng đặt mật khẩu mới (tối thiểu 8 ký tự, có cả chữ và
          số) để tiếp tục dùng trang quản trị.
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
        <PasswordField
          label="Mật khẩu hiện tại"
          autoComplete="current-password"
          hint="Để trống nếu tài khoản chỉ đăng nhập bằng Google"
          error={errors.currentPassword?.message}
          {...form.register('currentPassword')}
        />
        <div>
          <PasswordField
            label="Mật khẩu mới"
            autoComplete="new-password"
            error={errors.newPassword?.message}
            describedBy="change-password-rules"
            visible={visible}
            onVisibleChange={setVisible}
            {...form.register('newPassword')}
          />
          <PasswordChecklist id="change-password-rules" value={password} />
        </div>
        <PasswordField
          label="Nhập lại mật khẩu mới"
          autoComplete="new-password"
          visible={visible}
          onVisibleChange={setVisible}
          error={errors.confirmPassword?.message}
          {...form.register('confirmPassword')}
        />
        <FormError message={formError} />
        <SubmitButton pending={pending} pendingLabel="Đang đổi mật khẩu...">
          Đổi mật khẩu
        </SubmitButton>
      </form>
    </div>
  )
}

/** /dat-mat-khau?token=… — an invited staff member chooses their first password (48 hours, single use). */
export function AcceptInvitePage() {
  usePageMeta(`Đặt mật khẩu | ${BRAND}`)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Read the token once, then drop it from the address bar
  const [token] = useState(() => params.get('token'))
  useEffect(() => {
    if (params.has('token')) navigate('/dat-mat-khau', { replace: true })
  }, [params, navigate])
  const [visible, setVisible] = useState(false)

  const { form, onSubmit, formError, pending } = useAuthForm(
    acceptInviteSchema,
    { newPassword: '', confirmPassword: '' },
    async ({ newPassword }) => {
      await api.acceptInvite(token ?? '', newPassword)
      const state: LoginPageState = { notice: 'Đã đặt mật khẩu. Vui lòng đăng nhập để vào trang quản trị.' }
      navigate(`${LOGIN_PATH}?next=${encodeURIComponent('/admin')}`, { replace: true, state })
    },
  )
  const password = form.watch('newPassword')

  if (!token) {
    return (
      <AuthCard title="Liên kết không hợp lệ" subtitle="Liên kết mời bị thiếu hoặc không đầy đủ. Vui lòng mở lại link trong email.">
        <span />
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Đặt mật khẩu" subtitle="Bạn được mời làm nhân viên của Hạt Lành. Hãy chọn mật khẩu để đăng nhập trang quản trị.">
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <div>
          <PasswordField
            label="Mật khẩu"
            autoComplete="new-password"
            error={form.formState.errors.newPassword?.message}
            describedBy="invite-password-rules"
            visible={visible}
            onVisibleChange={setVisible}
            {...form.register('newPassword')}
          />
          <PasswordChecklist id="invite-password-rules" value={password} />
        </div>
        <PasswordField
          label="Nhập lại mật khẩu"
          autoComplete="new-password"
          visible={visible}
          onVisibleChange={setVisible}
          error={form.formState.errors.confirmPassword?.message}
          {...form.register('confirmPassword')}
        />
        <p className="text-sm text-stone-700">
          Bằng việc đặt mật khẩu, bạn đồng ý với <LegalLinks />.
        </p>
        <FormError message={formError} />
        <SubmitButton pending={pending} pendingLabel="Đang lưu...">
          Đặt mật khẩu
        </SubmitButton>
        <p className="text-center text-sm">
          <Link to={LOGIN_PATH} className="font-semibold text-brand-700 hover:underline">
            Đã có mật khẩu? Đăng nhập
          </Link>
        </p>
      </form>
    </AuthCard>
  )
}
