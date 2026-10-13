import { Link } from 'react-router'
import { BRAND, usePageMeta } from '../lib/usePageMeta'

export default function NotFoundPage() {
  usePageMeta(`Không tìm thấy trang | ${BRAND}`)
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-6xl" aria-hidden>
        🥜
      </p>
      <h1 className="mt-4 text-2xl font-bold text-stone-900">Không tìm thấy trang</h1>
      <p className="mt-2 text-stone-600">Trang bạn tìm không tồn tại hoặc sản phẩm đã ngừng kinh doanh.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/" className="rounded-full border border-stone-300 bg-white px-6 py-3 font-semibold text-stone-800 hover:bg-stone-50">
          Về trang chủ
        </Link>
        <Link to="/san-pham" className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
          Xem sản phẩm
        </Link>
      </div>
    </div>
  )
}
