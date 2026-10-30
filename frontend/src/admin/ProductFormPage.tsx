import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Controller } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuthForm } from '../auth/useAuthForm'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { FormError, RequiredLegend, RequiredMark, TextField } from '../components/FormFields'
import { useToast } from '../components/Toast'
import { ApiError } from '../lib/api'
import { adminApi, type AdminCategory, type AdminProduct } from '../lib/adminApi'
import { formatPrice, formatPromotionEnd } from '../lib/format'
import { cloudinaryUrl } from '../lib/images'
import { NUTRIENTS, nutrientFieldLabel } from '../lib/nutrition'
import { slugify } from '../lib/slug'
import { useAsync } from '../lib/useAsync'
import NotFoundPage from '../pages/NotFoundPage'
import MoneyInput from './MoneyInput'
import {
  EMPTY_PRODUCT,
  isBigPriceChange,
  priceChangePercent,
  productSchemaFor,
  SHORT_DESCRIPTION_MAX,
  SHORT_DESCRIPTION_TOO_LONG,
  toForm,
  toInput,
  type ProductForm,
} from './productSchema'
import { VisibilityDialog } from './ProductsPage'
import { btn, card, input } from './styles'
import { Dialog, PageHeader, UnsavedChangesGuard } from './ui'

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

/** "Giá cũ 189.000₫ → Giá mới 1.890.000₫ (+900%)": shown before saving a price that moved by more than half. */
export function PriceChangeDialog({
  oldPrice,
  newPrice,
  onConfirm,
  onCancel,
}: {
  oldPrice: number
  newPrice: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const percent = priceChangePercent(oldPrice, newPrice)
  return (
    <Dialog title="Giá thay đổi nhiều, kiểm tra lại?" submitLabel="Xác nhận đổi giá" cancelLabel="Sửa lại" onSubmit={onConfirm} onClose={onCancel}>
      <p className="text-sm text-stone-700">
        Giá cũ <strong className="tabular-nums">{formatPrice(oldPrice)}</strong> → Giá mới{' '}
        <strong className="tabular-nums">{formatPrice(newPrice)}</strong>{' '}
        <span className={`font-semibold ${percent > 0 ? 'text-danger' : 'text-amber-800'}`}>
          ({percent > 0 ? '+' : ''}
          {percent}%)
        </span>
      </p>
      <p className="text-sm text-muted">Giá mới áp dụng ngay cho khách trên cửa hàng.</p>
    </Dialog>
  )
}

function ProductEditor({ product, categories }: { product: AdminProduct | null; categories: AdminCategory[] }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [current, setCurrent] = useState(product)
  // Values just saved: the form restarts from them (not dirty any more)
  const [saved, setSaved] = useState<ProductForm | null>(null)
  // Waiting for the admin's answer about a large price change
  const [priceAsk, setPriceAsk] = useState<{ oldPrice: number; newPrice: number; answer: (ok: boolean) => void } | null>(null)
  const [confirmVisibility, setConfirmVisibility] = useState(false)
  // Until the slug is edited by hand on a new product, it follows the name
  const [slugTouched, setSlugTouched] = useState(product !== null)
  // 409 PROMOTION_CONFLICT: a promotion started (or was created) after this page was loaded
  const [priceConflict, setPriceConflict] = useState<string | null>(null)
  const priceLockedUntil = current?.priceLockedUntil ?? null

  // A product on sale must keep a price; a hidden one may have none yet (it cannot be shown until it has one)
  const onSale = current?.active ?? false
  const { form, onSubmit, formError, pending } = useAuthForm<ProductForm>(
    productSchemaFor(product?.active ?? false),
    product ? toForm(product) : EMPTY_PRODUCT,
    async (values) => {
      const input = toInput(values)
      setPriceConflict(null)
      if (current) {
        const newPrice = input.price
        if (newPrice !== null && isBigPriceChange(current.price, newPrice)) {
          const ok = await new Promise<boolean>((answer) => setPriceAsk({ oldPrice: current.price, newPrice, answer }))
          setPriceAsk(null)
          if (!ok) {
            requestAnimationFrame(() => document.getElementById('price')?.focus())
            return
          }
        }
        const saved = await adminApi.updateProduct(current.id, input)
        setCurrent(saved)
        setSaved(toForm(saved))
        toast({ message: 'Đã lưu sản phẩm', tone: 'success' })
      } else {
        const created = await adminApi.createProduct(input)
        toast({ message: 'Đã tạo sản phẩm. Hãy thêm ảnh và nhập kho.', tone: 'success' })
        navigate(`/admin/san-pham/${created.id}`, { replace: true, state: { skipUnsavedGuard: true } })
      }
    },
    {
      onApiError: (err: ApiError, f) => {
        if (err.code === 'SLUG_EXISTS' || err.code === 'INVALID_SLUG') {
          f.setError('slug', { type: 'server', message: err.message }, { shouldFocus: true })
          return true
        }
        if (err.code === 'PROMOTION_CONFLICT') {
          setPriceConflict(err.message)
          requestAnimationFrame(() => document.getElementById('price-conflict')?.focus())
          return true
        }
        return false
      },
    },
  )
  const {
    register,
    formState: { errors, isDirty },
  } = form
  useEffect(() => {
    if (saved) form.reset(saved)
  }, [saved, form])
  const priceText = form.watch('price')
  const priceValue = /^\d+$/.test(priceText) ? Number(priceText) : null
  // Counted like the server (spaces around do not count). Typing or pasting past the limit is allowed (a maxLength
  // would cut a paste silently): the counter turns red, the error shows at once and saving waits.
  const shortDescriptionLength = (form.watch('shortDescription') ?? '').trim().length
  const shortDescriptionTooLong = shortDescriptionLength > SHORT_DESCRIPTION_MAX

  const nameField = register('name')
  const slugField = register('slug')
  const num = (name: keyof ProductForm, label: string, hint?: string) => (
    <TextField label={label} requiredMark inputMode="decimal" hint={hint} error={errors[name]?.message} {...register(name)} />
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
        <RequiredLegend />
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label="Tên sản phẩm"
            requiredMark
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
            <RequiredMark />
            <select
              id="category"
              aria-required="true"
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
          <Controller
            control={form.control}
            name="price"
            render={({ field, fieldState }) => (
              <div>
                <label htmlFor="price" className="text-sm font-medium text-stone-700">
                  Giá bán (₫)
                </label>
                {/* Required to show the product; a hidden one may wait for its price */}
                {onSale && <RequiredMark />}
                {priceConflict && (
                  <p id="price-conflict" tabIndex={-1} role="alert" className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
                    {priceConflict}
                  </p>
                )}
                <MoneyInput
                  id="price"
                  ref={field.ref}
                  name={field.name}
                  value={field.value === '' ? null : Number(field.value)}
                  onChange={(n) => field.onChange(n == null ? '' : String(n))}
                  onBlur={field.onBlur}
                  disabled={priceLockedUntil != null}
                  aria-invalid={fieldState.error ? true : undefined}
                  aria-required={onSale || undefined}
                  aria-describedby="price-help"
                  className={`${input} mt-1`}
                />
                <div id="price-help" className="mt-1 space-y-0.5 text-sm">
                  {fieldState.error ? (
                    <p className="text-danger">{fieldState.error.message}</p>
                  ) : priceValue != null ? (
                    <p className="text-muted tabular-nums">= {formatPrice(priceValue)}</p>
                  ) : (
                    <p className="text-muted">Chưa có giá: sản phẩm ở trạng thái ẩn cho tới khi nhập giá.</p>
                  )}
                  {!fieldState.error && priceValue != null && priceValue % 1000 !== 0 && (
                    <p className="text-amber-800">Giá không chẵn nghìn, kiểm tra lại nhé.</p>
                  )}
                  {priceLockedUntil && (
                    <p className="text-brand-800">
                      Đang có khuyến mại {formatPromotionEnd(priceLockedUntil, { year: false }).toLowerCase()} —{' '}
                      <Link to="/admin/khuyen-mai" className="font-semibold underline hover:text-brand-700">
                        kết thúc khuyến mại để đổi giá
                      </Link>
                    </p>
                  )}
                </div>
              </div>
            )}
          />
          {num('weightGrams', 'Khối lượng (g)')}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField label="Xuất xứ" error={errors.origin?.message} {...register('origin')} />
          {num('lowStockThreshold', 'Ngưỡng cảnh báo tồn kho', 'Cảnh báo khi số có thể bán ≤ ngưỡng này')}
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="shortDescription" className="text-sm font-medium text-stone-700">
              Mô tả ngắn
            </label>
            <span
              id="shortDescription-count"
              className={`text-sm tabular-nums ${shortDescriptionTooLong ? 'font-semibold text-danger' : 'text-muted'}`}
            >
              {shortDescriptionLength}/{SHORT_DESCRIPTION_MAX}
            </span>
          </div>
          <textarea
            id="shortDescription"
            rows={3}
            className={`${input} mt-1`}
            aria-invalid={shortDescriptionTooLong || errors.shortDescription ? true : undefined}
            aria-describedby="shortDescription-error shortDescription-help shortDescription-count"
            {...register('shortDescription')}
          />
          {(shortDescriptionTooLong || errors.shortDescription) && (
            <p id="shortDescription-error" className="mt-1 text-sm text-danger">
              {shortDescriptionTooLong ? SHORT_DESCRIPTION_TOO_LONG : errors.shortDescription?.message}
            </p>
          )}
          <p id="shortDescription-help" className="mt-1 text-sm text-muted">
            Hiển thị ở xem nhanh và kết quả tìm kiếm Google.
          </p>
        </div>
        <div>
          <label htmlFor="description" className="text-sm font-medium text-stone-700">
            Mô tả
          </label>
          <RequiredMark />
          <textarea
            id="description"
            rows={5}
            aria-required="true"
            className={`${input} mt-1`}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby="description-help"
            {...register('description')}
          />
          {errors.description && <p className="mt-1 text-sm text-danger">{errors.description.message}</p>}
          <p id="description-help" className="mt-1 text-sm text-muted">
            Chia thành nhiều mục: mỗi mục cách nhau một dòng trống, dòng đầu của mục là tiêu đề (ví dụ "Bảo quản:").
          </p>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold text-stone-900">Dinh dưỡng trên 100g (không bắt buộc)</legend>
          <p className="mt-1 text-sm text-muted">
            Số nguyên lớn hơn 0, không có phần lẻ (ví dụ 21, không phải 20,5). Nhập đủ cả 5 chỉ số, hoặc để trống hết nếu chưa
            có (cửa hàng sẽ không hiện bảng dinh dưỡng).
          </p>
          {/* 1, 2 then 3 per row: five in a row squeezed "Chất bột đường – Carb (g)" onto two lines and misaligned the fields */}
          <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {NUTRIENTS.map((n) => (
              <TextField
                key={n.key}
                label={nutrientFieldLabel(n.key)}
                type="number"
                step={1}
                min={1}
                inputMode="numeric"
                error={errors[n.key]?.message}
                {...register(n.key)}
              />
            ))}
          </div>
        </fieldset>
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Link to="/admin/san-pham" className={btn.secondary}>
            Huỷ
          </Link>
          <button type="submit" className={btn.primary} disabled={pending || shortDescriptionTooLong} aria-busy={pending}>
            {pending ? 'Đang lưu...' : current ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
          </button>
        </div>
      </form>

      {current ? (
        <ImageManager product={current} onChange={setCurrent} />
      ) : (
        <p className="text-sm text-muted">Có thể thêm ảnh sau khi tạo sản phẩm. Sản phẩm mới có tồn kho 0: nhập hàng ở trang Tồn kho.</p>
      )}

      <UnsavedChangesGuard when={isDirty && !pending && !priceAsk} />
      {priceAsk && (
        <PriceChangeDialog
          oldPrice={priceAsk.oldPrice}
          newPrice={priceAsk.newPrice}
          onConfirm={() => priceAsk.answer(true)}
          onCancel={() => priceAsk.answer(false)}
        />
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
