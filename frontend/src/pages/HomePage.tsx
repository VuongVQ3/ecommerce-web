import { Link } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import ProductCard from '../components/ProductCard'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'

const BENEFITS = [
  { icon: '🌿', title: 'Không đường, không dầu', text: 'Rang mộc, giữ trọn dinh dưỡng tự nhiên.' },
  { icon: '📊', title: 'Minh bạch dinh dưỡng', text: 'Calo, protein, chất béo, carb trên mỗi 100g.' },
  { icon: '🚚', title: 'Giao hàng toàn quốc', text: 'Đóng gói hút chân không, luôn giòn thơm.' },
]

export default function HomePage() {
  const categories = useAsync((signal) => api.categories(signal), [])
  const featured = useAsync((signal) => api.products({ sort: 'protein_desc', size: 8 }, signal), [])

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 via-cream to-nut-light">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
              Ăn kiêng lành mạnh mỗi ngày
            </p>
            <h1 className="mt-5 text-4xl leading-tight font-extrabold text-brand-900 md:text-5xl">
              Hạt dinh dưỡng sạch cho vóc dáng khỏe đẹp
            </h1>
            <p className="mt-5 max-w-md text-lg text-stone-600">
              Hạnh nhân, óc chó, macca, hạt chia và hơn thế nữa. Rang mộc, rõ nguồn gốc, minh bạch từng chỉ số
              dinh dưỡng.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/san-pham"
                className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                Mua sắm ngay
              </Link>
              <Link
                to="/san-pham?sort=calories_asc"
                className="rounded-full border border-brand-200 bg-white px-6 py-3 font-semibold text-brand-700 hover:bg-brand-50"
              >
                Ít calo nhất
              </Link>
            </div>
          </div>
          <div className="hidden justify-center md:flex" aria-hidden>
            <div className="grid grid-cols-2 gap-4 text-7xl">
              {['🌰', '🥜', '🌱', '🥣'].map((e) => (
                <div key={e} className="flex size-36 items-center justify-center rounded-3xl bg-white/70 shadow-sm">
                  {e}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-2xl" aria-hidden>
                {b.icon}
              </p>
              <p className="mt-2 font-semibold text-stone-900">{b.title}</p>
              <p className="mt-1 text-sm text-stone-600">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {categories.data && (
        <section className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold text-stone-900">Danh mục</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {categories.data.map((c) => (
              <Link
                key={c.id}
                to={`/san-pham?category=${c.slug}`}
                className="rounded-2xl bg-brand-800 px-6 py-8 text-lg font-semibold text-white transition hover:bg-brand-700"
              >
                {c.name} →
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 pt-12">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-bold text-stone-900">Giàu protein nhất</h2>
          <Link to="/san-pham" className="text-sm font-semibold text-brand-700 hover:underline">
            Xem tất cả →
          </Link>
        </div>
        <div className="mt-5">
          {featured.error ? (
            <ErrorMessage message={featured.error.message} onRetry={featured.reload} />
          ) : !featured.data ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {featured.data.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
