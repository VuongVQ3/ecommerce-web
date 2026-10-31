import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { ApiError } from '../lib/api'
import { adminApi, type MovementType, type StockRow } from '../lib/adminApi'
import { formatAdminDateTime, formatPrice } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { btn, table } from './styles'
import MoneyInput from './MoneyInput'
import { ActionMenu, Badge, Dialog, EmptyState, Field, FilterBar, PageHeader, Pagination, SearchFilter, StockBadge, TableFrame } from './ui'
import { RequiredLegend } from '../components/FormFields'

const MOVEMENT_LABEL: Record<MovementType, string> = {
  IMPORT: 'Nhập hàng',
  ADJUST: 'Kiểm kê / điều chỉnh',
  ORDER_RESERVE: 'Giữ hàng cho đơn',
  ORDER_CANCEL: 'Trả lại (huỷ đơn)',
  ORDER_SHIP: 'Xuất kho (giao đơn)',
  RETURN: 'Hàng hoàn về (khách không nhận)',
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Parses a whole number typed by staff; empty → undefined. */
const toInt = (value: string) => (value.trim() === '' ? undefined : Number(value.replace(/[.\s]/g, '')))

function ImportDialog({ product, onDone, onClose }: { product: StockRow; onDone: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ quantity: '', supplier: '', note: '' })
  const [unitCost, setUnitCost] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  // Live summary while typing: only for a quantity that would be accepted
  const typed = toInt(form.quantity)
  const adding = typed !== undefined && Number.isInteger(typed) && typed > 0 ? typed : null

  const submit = async () => {
    const quantity = toInt(form.quantity)
    const next: Record<string, string> = {}
    if (!quantity || !Number.isInteger(quantity) || quantity <= 0) next.quantity = 'Số lượng phải là số nguyên lớn hơn 0'
    if (unitCost !== null && unitCost > 1_000_000_000) next.unitCost = 'Giá nhập quá lớn'
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    setError(null)
    try {
      await adminApi.importStock(product.id, {
        quantity: quantity!,
        unitCost: unitCost ?? undefined,
        supplier: form.supplier.trim() || undefined,
        note: form.note.trim() || undefined,
      })
      onDone()
    } catch (err) {
      setError(message(err))
      if (err instanceof ApiError) setErrors(err.fieldErrors)
      setPending(false)
    }
  }

  return (
    <Dialog title={`Nhập hàng: ${product.name}`} submitLabel="Nhập kho" onSubmit={submit} onClose={onClose} pending={pending} error={error}>
      <p className="text-sm text-stone-600">
        Tồn hiện tại: <strong className="tabular-nums">{product.onHand}</strong>
      </p>
      <RequiredLegend />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Số lượng nhập" requiredMark error={errors.quantity}>
          {(p) => <input {...p} inputMode="numeric" value={form.quantity} onChange={set('quantity')} autoFocus />}
        </Field>
        <Field label="Giá nhập / đơn vị (₫)" error={errors.unitCost} hint="Không bắt buộc">
          {(p) => <MoneyInput {...p} value={unitCost} onChange={setUnitCost} />}
        </Field>
      </div>
      {adding !== null && (
        <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-stone-800" aria-live="polite">
          <p>
            Tồn sau khi nhập:{' '}
            <strong className="tabular-nums">
              {product.onHand.toLocaleString('vi-VN')} → {(product.onHand + adding).toLocaleString('vi-VN')}
            </strong>
          </p>
          {unitCost !== null && unitCost > 0 && (
            <p className="mt-1">
              Thành tiền:{' '}
              <span className="tabular-nums">
                {adding.toLocaleString('vi-VN')} × {formatPrice(unitCost)} = <strong>{formatPrice(adding * unitCost)}</strong>
              </span>
            </p>
          )}
        </div>
      )}
      <Field label="Nhà cung cấp" error={errors.supplier} hint="Không bắt buộc">
        {(p) => <input {...p} maxLength={200} value={form.supplier} onChange={set('supplier')} />}
      </Field>
      <Field label="Ghi chú" error={errors.note} hint="Không bắt buộc">
        {(p) => <input {...p} maxLength={500} value={form.note} onChange={set('note')} />}
      </Field>
    </Dialog>
  )
}

