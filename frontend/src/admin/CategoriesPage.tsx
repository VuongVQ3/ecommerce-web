import { useState } from 'react'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { ApiError } from '../lib/api'
import { adminApi, type AdminCategory } from '../lib/adminApi'
import { slugify, SLUG_PATTERN } from '../lib/slug'
import { useAsync } from '../lib/useAsync'
import { btn, table } from './styles'
import { Dialog, EmptyState, Field, PageHeader } from './ui'

/** Create or rename. Categories are never deleted here (products point to them). */
function CategoryDialog({ category, onClose, onDone }: { category: AdminCategory | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [slug, setSlug] = useState(category?.slug ?? '')
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Vui lòng nhập tên danh mục'
    if (slug.trim() && !SLUG_PATTERN.test(slug.trim())) next.slug = 'Chỉ chữ thường không dấu, số và dấu "-"'
    setErrors(next)
    if (next.name || next.slug) return
    setPending(true)
    setError(null)
    try {
      if (category) await adminApi.renameCategory(category.id, name.trim(), slug.trim())
      else await adminApi.createCategory(name.trim(), slug.trim())
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLUG_EXISTS') setErrors({ slug: err.message })
      else setError(err instanceof Error ? err.message : String(err))
      setPending(false)
    }
  }

  return (
    <Dialog
      title={category ? 'Đổi tên danh mục' : 'Thêm danh mục'}
      submitLabel={category ? 'Lưu' : 'Thêm'}
      onSubmit={submit}
      onClose={onClose}
      pending={pending}
      error={error}
    >
      <Field label="Tên danh mục" error={errors.name}>
        {(p) => <input {...p} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />}
      </Field>
      <Field
        label="Đường dẫn (slug)"
        error={errors.slug}
        hint={category ? 'Đổi slug sẽ làm hỏng các liên kết cũ tới danh mục này' : `Để trống: ${slugify(name) || 'tự tạo từ tên'}`}
      >
        {(p) => <input {...p} value={slug} maxLength={100} onChange={(e) => setSlug(e.target.value)} />}
      </Field>
    </Dialog>
  )
}

export default function CategoriesPage() {
  const toast = useToast()
  const { data, error, reload } = useAsync((signal) => adminApi.categories(signal), [])
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null)

  return (
    <>
      <PageHeader title="Danh mục">
        <button type="button" className={btn.primary} onClick={() => setEditing('new')}>
          + Thêm danh mục
        </button>
      </PageHeader>
      {error ? (
        <ErrorMessage message={error.message} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <EmptyState title="Chưa có danh mục nào." />
      ) : (
        <div className={table.wrap}>
          <table className={`${table.table} min-w-0`}>
            <thead>
              <tr>
                <th className={table.th}>Tên</th>
                <th className={table.th}>Slug</th>
                <th className={`${table.th} text-right`}>Sản phẩm</th>
                <th className={table.th}>
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td className={`${table.td} font-medium`}>{c.name}</td>
                  <td className={`${table.td} font-mono text-stone-600`}>{c.slug}</td>
                  <td className={`${table.td} text-right tabular-nums`}>{c.productCount}</td>
                  <td className={`${table.td} text-right`}>
                    <button type="button" className={btn.secondary} onClick={() => setEditing(c)}>
                      Đổi tên
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            toast({ message: editing === 'new' ? 'Đã thêm danh mục' : 'Đã lưu danh mục', tone: 'success' })
            setEditing(null)
            reload()
          }}
        />
      )}
    </>
  )
}
