import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useNextPath } from '../auth/useNextPath'
import GoogleSignInButton from '../auth/GoogleSignInButton'
import { loginSchema } from '../auth/schemas'
import { useAuthForm } from '../auth/useAuthForm'
import { FormError, PasswordField, SubmitButton, TextField } from '../components/FormFields'
import { Spinner } from '../components/Feedback'
import { FORGOT_PASSWORD_PATH, REGISTER_PATH, withNext } from '../lib/redirect'

/** Optional router state for the login page: a message to show and an email to prefill (never put in the URL). */
export interface LoginPageState {
  notice?: string
  email?: string
}

export function AuthCard({
  title,
  lead,
  subtitle,
  children,
}: {
  title: string
  /** Short line right under the title (e.g. the benefits of an account). */
  lead?: ReactNode
  subtitle: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
        {lead && <p className="mt-1 text-sm text-stone-700">{lead}</p>}
        <p className="mt-1 text-sm text-stone-600">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}

const legalLinkClass = 'font-semibold text-brand-700 underline-offset-2 hover:underline'

/** "Điều khoản sử dụng và Chính sách bảo mật", each opening in a new tab. */
export function LegalLinks() {
  return (
    <>
      <a href="/dieu-khoan" target="_blank" rel="noopener noreferrer" className={legalLinkClass}>
        Điều khoản sử dụng<span className="sr-only"> (mở trong tab mới)</span>
      </a>{' '}
      và{' '}
      <a href="/chinh-sach-bao-mat" target="_blank" rel="noopener noreferrer" className={legalLinkClass}>
        Chính sách bảo mật<span className="sr-only"> (mở trong tab mới)</span>
      </a>
    </>
  )
}


export function LoginPage() {
  const { user, loading, login, loginWithGoogle } = useAuth()
  const next = useNextPath()
  const state = (useLocation().state ?? {}) as LoginPageState
  const { form, onSubmit, formError, pending } = useAuthForm(
    loginSchema,
    { email: state.email ?? '', password: '' },
    login,
  )
  const errors = form.formState.errors

  // Covers both a fresh login (form or Google) and visiting this page while already signed in
  if (user) return <Navigate to={next} replace />
  if (loading) return <Spinner />

  return (
    <AuthCard
      title="Đăng nhập"
      subtitle={
        <>
          Chưa có tài khoản?{' '}
          <Link to={withNext(REGISTER_PATH, next)} className="font-semibold text-brand-700 hover:underline">
            Đăng ký ngay
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {state.notice && !formError && (
          <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800" role="status">
            {state.notice}
          </p>
        )}
        <FormError message={formError} />
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <div>
          <PasswordField
            label="Mật khẩu"
            autoComplete="current-password"
            error={errors.password?.message}
            {...form.register('password')}
          />
          <Link
            to={FORGOT_PASSWORD_PATH}
            className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline"
          >
            Quên mật khẩu?
          </Link>
        </div>
        <SubmitButton pending={pending}>Đăng nhập</SubmitButton>
      </form>
      <GoogleSignInButton
        text="signin_with"
        onCredential={loginWithGoogle}
        footnote={
          <>
            Lần đầu tiếp tục với Google, bạn đồng ý với <LegalLinks />.
          </>
        }
      />
    </AuthCard>
  )
}
