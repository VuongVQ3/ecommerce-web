import { useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import ProductCard from '../components/ProductCard'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'

const PAGE_SIZE = 12

const SORT_OPTIONS = [
  { value: '', label: 'Mặc định' },
  { value: 'price_asc', label: 'Giá thấp → cao' },
  { value: 'price_desc', label: 'Giá cao → thấp' },
  { value: 'calories_asc', label: 'Ít calo nhất' },
  { value: 'protein_desc', label: 'Nhiều protein nhất' },
]

export default function ProductsPage() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') ?? ''
  const q = params.get('q') ?? ''
  const sort = params.get('sort') ?? ''
  const page = Math.max(0, Number(params.get('page') ?? '0') || 0)

  const categories = useAsync((signal) => api.categories(signal), [])
  const products = useAsync(
    (signal) => api.products({ category, q, sort, page, size: PAGE_SIZE }, signal),
    [category, q, sort, page],
  )

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const activeCategory = categories.data?.find((c) => c.slug === category)
  const title = activeCategory?.name ?? 'Tất cả sản phẩm'

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stone-900">{title}</h1>
          {q && (
            <p className="mt-1 text-stone-600">
              Kết quả cho “<strong>{q}</strong>”{' '}
              <button type="button" onClick={() => update({ q: '' })} className="text-brand-700 underline">
                Xóa tìm kiếm
              </button>
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          Sắp xếp
          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-brand-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[200px_1fr]">
        <aside>
          <p className="mb-3 text-sm font-semibold tracking-wide text-stone-500 uppercase">Danh mục</p>
          <div className="flex flex-wrap gap-2 md:flex-col">
            {[{ slug: '', name: 'Tất cả' }, ...(categories.data ?? [])].map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => update({ category: c.slug })}
                className={`rounded-full px-4 py-2 text-left text-sm font-medium transition md:rounded-lg ${
                  c.slug === category ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 hover:bg-brand-50'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </aside>

        <section aria-live="polite">
          {products.error ? (
            <ErrorMessage message={products.error.message} onRetry={products.reload} />
          ) : !products.data ? (
            <Spinner />
          ) : products.data.items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-300 py-16 text-center text-stone-500">
              Không tìm thấy sản phẩm phù hợp.
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm text-stone-500">{products.data.totalItems} sản phẩm</p>
              <div className={`grid grid-cols-2 gap-4 lg:grid-cols-3 ${products.loading ? 'opacity-60' : ''}`}>
                {products.data.items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              {products.data.totalPages > 1 && (
                <nav className="mt-8 flex justify-center gap-2" aria-label="Phân trang">
                  {Array.from({ length: products.data.totalPages }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => update({ page: i ? String(i) : '' })}
                      aria-current={i === page ? 'page' : undefined}
                      className={`size-10 rounded-full text-sm font-medium ${
                        i === page ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 hover:bg-brand-50'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
