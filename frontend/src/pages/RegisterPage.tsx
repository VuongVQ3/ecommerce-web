import { useEffect, useId, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import GoogleSignInButton from '../auth/GoogleSignInButton'
import { registerSchema } from '../auth/schemas'
import Turnstile, { type TurnstileHandle } from '../auth/Turnstile'
import { useAuthForm } from '../auth/useAuthForm'
import { useNextPath } from '../auth/useNextPath'
import { Spinner } from '../components/Feedback'
import { Checkbox, FormError, PasswordChecklist, PasswordField, SubmitButton, TextField } from '../components/FormFields'
import { suggestEmail } from '../lib/emailSuggestion'
import { normalizePhone } from '../lib/phone'
import { FORGOT_PASSWORD_PATH, LOGIN_PATH, withNext } from '../lib/redirect'
import { AuthCard, LegalLinks, type LoginPageState } from './AuthPages'

const EMAIL_EXISTS_MESSAGE = 'Email này đã có tài khoản.'

export function RegisterPage() {
  const { user, loading, register, loginWithGoogle } = useAuth()
  const next = useNextPath()
  const turnstile = useRef<TurnstileHandle>(null)
  const checklistId = useId()
  const confirmId = useId()
  const matchStatusId = useId()
  // One "Hiện/Ẩn" button reveals both password fields
  const [passwordsVisible, setPasswordsVisible] = useState(false)

  const { form, onSubmit, formError, pending } = useAuthForm(
    registerSchema,
    {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
      marketingConsent: false,
      website: '',
    },
    async (values) => {
      const turnstileToken = await turnstile.current!.getToken()
      try {
        // Explicit payload: confirmPassword is a frontend-only check and is never sent
        await register({
          fullName: values.fullName,
          email: values.email,
          password: values.password,
          phone: values.phone ? normalizePhone(values.phone) : undefined,
          marketingConsent: values.marketingConsent,
          website: values.website,
          acceptTerms: true,
          turnstileToken,
        })
      } finally {
        // Turnstile tokens are single-use: get a fresh one for a possible retry
        turnstile.current?.reset()
      }
    },
    {
      onApiError: (err, f) => {
        if (err.code === 'EMAIL_EXISTS') {
          f.setError('email', { type: 'exists', message: EMAIL_EXISTS_MESSAGE }, { shouldFocus: true })
          return true
        }
        if (err.code === 'PHONE_EXISTS') {
          f.setError('phone', { type: 'exists', message: 'Số điện thoại này đã được sử dụng.' }, { shouldFocus: true })
          return true
        }
        return false
      },
    },
  )
  const { errors, touchedFields } = form.formState
  const email = form.watch('email')
  const password = form.watch('password')
  const confirmPassword = form.watch('confirmPassword')
  const passwordsMatch = confirmPassword !== '' && confirmPassword === password && !errors.confirmPassword

  // Once the confirmation has been touched, editing the password re-checks it (error appears/disappears live)
  useEffect(() => {
    const subscription = form.watch((_, { name }) => {
      if (name === 'password' && form.getFieldState('confirmPassword').isTouched) {
        void form.trigger('confirmPassword')
      }
    })
    return () => subscription.unsubscribe()
  }, [form])
  // Only suggest once the user has left the field with a valid-looking address: no nagging mid-typing
  const emailSuggestion = touchedFields.email && !errors.email ? suggestEmail(email) : null

  if (user) return <Navigate to={next} replace />
  if (loading) return <Spinner />

  const existingAccountState: LoginPageState = { email: email.trim() }

  return (
    <AuthCard
      title="Tạo tài khoản"
      lead="Theo dõi đơn hàng, lưu địa chỉ giao hàng và nhận ưu đãi thành viên."
      subtitle={
        <>
          Đã có tài khoản?{' '}
          <Link to={withNext(LOGIN_PATH, next)} className="font-semibold text-brand-700 hover:underline">
            Đăng nhập
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="relative mt-6 space-y-4" noValidate>
        <TextField label="Họ và tên" autoComplete="name" error={errors.fullName?.message} {...form.register('fullName')} />

        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email?.message}
          below={
            errors.email?.type === 'exists' ? (
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link
                  to={withNext(LOGIN_PATH, next)}
                  state={existingAccountState}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  Đăng nhập
                </Link>
                <Link to={FORGOT_PASSWORD_PATH} state={existingAccountState} className="font-semibold text-brand-700 hover:underline">
                  Quên mật khẩu?
                </Link>
              </p>
            ) : (
              emailSuggestion && (
                <button
                  type="button"
                  onClick={() => form.setValue('email', emailSuggestion, { shouldValidate: true })}
                  className="mt-1 text-left text-sm text-stone-700 underline-offset-2 hover:underline"
                >
                  Có phải bạn muốn dùng <strong className="font-semibold text-brand-700">{emailSuggestion}</strong>?
                </button>
              )
            )
          }
          {...form.register('email')}
        />

        <TextField
          label="Số điện thoại (không bắt buộc)"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="Ví dụ: 0912 345 678"
          hint="Để shipper liên hệ khi giao hàng"
          error={errors.phone?.message}
          {...form.register('phone')}
        />

        <div>
          <PasswordField
            label="Mật khẩu"
            autoComplete="new-password"
            error={errors.password?.message}
            describedBy={checklistId}
            visible={passwordsVisible}
            onVisibleChange={setPasswordsVisible}
            alsoControls={confirmId}
            {...form.register('password')}
          />
          <PasswordChecklist id={checklistId} value={password} />
        </div>

        <TextField
          id={confirmId}
          label="Nhập lại mật khẩu"
          type={passwordsVisible ? 'text' : 'password'}
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          describedBy={matchStatusId}
          below={
            // Always rendered so screen readers announce changes; content only when the passwords match
            <p id={matchStatusId} aria-live="polite" className="mt-1 flex items-center gap-1.5 text-sm text-success">
              {passwordsMatch && (
                <>
                  <span aria-hidden className="font-bold">
                    ✓
                  </span>
                  Mật khẩu đã khớp
                </>
              )}
            </p>
          }
          {...form.register('confirmPassword')}
        />

        {/* Honeypot: invisible to people and skipped by keyboard and screen readers, but bots fill it in */}
        <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label htmlFor="register-website">Website</label>
          <input id="register-website" type="text" tabIndex={-1} autoComplete="off" {...form.register('website')} />
        </div>

        <Checkbox label="Nhận thông tin khuyến mãi qua email" {...form.register('marketingConsent')} />

        <p className="text-sm text-stone-700">
          Bằng việc đăng ký, bạn đồng ý với <LegalLinks />.
        </p>

        <Turnstile ref={turnstile} action="register" />
        <FormError message={formError} />
        <SubmitButton pending={pending} pendingLabel="Đang tạo tài khoản...">
          Đăng ký
        </SubmitButton>
      </form>
      <GoogleSignInButton text="signup_with" onCredential={loginWithGoogle} />
    </AuthCard>
  )
}