function StocktakeDialog({ product, onDone, onClose }: { product: StockRow; onDone: (text: string) => void; onClose: () => void }) {
  const [counted, setCounted] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const value = toInt(counted)
  const diff = value !== undefined && Number.isInteger(value) ? value - product.onHand : null

  const submit = async () => {
    const next: Record<string, string> = {}
    if (value === undefined || !Number.isInteger(value) || value < 0) next.counted = 'Nhập số đếm thực tế (số nguyên ≥ 0)'
    if (!reason.trim()) next.reason = 'Vui lòng nhập lý do điều chỉnh'
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    setError(null)
    try {
      const result = await adminApi.stocktake(product.id, value!, reason.trim())
      onDone(result.difference === 0 ? 'Số đếm khớp tồn kho, không cần điều chỉnh' : `Đã điều chỉnh ${result.difference > 0 ? '+' : ''}${result.difference}`)
    } catch (err) {
      setError(message(err))
      if (err instanceof ApiError) setErrors(err.fieldErrors)
      setPending(false)
    }
  }

  return (
    <Dialog title={`Kiểm kê: ${product.name}`} submitLabel="Lưu kiểm kê" onSubmit={submit} onClose={onClose} pending={pending} error={error}>
      <p className="text-sm text-stone-600">
        Tồn trên hệ thống: <strong className="tabular-nums">{product.onHand}</strong> (đang giữ cho đơn:{' '}
        <span className="tabular-nums">{product.reserved}</span>)
      </p>
      <Field label="Số đếm thực tế" requiredMark error={errors.counted}>
        {(p) => <input {...p} inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />}
      </Field>
      {diff !== null && diff !== 0 && (
        <p className={`text-sm font-semibold ${diff < 0 ? 'text-danger' : 'text-success'}`} aria-live="polite">
          Chênh lệch: {diff > 0 ? '+' : ''}
          {diff}
        </p>
      )}
      <Field label="Lý do" requiredMark error={errors.reason}>
        {(p) => (
          <input {...p} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Hư hỏng, đếm sai lần trước" />
        )}
      </Field>
    </Dialog>
  )
}

