import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { ApiError, type Page } from '../lib/api'
import { PriceTag } from '../components/Price'
import { adminApi, promotionApi, type AdminProductRow, type PromotionRow } from '../lib/adminApi'
import { formatPrice } from '../lib/format'
import { categoryEmoji } from '../lib/categoryStyle'
import { cloudinaryUrl } from '../lib/images'
import { useAsync } from '../lib/useAsync'
import { btn, table } from './styles'
import { arrayMove, dropAnchor } from './reorder'
import { ActionMenu, Dialog, EmptyState, FilterBar, PageHeader, Pagination, SearchFilter } from './ui'
import { useDragReorder } from './useDragReorder'

/** The whole catalogue fits one page, so a product can be dragged anywhere (the server allows up to 100) */
const PAGE_SIZE = 100
const REORDER_HELP_ID = 'reorder-help'
const HIDDEN_DIVIDER = 'Đang ẩn · xếp theo tên A→Z'

/** notReady: cannot be sold yet (no price, or no stock): what the owner still has to fill in */
const FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'true', label: 'Đang bán' },
  { value: 'false', label: 'Đang ẩn' },
  { value: 'notReady', label: 'Chưa sẵn sàng' },
] as const

type Filter = (typeof FILTERS)[number]['value']

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

/**
 * Deleting for good: only a product that was never ordered (old orders keep showing it); the server refuses
 * otherwise with PRODUCT_HAS_ORDERS, and the dialog then offers to hide it instead.
 */
export function DeleteProductDialog({
  product,
  onClose,
  onDone,
  onHide,
}: {
  product: AdminProductRow
  onClose: () => void
  onDone: () => void
  /** Opens the hide dialog instead (offered when the product has orders and is on sale) */
  onHide: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasOrders, setHasOrders] = useState(false)

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      await adminApi.deleteProduct(product.id)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setHasOrders(err instanceof ApiError && err.code === 'PRODUCT_HAS_ORDERS')
      setPending(false)
    }
  }

  return (
    <Dialog
      title={`Xoá "${product.name}"?`}
      submitLabel="Xoá vĩnh viễn"
      tone="danger"
      onSubmit={hasOrders ? undefined : submit}
      onClose={onClose}
      pending={pending}
      // Refused because of orders: the reason comes first, then the way out
      error={hasOrders ? null : error}
    >
      {hasOrders ? (
        <>
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
          {product.active && (
            <button type="button" className={`${btn.secondary} self-start`} onClick={onHide}>
              Ẩn sản phẩm thay vì xoá
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-stone-600">
            Sản phẩm sẽ bị xoá hẳn cùng ảnh, lịch sử kho, khuyến mại và các dòng trong giỏ hàng của khách. Không khôi phục
            được.
          </p>
          {product.onHand > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              Trong kho vẫn còn {product.onHand} sản phẩm.
            </p>
          )}
          <p className="text-sm text-muted">Chỉ muốn ngừng bán? Hãy ẩn sản phẩm: có thể hiện lại bất cứ lúc nào.</p>
        </>
      )}
    </Dialog>
  )
}

type HandleProps = ReturnType<ReturnType<typeof useDragReorder>['handleProps']>

