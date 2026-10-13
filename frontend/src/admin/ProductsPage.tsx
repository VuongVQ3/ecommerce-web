import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { adminApi, type AdminProductRow } from '../lib/adminApi'
import { formatPrice } from '../lib/format'
import { cloudinaryUrl } from '../lib/images'
import { useAsync } from '../lib/useAsync'
import { btn, input, table } from './styles'
import { Dialog, EmptyState, PageHeader, Pagination } from './ui'

const FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'true', label: 'Đang bán' },
  { value: 'false', label: 'Đang ẩn' },
] as const

/** Hide/show confirmation. Hiding keeps the product (orders refer to it) but removes it from the storefront. */
export function VisibilityDialog({
  product,
  onClose,
  onDone,
}: {
  product: { id: number; name: string; active: boolean }
  onClose: () => void
  onDone: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hiding = product.active

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      await adminApi.setActive(product.id, !hiding)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPending(false)
    }
  }

  return (
    <Dialog
      title={hiding ? `Ẩn "${product.name}"?` : `Hiện lại "${product.name}"?`}
      submitLabel={hiding ? 'Ẩn sản phẩm' : 'Hiện sản phẩm'}
      tone={hiding ? 'danger' : 'primary'}
      onSubmit={submit}
      onClose={onClose}
      pending={pending}
      error={error}
    >
      <p className="text-sm text-stone-600">
        {hiding
          ? 'Sản phẩm sẽ không còn hiển thị và không mua được trên cửa hàng. Đơn hàng cũ không bị ảnh hưởng; bạn có thể hiện lại bất cứ lúc nào.'
          : 'Sản phẩm sẽ hiển thị lại trên cửa hàng.'}
      </p>
    </Dialog>
  )
}

export default function ProductsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const active = (params.get('active') ?? '') as '' | 'true' | 'false'
  const page = Number(params.get('page') ?? 0)
  const [search, setSearch] = useState(q)
  const [toggle, setToggle] = useState<AdminProductRow | null>(null)
  const toast = useToast()
  const { data, error, loading, reload } = useAsync(
    (signal) => adminApi.products(q, active, page, signal),
    [q, active, page],
  )

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    update({ q: search.trim() })
  }

  return (
    <>
      <PageHeader title="Sản phẩm">
        <Link to="/admin/san-pham/moi" className={btn.primary}>
          + Thêm sản phẩm
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form onSubmit={onSearch} role="search" className="flex min-w-64 flex-1 gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên hoặc slug"
            aria-label="Tìm sản phẩm"
            className={input}
          />
          <button type="submit" className={btn.primary}>
            Tìm
          </button>
        </form>
        <div className="flex gap-2" role="group" aria-label="Lọc theo trạng thái">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={active === f.value}
              onClick={() => update({ active: f.value })}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                active === f.value ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorMessage message={error.message} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="Không có sản phẩm nào.">
          <Link to="/admin/san-pham/moi" className={btn.link}>
            Thêm sản phẩm đầu tiên
          </Link>
        </EmptyState>
      ) : (
        <div aria-busy={loading}>
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>Sản phẩm</th>
                  <th className={`${table.th} text-right`}>Giá</th>
                  <th className={`${table.th} text-right`}>Có thể bán</th>
                  <th className={table.th}>Trạng thái</th>
                  <th className={table.th}>
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} className={p.active ? undefined : 'bg-stone-50 text-stone-500'}>
                    <td className={table.td}>
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? (
                          <img
                            src={cloudinaryUrl(p.imageUrl, 96)}
                            alt=""
                            width={48}
                            height={48}
                            loading="lazy"
                            className="size-12 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-xl">
                            🌰
                          </span>
                        )}
                        <div>
                          <Link to={`/admin/san-pham/${p.id}`} className="font-medium text-stone-900 hover:text-brand-700 hover:underline">
                            {p.name}
                          </Link>
                          <div className="text-xs text-muted">{p.categoryName}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`${table.td} text-right tabular-nums`}>{formatPrice(p.price)}</td>
                    <td className={`${table.td} text-right tabular-nums ${p.lowStock ? 'font-semibold text-amber-900' : ''}`}>
                      {p.available}
                    </td>
                    <td className={table.td}>
                      {p.active ? (
                        <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">Đang bán</span>
                      ) : (
                        <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-700">Đang ẩn</span>
                      )}
                    </td>
                    <td className={`${table.td} text-right`}>
                      <div className="flex justify-end gap-2">
                        <Link to={`/admin/san-pham/${p.id}`} className={btn.secondary}>
                          Sửa
                        </Link>
                        <button type="button" className={btn.secondary} onClick={() => setToggle(p)}>
                          {p.active ? 'Ẩn' : 'Hiện'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => update({ page: String(p) })} />
        </div>
      )}

      {toggle && (
        <VisibilityDialog
          product={toggle}
          onClose={() => setToggle(null)}
          onDone={() => {
            toast({ message: toggle.active ? 'Đã ẩn sản phẩm' : 'Đã hiện sản phẩm', tone: 'success' })
            setToggle(null)
            reload()
          }}
        />
      )}
    </>
  )
}