function HistoryDialog({ product, onClose }: { product: StockRow; onClose: () => void }) {
  const [page, setPage] = useState(0)
  const { data, error } = useAsync((signal) => adminApi.movements(product.id, page, signal), [product.id, page])

  return (
    <Dialog title={`Lịch sử kho: ${product.name}`} onClose={onClose} width="52rem">
      {error ? (
        <ErrorMessage message={error.message} />
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="Chưa có biến động kho." />
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className={table.thStatic}>Thời gian</th>
                <th className={table.thStatic}>Loại</th>
                <th className={`${table.thStatic} text-right`}>SL</th>
                <th className={table.thStatic}>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => (
                <tr key={m.id}>
                  <td className={`${table.td} whitespace-nowrap`}>{formatAdminDateTime(m.createdAt)}</td>
                  <td className={table.td}>{MOVEMENT_LABEL[m.type]}</td>
                  <td className={`${table.td} text-right font-semibold tabular-nums ${m.quantity < 0 ? 'text-danger' : 'text-success'}`}>
                    {m.quantity > 0 ? '+' : ''}
                    {m.quantity}
                  </td>
                  <td className={`${table.td} text-stone-700`}>
                    {[
                      m.orderCode && `Đơn ${m.orderCode}`,
                      m.supplier && `NCC: ${m.supplier}`,
                      m.unitCost != null && `Giá nhập ${formatPrice(m.unitCost)}`,
                      m.note,
                      m.actorName && `bởi ${m.actorName}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </div>
      )}
    </Dialog>
  )
}

/** Out of stock in red, at or under the threshold in orange */
const rowTone = (p: StockRow) => (p.available <= 0 ? 'bg-red-50/70' : p.lowStock ? 'bg-orange-50' : '')

function ProductName({ p }: { p: StockRow }) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-medium text-stone-900" title={p.name}>
          {p.name}
        </span>
        {!p.active && <Badge tone="gray">Đang ẩn</Badge>}
      </div>
      <div className="text-xs text-muted">Ngưỡng cảnh báo: {p.lowStockThreshold}</div>
    </>
  )
}

type Open = { kind: 'import' | 'stocktake' | 'history'; product: StockRow } | null

export default function InventoryPage() {
  const [params, setParams] = useSearchParams()
  const low = params.get('low') === '1'
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 0)
  const [open, setOpen] = useState<Open>(null)
  const toast = useToast()
  const { data, error, loading, reload } = useAsync((signal) => adminApi.inventory(q, low, signal, page), [q, low, page])

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const finished = (text: string) => {
    setOpen(null)
    toast({ message: text, tone: 'success' })
    reload()
  }

  /** "Nhập hàng" is the everyday action and gets a button; the rarer ones sit in the "⋯" menu */
  const rowActions = (p: StockRow) => (
    <div className="flex shrink-0 justify-end gap-2">
      <button type="button" className={btn.secondary} onClick={() => setOpen({ kind: 'import', product: p })}>
        Nhập hàng
      </button>
      <ActionMenu
        label={`Thao tác khác với ${p.name}`}
        items={[
          { label: 'Kiểm kê', onSelect: () => setOpen({ kind: 'stocktake', product: p }) },
          { label: 'Lịch sử kho', onSelect: () => setOpen({ kind: 'history', product: p }) },
        ]}
      />
    </div>
  )

  return (
    <>
      <PageHeader title="Tồn kho" />
      <FilterBar>
        <SearchFilter key={q} initial={q} placeholder="Tên sản phẩm" label="Tìm sản phẩm" onSearch={(text) => update({ q: text })} />
        <label className="flex h-10 items-center gap-2 text-sm font-medium text-stone-700">
          <input type="checkbox" checked={low} onChange={(e) => update({ low: e.target.checked ? '1' : '' })} className="size-5 accent-brand-600" />
          Chỉ hàng sắp hết
        </label>
      </FilterBar>

      {error ? (
        <ErrorMessage message={error.message} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title={low ? 'Không có sản phẩm nào dưới ngưỡng.' : 'Không tìm thấy sản phẩm.'} />
      ) : (
        <div aria-busy={loading}>
          <ul className="space-y-3 md:hidden">
            {data.items.map((p) => (
              <li key={p.id} className={`rounded-2xl border p-4 text-sm ${p.lowStock || p.available <= 0 ? `border-orange-200 ${rowTone(p)}` : 'border-stone-200 bg-white'}`}>
                <ProductName p={p} />
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dt className="text-xs text-muted">Tồn kho</dt>
                    <dd className="tabular-nums">{p.onHand}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Đang giữ</dt>
                    <dd className="tabular-nums">{p.reserved}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Có thể bán</dt>
                    <dd className="flex flex-wrap items-center justify-center gap-1 font-semibold tabular-nums">
                      {p.available}
                      <StockBadge available={p.available} lowStock={p.lowStock} />
                    </dd>
                  </div>
                </dl>
                <div className="mt-3">{rowActions(p)}</div>
              </li>
            ))}
          </ul>
        <TableFrame className="hidden md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className={table.th}>Sản phẩm</th>
                <th className={`${table.th} text-right`}>Tồn kho</th>
                <th className={`${table.th} text-right`}>Đang giữ</th>
                <th className={`${table.th} text-right`}>Có thể bán</th>
                <th className={table.th}>
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className={rowTone(p)}>
                  <td className={`${table.td} max-w-96`}>
                    <ProductName p={p} />
                  </td>
                  <td className={`${table.td} text-right tabular-nums`}>{p.onHand}</td>
                  <td className={`${table.td} text-right tabular-nums`}>{p.reserved}</td>
                  <td className={`${table.td} text-right font-semibold whitespace-nowrap tabular-nums`}>
                    <span className="inline-flex items-center gap-2">
                      <StockBadge available={p.available} lowStock={p.lowStock} />
                      {p.available}
                    </span>
                  </td>
                  <td className={`${table.td} text-right`}>{rowActions(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
        <Pagination page={data.page} totalPages={data.totalPages} onChange={(n) => update({ page: String(n) })} />
        </div>
      )}

      {open?.kind === 'import' && (
        <ImportDialog product={open.product} onClose={() => setOpen(null)} onDone={() => finished('Đã nhập kho')} />
      )}
      {open?.kind === 'stocktake' && <StocktakeDialog product={open.product} onClose={() => setOpen(null)} onDone={finished} />}
      {open?.kind === 'history' && <HistoryDialog product={open.product} onClose={() => setOpen(null)} />}
    </>
  )
}