/** Six-dot grip: drag it, or focus it and press ↑/↓ */
function DragHandle({ name, active, ...props }: { name: string; active: boolean } & HandleProps) {
  return (
    <button
      type="button"
      aria-label={`Đổi thứ tự: ${name}`}
      aria-describedby={REORDER_HELP_ID}
      className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-brand-700 ${
        active ? 'cursor-grabbing bg-stone-100 text-stone-700' : 'cursor-grab text-stone-400'
      }`}
      {...props}
    >
      <span aria-hidden>⠿</span>
    </button>
  )
}

function Thumb({ url, categorySlug }: { url: string | null; categorySlug: string }) {
  return url ? (
    <img src={cloudinaryUrl(url, 96)} alt="" width={48} height={48} loading="lazy" className="size-12 shrink-0 rounded-lg object-cover" />
  ) : (
    <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-xl">
      {categoryEmoji(categorySlug)}
    </span>
  )
}

/**
 * The price, or "Chưa có giá" for a product still being prepared (price 0). During a promotion: the sale price in red,
 * the regular price struck through and the discount, as on the storefront.
 */
function PriceCell({ price, promotion }: { price: number; promotion?: PromotionRow }) {
  if (price > 0 && promotion && promotion.salePrice < price)
    return (
      <span className="inline-flex flex-col items-end">
        <PriceTag price={promotion.salePrice} regularPrice={price} className="font-semibold" regularClassName="text-xs text-muted" />
        <span className="mt-0.5 rounded-full bg-red-700 px-1.5 text-xs font-bold text-white">
          <span className="sr-only">Giảm </span>-{promotion.discountPercent}%
        </span>
      </span>
    )
  return price > 0 ? (
    <>{formatPrice(price)}</>
  ) : (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-amber-900">Chưa có giá</span>
  )
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-brand-800">Đang bán</span>
  ) : (
    <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-stone-700">Đang ẩn</span>
  )
}

export default function ProductsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const filter = (params.get('active') ?? '') as Filter
  const active = filter === 'notReady' ? '' : filter
  const page = Number(params.get('page') ?? 0)
  const [toggle, setToggle] = useState<AdminProductRow | null>(null)
  const [remove, setRemove] = useState<AdminProductRow | null>(null)
  const toast = useToast()
  const { data, error, loading, reload } = useAsync(
    (signal) => adminApi.products(q, active, page, signal, filter === 'notReady', PAGE_SIZE),
    [q, active, filter, page],
  )
  // Running promotions, to show sale prices; the list still works without them
  const promotions = useAsync((signal) => promotionApi.list(signal).catch(() => [] as PromotionRow[]), []).data
  const runningPromotion = new Map((promotions ?? []).filter((r) => r.status === 'RUNNING').map((r) => [r.productId, r]))

  // Order of the products on sale shown after a move, before the server confirms it; tied to the data it was made
  // from, so fresh data wins
  const [moved, setMoved] = useState<{ source: Page<AdminProductRow>; ids: number[] } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // Moves are sent one after another, in the order they were made; a failure drops the ones still waiting
  const queue = useRef(Promise.resolve())
  const generation = useRef(0)
  // The server lists the products on sale first (in their dragged order), then the hidden ones by name: only the
  // first part can be dragged
  const onSale = !data
    ? []
    : moved?.source === data
      ? moved.ids.map((id) => data.items.find((p) => p.id === id)!)
      : data.items.filter((p) => p.active)
  const hidden = data ? data.items.filter((p) => !p.active) : []

  const onMove = (id: number, from: number, to: number) => {
    if (!data) return
    const ids = arrayMove(
      onSale.map((p) => p.id),
      from,
      to,
    )
    const anchor = dropAnchor(ids, id)
    if (!anchor) return
    setMoved({ source: data, ids })
    setAnnouncement(`Đã chuyển "${onSale[from].name}" tới vị trí ${to + 1} trên ${ids.length}`)
    const gen = generation.current
    queue.current = queue.current
      .then(() => (gen === generation.current ? adminApi.moveProduct(id, anchor) : undefined))
      .then(
        () => undefined,
        (err) => {
          if (gen !== generation.current) return
          generation.current++
          toast({ message: err instanceof Error ? err.message : String(err), tone: 'error' })
          // Drop the local order first: the reload may return the very same data, which would keep it otherwise
          setMoved(null)
          reload()
        },
      )
  }
  const { dragging, rowProps, handleProps } = useDragReorder(onSale, (p) => p.id, onMove)
  const showDivider = onSale.length > 0 && hidden.length > 0

  /** "Sửa" is the main action; hiding and deleting (in red, both confirmed in a dialog) wait in the "⋯" menu */
  const actions = (p: AdminProductRow) => (
    <div className="flex shrink-0 justify-end gap-2">
      <Link to={`/admin/san-pham/${p.id}`} className={btn.secondary}>
        Sửa
      </Link>
      <ActionMenu
        label={`Thao tác khác với ${p.name}`}
        items={[
          { label: p.active ? 'Ẩn sản phẩm' : 'Hiện sản phẩm', onSelect: () => setToggle(p) },
          { label: 'Xoá sản phẩm', onSelect: () => setRemove(p), danger: true },
        ]}
      />
    </div>
  )

  /** index: position among the products on sale; null for a hidden product (no handle, an empty slot instead) */
  const card = (p: AdminProductRow, index: number | null) => (
    <li
      key={p.id}
      {...(index === null ? {} : rowProps('cards', p.id, index))}
      className={`flex items-start gap-2 rounded-2xl border border-stone-200 p-3 pl-1.5 ${p.active ? 'bg-white' : 'bg-stone-50'} ${
        dragging === p.id ? 'shadow-lg ring-2 ring-brand-500' : ''
      }`}
    >
      {index === null ? (
        <span aria-hidden className="size-10 shrink-0" />
      ) : (
        <DragHandle name={p.name} active={dragging === p.id} {...handleProps('cards', p.id, index)} />
      )}
      <Thumb url={p.imageUrl} categorySlug={p.categorySlug} />
      <div className="min-w-0 flex-1 text-sm">
        <Link to={`/admin/san-pham/${p.id}`} className="line-clamp-2 font-medium break-words text-stone-900 hover:text-brand-700 hover:underline" title={p.name}>
          {p.name}
        </Link>
        <p className="text-xs text-muted">{p.categoryName}</p>
        <p className="mt-1 tabular-nums">
          <span className="font-semibold">
            <PriceCell price={p.price} promotion={runningPromotion.get(p.id)} />
          </span>
          <span className={`text-muted ${p.lowStock ? 'font-semibold text-amber-900' : ''}`}> · còn {p.available}</span>
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <ActiveBadge active={p.active} />
          {actions(p)}
        </div>
      </div>
    </li>
  )

  const tableRow = (p: AdminProductRow, index: number | null) => (
    <tr
      key={p.id}
      {...(index === null ? {} : rowProps('table', p.id, index))}
      className={`${p.active ? 'bg-white' : 'bg-stone-50 text-stone-500'} ${dragging === p.id ? 'shadow-lg outline-2 -outline-offset-2 outline-brand-500' : ''}`}
    >
      <td className={`${table.td} w-12 pr-0`}>
        {index === null ? (
          <span aria-hidden className="block size-10" />
        ) : (
          <DragHandle name={p.name} active={dragging === p.id} {...handleProps('table', p.id, index)} />
        )}
      </td>
      <td className={table.td}>
        <div className="flex items-center gap-3">
          <Thumb url={p.imageUrl} categorySlug={p.categorySlug} />
          <div className="min-w-0">
            <Link
              to={`/admin/san-pham/${p.id}`}
              title={p.name}
              className="block max-w-44 truncate font-medium text-stone-900 hover:text-brand-700 hover:underline xl:max-w-80"
            >
              {p.name}
            </Link>
            <div className="text-xs text-muted">{p.categoryName}</div>
          </div>
        </div>
      </td>
      <td className={`${table.td} text-right tabular-nums`}>
        <PriceCell price={p.price} promotion={runningPromotion.get(p.id)} />
      </td>
      <td className={`${table.td} text-right tabular-nums ${p.lowStock ? 'font-semibold text-amber-900' : ''}`}>{p.available}</td>
      <td className={`${table.td} hidden xl:table-cell`}>
        <ActiveBadge active={p.active} />
      </td>
      <td className={`${table.td} text-right`}>{actions(p)}</td>
    </tr>
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

  return (
    <>
      <PageHeader title="Sản phẩm">
        <Link to="/admin/san-pham/moi" className={btn.primary}>
          + Thêm sản phẩm
        </Link>
      </PageHeader>

      <FilterBar>
        <SearchFilter key={q} initial={q} placeholder="Tên hoặc slug" label="Tìm sản phẩm" onSearch={(text) => update({ q: text })} />
        <div className="flex gap-2 overflow-x-auto md:h-10 md:items-center" role="group" aria-label="Lọc theo trạng thái">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => update({ active: f.value })}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${
                filter === f.value ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </FilterBar>

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
          <p id={REORDER_HELP_ID} className="mb-3 text-sm text-muted">
            {onSale.length > 0 ? (
              <>
                Kéo tay nắm <span aria-hidden>⠿</span> để đổi thứ tự hiển thị trên cửa hàng, hoặc chọn tay nắm rồi bấm phím ↑/↓.
                {data.totalPages > 1 && <span className="font-medium text-amber-900"> Chỉ kéo được trong trang đang xem.</span>}
              </>
            ) : (
              'Sản phẩm đang ẩn được xếp theo tên. Hiện sản phẩm để sắp xếp lại.'
            )}
          </p>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          <ul className="space-y-3 md:hidden">
            {onSale.map((p, i) => card(p, i))}
            {showDivider && (
              <li key="hidden-divider" className="px-1 pt-3 text-sm font-semibold text-stone-600">
                {HIDDEN_DIVIDER}
              </li>
            )}
            {hidden.map((p) => card(p, null))}
          </ul>
          <div className={`${table.wrap} hidden md:block`}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className={`${table.th} w-12`}>
                    <span className="sr-only">Thứ tự</span>
                  </th>
                  <th className={table.th}>Sản phẩm</th>
                  <th className={`${table.th} text-right`}>Giá</th>
                  <th className={`${table.th} text-right`}>Có thể bán</th>
                  {/* Below 1280px the hidden products are told apart by their divider and grey rows */}
                  <th className={`${table.th} hidden xl:table-cell`}>Trạng thái</th>
                  <th className={table.th}>
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {onSale.map((p, i) => tableRow(p, i))}
                {showDivider && (
                  <tr key="hidden-divider">
                    <td colSpan={6} className="border-t border-stone-200 bg-stone-100 px-4 py-2 text-xs font-semibold text-stone-600">
                      {HIDDEN_DIVIDER}
                    </td>
                  </tr>
                )}
                {hidden.map((p) => tableRow(p, null))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => update({ page: String(p) })} />
        </div>
      )}

      {remove && (
        <DeleteProductDialog
          product={remove}
          onClose={() => setRemove(null)}
          onHide={() => {
            setRemove(null)
            setToggle(remove)
          }}
          onDone={() => {
            toast({ message: `Đã xoá "${remove.name}"`, tone: 'success' })
            setRemove(null)
            reload()
          }}
        />
      )}

      {toggle && (
        <VisibilityDialog
          product={toggle}
          onClose={() => setToggle(null)}
          onDone={() => {
            toast({ message: toggle.active ? 'Đã ẩn sản phẩm' : 'Đã hiện sản phẩm · xếp ở cuối danh sách đang bán', tone: 'success' })
            setToggle(null)
            reload()
          }}
        />
      )}
    </>
  )
}
