import { useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuthForm } from '../auth/useAuthForm'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { FormError, TextField } from '../components/FormFields'
import { useToast } from '../components/Toast'
import { ApiError } from '../lib/api'
import { adminApi, type AdminCategory, type AdminProduct } from '../lib/adminApi'
import { cloudinaryUrl } from '../lib/images'
import { slugify } from '../lib/slug'
import { useAsync } from '../lib/useAsync'
import NotFoundPage from '../pages/NotFoundPage'
import { EMPTY_PRODUCT, productSchema, toForm, toInput, type ProductForm } from './productSchema'
import { VisibilityDialog } from './ProductsPage'
import { btn, card, input } from './styles'
import { PageHeader } from './ui'

const MAX_IMAGES = 5
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Upload (JPEG/PNG/WebP ≤ 5MB, max 5), choose the primary image, delete. The server re-checks everything. */
function ImageManager({ product, onChange }: { product: AdminProduct; onChange: (p: AdminProduct) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const full = product.images.length >= MAX_IMAGES

  const run = async (action: () => Promise<AdminProduct>) => {
    setBusy(true)
    setError(null)
    try {
      onChange(await action())
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const room = MAX_IMAGES - product.images.length
    if (files.length > room) {
      setError(`Chỉ thêm được ${room} ảnh nữa (tối đa ${MAX_IMAGES} ảnh).`)
      return
    }
    for (const file of files) {
      if (!ACCEPTED.includes(file.type)) {
        setError(`"${file.name}" không phải ảnh JPEG, PNG hoặc WebP.`)
        return
      }
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" lớn hơn 5MB.`)
        return
      }
    }
    for (const file of files) {
      setBusy(true)
      setError(null)
      try {
        onChange(await adminApi.uploadImage(product.id, file))
      } catch (err) {
        setError(`${file.name}: ${message(err)}`)
        break
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <section className={`${card} p-5`} aria-labelledby="images-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="images-title" className="font-bold text-stone-900">
            Ảnh sản phẩm
          </h2>
          <p className="text-sm text-muted">
            JPEG, PNG hoặc WebP, tối đa 5MB, tối đa {MAX_IMAGES} ảnh. Ảnh chính hiển thị ở danh sách sản phẩm.
          </p>
        </div>
        <button type="button" className={btn.secondary} disabled={busy || full} onClick={() => fileRef.current?.click()}>
          {busy ? 'Đang tải lên...' : '+ Thêm ảnh'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED.join(',')}
          multiple
          hidden
          onChange={onFiles}
          aria-label="Chọn ảnh sản phẩm"
        />
      </div>
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {product.images.length === 0 ? (
        <p className="mt-4 text-sm text-stone-600">Chưa có ảnh. Cửa hàng đang hiển thị hình minh hoạ theo danh mục.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {product.images.map((img, i) => (
            <li key={img.id} className={`overflow-hidden rounded-xl border-2 ${img.primary ? 'border-brand-600' : 'border-stone-200'}`}>
              <img
                src={cloudinaryUrl(img.url, 320)}
                alt={`${product.name} – ảnh ${i + 1}`}
                width={160}
                height={160}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
              <div className="flex flex-wrap items-center justify-between gap-1 p-2 text-xs">
                {img.primary ? (
                  <span className="font-semibold text-brand-700"><span aria-hidden="true">★ </span>Ảnh chính</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    className="font-semibold text-stone-700 hover:text-brand-700"
                    onClick={() => run(() => adminApi.makePrimary(product.id, img.id))}
                  >
                    Đặt làm ảnh chính
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  className="font-semibold text-danger hover:underline"
                  aria-label={`Xoá ảnh ${i + 1}`}
                  onClick={() => run(() => adminApi.deleteImage(product.id, img.id))}
                >
                  Xoá
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ProductEditor({ product, categories }: { product: AdminProduct | null; categories: AdminCategory[] }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [current, setCurrent] = useState(product)
  const [confirmVisibility, setConfirmVisibility] = useState(false)
  // Until the slug is edited by hand on a new product, it follows the name
  const [slugTouched, setSlugTouched] = useState(product !== null)

  const { form, onSubmit, formError, pending } = useAuthForm<ProductForm>(
    productSchema,
    product ? toForm(product) : EMPTY_PRODUCT,
    async (values) => {
      if (current) {
        const saved = await adminApi.updateProduct(current.id, toInput(values))
        setCurrent(saved)
        toast({ message: 'Đã lưu sản phẩm', tone: 'success' })
      } else {
        const created = await adminApi.createProduct(toInput(values))
        toast({ message: 'Đã tạo sản phẩm. Hãy thêm ảnh và nhập kho.', tone: 'success' })
        navigate(`/admin/san-pham/${created.id}`, { replace: true })
      }
    },
    {
      onApiError: (err: ApiError, f) => {
        if (err.code === 'SLUG_EXISTS' || err.code === 'INVALID_SLUG') {
          f.setError('slug', { type: 'server', message: err.message }, { shouldFocus: true })
          return true
        }
        return false
      },
    },
  )
  const {
    register,
    formState: { errors },
  } = form

  const nameField = register('name')
  const slugField = register('slug')
  const num = (name: keyof ProductForm, label: string, hint?: string) => (
    <TextField label={label} inputMode="decimal" hint={hint} error={errors[name]?.message} {...register(name)} />
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/admin/san-pham" className="text-sm text-stone-600 hover:text-brand-700">
        ← Danh sách sản phẩm
      </Link>
      <PageHeader title={current ? `Sửa: ${current.name}` : 'Thêm sản phẩm'}>
        {current && (
          <>
            <a href={`/san-pham/${current.slug}`} target="_blank" rel="noreferrer" className={btn.secondary}>
              Xem trên cửa hàng ↗
            </a>
            <button type="button" className={btn.secondary} onClick={() => setConfirmVisibility(true)}>
              {current.active ? 'Ẩn sản phẩm' : 'Hiện sản phẩm'}
            </button>
          </>
        )}
      </PageHeader>
      {current && !current.active && (
        <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">Sản phẩm đang ẩn khỏi cửa hàng.</p>
      )}

      <form onSubmit={onSubmit} noValidate className={`${card} space-y-5 p-5`}>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label="Tên sản phẩm"
            error={errors.name?.message}
            {...nameField}
            onChange={(e) => {
              void nameField.onChange(e)
              if (!slugTouched) form.setValue('slug', slugify(e.target.value))
            }}
          />
          <TextField
            label="Đường dẫn (slug)"
            hint="Tự tạo từ tên; chỉ chữ thường không dấu, số và dấu gạch ngang"
            error={errors.slug?.message}
            {...slugField}
            onChange={(e) => {
              setSlugTouched(true)
              void slugField.onChange(e)
            }}
          />
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <label htmlFor="category" className="text-sm font-medium text-stone-700">
              Danh mục
            </label>
            <select
              id="category"
              className={`${input} mt-1`}
              aria-invalid={errors.categoryId ? true : undefined}
              {...register('categoryId')}
            >
              <option value="">Chọn danh mục</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.categoryId && <p className="mt-1 text-sm text-danger">{errors.categoryId.message}</p>}
          </div>
          {num('price', 'Giá bán (₫)')}
          {num('weightGrams', 'Khối lượng (g)')}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField label="Xuất xứ" error={errors.origin?.message} {...register('origin')} />
          {num('lowStockThreshold', 'Ngưỡng cảnh báo tồn kho', 'Cảnh báo khi số có thể bán ≤ ngưỡng này')}
        </div>
        <div>
          <label htmlFor="description" className="text-sm font-medium text-stone-700">
            Mô tả
          </label>
          <textarea
            id="description"
            rows={5}
            className={`${input} mt-1`}
            aria-invalid={errors.description ? true : undefined}
            {...register('description')}
          />
          {errors.description && <p className="mt-1 text-sm text-danger">{errors.description.message}</p>}
        </div>
        <fieldset>
          <legend className="text-sm font-semibold text-stone-900">Dinh dưỡng trên 100g</legend>
          <div className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-5">
            {num('calories', 'Năng lượng (kcal)')}
            {num('protein', 'Protein (g)')}
            {num('fat', 'Chất béo (g)')}
            {num('carbs', 'Carb (g)')}
            {num('fiber', 'Chất xơ (g)')}
          </div>
        </fieldset>
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Link to="/admin/san-pham" className={btn.secondary}>
            Huỷ
          </Link>
          <button type="submit" className={btn.primary} disabled={pending} aria-busy={pending}>
            {pending ? 'Đang lưu...' : current ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
          </button>
        </div>
      </form>

      {current ? (
        <ImageManager product={current} onChange={setCurrent} />
      ) : (
        <p className="text-sm text-muted">Có thể thêm ảnh sau khi tạo sản phẩm. Sản phẩm mới có tồn kho 0: nhập hàng ở trang Tồn kho.</p>
      )}

      {confirmVisibility && current && (
        <VisibilityDialog
          product={current}
          onClose={() => setConfirmVisibility(false)}
          onDone={async () => {
            setConfirmVisibility(false)
            toast({ message: current.active ? 'Đã ẩn sản phẩm' : 'Đã hiện sản phẩm', tone: 'success' })
            setCurrent(await adminApi.product(current.id))
          }}
        />
      )}
    </div>
  )
}

export default function ProductFormPage() {
  const { id } = useParams()
  const productId = id ? Number(id) : null
  const { data, error, reload } = useAsync(
    async (signal) => {
      const [categories, product] = await Promise.all([
        adminApi.categories(signal),
        productId ? adminApi.product(productId, signal) : Promise.resolve(null),
      ])
      return { categories, product }
    },
    [productId],
  )

  if (id && !Number.isInteger(productId)) return <NotFoundPage />
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
  if (error) return <ErrorMessage message={error.message} onRetry={reload} />
  if (!data || (data.product?.id ?? null) !== productId) return <Spinner />
  return <ProductEditor key={productId ?? 'new'} product={data.product} categories={data.categories} />
}
