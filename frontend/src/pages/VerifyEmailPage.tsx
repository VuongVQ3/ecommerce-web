import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { Spinner } from '../components/Feedback'
import { api } from '../lib/api'
import { BRAND, usePageMeta } from '../lib/usePageMeta'

type Result = { email: string; attachedOrders: number } | { error: string }

/** One request per token, even when React runs effects twice in development: the link is single use. */
const attempts = new Map<string, Promise<Result>>()

function verifyOnce(token: string): Promise<Result> {
  let attempt = attempts.get(token)
  if (!attempt) {
    attempt = api.verifyEmail(token).catch((err: unknown) => ({
      error: err instanceof Error ? err.message : 'Không xác minh được email',
    }))
    attempts.set(token, attempt)
  }
  return attempt
}

/** /xac-minh-email?token=… — the link from the verification email. */
export default function VerifyEmailPage() {
  usePageMeta(`Xác minh email | ${BRAND}`)
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user } = useAuth()
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (!token) return
    let alive = true
    verifyOnce(token).then((r) => alive && setResult(r))
    return () => {
      alive = false
    }
  }, [token])

  const shown: Result | null = token ? result : { error: 'Link xác minh không đầy đủ. Vui lòng mở lại link trong email.' }
  if (!shown) return <Spinner label="Đang xác minh email..." />

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      {'error' in shown ? (
        <>
          <h1 className="text-2xl font-bold text-stone-900">Không xác minh được email</h1>
          <p className="mt-3 text-stone-700" role="alert">
            {shown.error}
          </p>
          <Link
            to={user ? '/tai-khoan' : '/dang-nhap?next=%2Ftai-khoan'}
            className="mt-6 inline-block rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
          >
            {user ? 'Về trang Tài khoản' : 'Đăng nhập'}
          </Link>
        </>
      ) : (
        <>
          <p className="text-5xl" aria-hidden="true">
            ✅
          </p>
          <h1 className="mt-3 text-2xl font-bold text-stone-900">Đã xác minh email</h1>
          <p className="mt-3 text-stone-700">
            Email <strong className="break-all">{shown.email}</strong> đã được xác minh.
          </p>
          <p className="mt-1 text-stone-700" role="status">
            {shown.attachedOrders > 0
              ? `Đã lưu thêm ${shown.attachedOrders} đơn hàng bạn đặt trước đây vào tài khoản.`
              : 'Không có đơn hàng nào khác cần lưu vào tài khoản.'}
          </p>
          <Link
            to={user ? '/tai-khoan/don-hang' : '/dang-nhap?next=%2Ftai-khoan%2Fdon-hang'}
            className="mt-6 inline-block rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
          >
            Xem đơn hàng của tôi
          </Link>
        </>
      )}
    </div>
  )
}
