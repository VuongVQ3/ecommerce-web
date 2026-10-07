import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { forgotPasswordSchema, resetPasswordSchema } from '../auth/schemas'
import { useAuthForm } from '../auth/useAuthForm'
import { FormError, PasswordField, SubmitButton, TextField } from '../components/FormFields'
import { api } from '../lib/api'
import { FORGOT_PASSWORD_PATH, LOGIN_PATH, RESET_PASSWORD_PATH } from '../lib/redirect'
import { AuthCard, type LoginPageState } from './AuthPages'

export function ForgotPasswordPage() {
  const [sentMessage, setSentMessage] = useState<string | null>(null)
  // Prefilled when coming from "Email này đã có tài khoản" on the register page
  const prefill = ((useLocation().state ?? {}) as LoginPageState).email ?? ''
  const { form, onSubmit, formError, pending } = useAuthForm(forgotPasswordSchema, { email: prefill }, async ({ email }) => {
    const { message } = await api.forgotPassword(email)
    setSentMessage(message)
  })

  if (sentMessage) {
    return (
      <AuthCard title="Kiểm tra email của bạn" subtitle="Làm theo hướng dẫn trong email để đặt mật khẩu mới.">
        <p className="mt-6 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800" role="status">
          {sentMessage}
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link to={LOGIN_PATH} className="font-semibold text-brand-700 hover:underline">
            Quay lại đăng nhập
          </Link>
          <button type="button" onClick={() => setSentMessage(null)} className="font-semibold text-brand-700 hover:underline">
            Gửi lại hoặc dùng email khác
          </button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Quên mật khẩu"
      subtitle="Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết để bạn đặt mật khẩu mới."
    >
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <FormError message={formError} />
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <SubmitButton pending={pending}>Gửi liên kết đặt lại</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        Nhớ ra mật khẩu?{' '}
        <Link to={LOGIN_PATH} className="font-semibold text-brand-700 hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthCard>
  )
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [params] = useSearchParams()
  // Read the token once, then drop it from the address bar so it does not linger in history or get shared
  const [token] = useState(() => params.get('token'))
  useEffect(() => {
    if (params.has('token')) navigate(RESET_PASSWORD_PATH, { replace: true })
  }, [params, navigate])

  const { form, onSubmit, formError, pending } = useAuthForm(
    resetPasswordSchema,
    { newPassword: '' },
    async ({ newPassword }) => {
      await api.resetPassword(token ?? '', newPassword)
      // Every session was revoked by the backend; forget the local user too
      await logout().catch(() => {})
      const state: LoginPageState = { notice: 'Đổi mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.' }
      navigate(LOGIN_PATH, { replace: true, state })
    },
  )

  if (!token) {
    return (
      <AuthCard title="Liên kết không hợp lệ" subtitle="Liên kết đặt lại mật khẩu bị thiếu hoặc không đầy đủ.">
        <Link
          to={FORGOT_PASSWORD_PATH}
          className="mt-6 inline-block rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
        >
          Yêu cầu liên kết mới
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Đặt mật khẩu mới" subtitle="Sau khi đổi, bạn sẽ được đăng xuất khỏi mọi thiết bị.">
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {formError && (
          <div className="space-y-2">
            <FormError message={formError} />
            <Link to={FORGOT_PASSWORD_PATH} className="text-sm font-semibold text-brand-700 hover:underline">
              Yêu cầu liên kết mới
            </Link>
          </div>
        )}
        <PasswordField
          label="Mật khẩu mới"
          autoComplete="new-password"
          hint="Tối thiểu 8 ký tự, có cả chữ và số."
          error={form.formState.errors.newPassword?.message}
          {...form.register('newPassword')}
        />
        <SubmitButton pending={pending}>Đổi mật khẩu</SubmitButton>
      </form>
    </AuthCard>
  )
}
