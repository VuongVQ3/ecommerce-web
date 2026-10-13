import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { ApiError } from '../lib/api'
import { adminApi, type MovementType, type StockRow } from '../lib/adminApi'
import { formatDateTime, formatPrice } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { btn, input, table } from './styles'
import { Dialog, EmptyState, Field, PageHeader, Pagination } from './ui'

const MOVEMENT_LABEL: Record<MovementType, string> = {
  IMPORT: 'Nhập hàng',
  ADJUST: 'Kiểm kê / điều chỉnh',
  ORDER_RESERVE: 'Giữ hàng cho đơn',
  ORDER_CANCEL: 'Trả lại (huỷ đơn)',
  ORDER_SHIP: 'Xuất kho (giao đơn)',
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Parses a whole number typed by staff; empty → undefined. */
const toInt = (value: string) => (value.trim() === '' ? undefined : Number(value.replace(/[.\s]/g, '')))

function ImportDialog({ product, onDone, onClose }: { product: StockRow; onDone: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ quantity: '', unitCost: '', supplier: '', note: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const submit = async () => {
    const quantity = toInt(form.quantity)
    const unitCost = toInt(form.unitCost)
    const next: Record<string, string> = {}
    if (!quantity || !Number.isInteger(quantity) || quantity <= 0) next.quantity = 'Số lượng phải là số nguyên lớn hơn 0'
    if (unitCost !== undefined && (!Number.isInteger(unitCost) || unitCost < 0)) next.unitCost = 'Giá nhập không hợp lệ'
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    setError(null)
    try {
      await adminApi.importStock(product.id, {
        quantity: quantity!,
        unitCost,
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Số lượng nhập" error={errors.quantity}>
          {(p) => <input {...p} inputMode="numeric" value={form.quantity} onChange={set('quantity')} autoFocus />}
        </Field>
        <Field label="Giá nhập / đơn vị (₫)" error={errors.unitCost} hint="Không bắt buộc">
          {(p) => <input {...p} inputMode="numeric" value={form.unitCost} onChange={set('unitCost')} />}
        </Field>
      </div>
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
      <Field label="Số đếm thực tế" error={errors.counted}>
        {(p) => <input {...p} inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />}
      </Field>
      {diff !== null && diff !== 0 && (
        <p className={`text-sm font-semibold ${diff < 0 ? 'text-danger' : 'text-success'}`} aria-live="polite">
          Chênh lệch: {diff > 0 ? '+' : ''}
          {diff}
        </p>
      )}
      <Field label="Lý do" error={errors.reason}>
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
                <th className={table.th}>Thời gian</th>
                <th className={table.th}>Loại</th>
                <th className={`${table.th} text-right`}>SL</th>
                <th className={table.th}>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => (
                <tr key={m.id}>
                  <td className={`${table.td} whitespace-nowrap`}>{formatDateTime(m.createdAt)}</td>
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

type Open = { kind: 'import' | 'stocktake' | 'history'; product: StockRow } | null

export default function InventoryPage() {
  const [params, setParams] = useSearchParams()
  const low = params.get('low') === '1'
  const q = params.get('q') ?? ''
  const [search, setSearch] = useState(q)
  const [open, setOpen] = useState<Open>(null)
  const toast = useToast()
  const { data, error, loading, reload } = useAsync((signal) => adminApi.inventory(q, low, signal), [q, low])

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next)
  }

  const finished = (text: string) => {
    setOpen(null)
    toast({ message: text, tone: 'success' })
    reload()
  }

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    update({ q: search.trim() })
  }

  return (
    <>
      <PageHeader title="Tồn kho" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form onSubmit={onSearch} role="search" className="flex min-w-64 flex-1 gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên sản phẩm"
            aria-label="Tìm sản phẩm"
            className={input}
          />
          <button type="submit" className={btn.primary}>
            Tìm
          </button>
        </form>
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <input type="checkbox" checked={low} onChange={(e) => update({ low: e.target.checked ? '1' : '' })} className="size-5 accent-brand-600" />
          Chỉ hàng sắp hết
        </label>
      </div>

      {error ? (
        <ErrorMessage message={error.message} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title={low ? 'Không có sản phẩm nào dưới ngưỡng.' : 'Không tìm thấy sản phẩm.'} />
      ) : (
        <div className={table.wrap} aria-busy={loading}>
          <table className={table.table}>
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
                <tr key={p.id} className={p.lowStock ? 'bg-amber-50' : undefined}>
                  <td className={table.td}>
                    <div className="font-medium text-stone-900">{p.name}</div>
                    <div className="text-xs text-muted">
                      {!p.active && 'Đang ẩn · '}Ngưỡng cảnh báo: {p.lowStockThreshold}
                    </div>
                  </td>
                  <td className={`${table.td} text-right tabular-nums`}>{p.onHand}</td>
                  <td className={`${table.td} text-right tabular-nums`}>{p.reserved}</td>
                  <td className={`${table.td} text-right font-semibold tabular-nums ${p.lowStock ? 'text-amber-900' : ''}`}>
                    {p.available}
                    {p.lowStock && <span className="ml-1.5 rounded bg-amber-200 px-1.5 py-0.5 text-xs">Sắp hết</span>}
                  </td>
                  <td className={`${table.td} text-right`}>
                    <div className="flex justify-end gap-2">
                      <button type="button" className={btn.secondary} onClick={() => setOpen({ kind: 'import', product: p })}>
                        Nhập hàng
                      </button>
                      <button type="button" className={btn.secondary} onClick={() => setOpen({ kind: 'stocktake', product: p })}>
                        Kiểm kê
                      </button>
                      <button type="button" className={btn.secondary} onClick={() => setOpen({ kind: 'history', product: p })}>
                        Lịch sử
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
