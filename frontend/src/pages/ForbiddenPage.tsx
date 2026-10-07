import { Link } from 'react-router'

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-6xl" aria-hidden>
        🔒
      </p>
      <h1 className="mt-4 text-2xl font-bold text-stone-900">Bạn không có quyền truy cập</h1>
      <p className="mt-2 text-stone-600">Trang này chỉ dành cho nhân viên và quản trị viên của cửa hàng.</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
      >
        Về trang chủ
      </Link>
    </div>
  )
}
