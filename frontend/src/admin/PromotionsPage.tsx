import { useMemo, useState } from 'react'
import { ErrorMessage } from '../components/Feedback'
import { useToast } from '../components/Toast'
import {
  promotionApi,
  type BulkPromotionResult,
  type PromotionRow,
  type PromotionStatus,
  type PromotionUsage,
} from '../lib/adminApi'
import { formatPrice, formatPromotionEnd } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { Skeleton } from './Skeleton'
import {
  daysInYear,
  discountPercent,
  salePriceFor,
  vnDay,
  vnDayEndExclusive,
  vnDayStart,
  vnToday,
} from './promotionMath'
import { btn, input, table } from './styles'
import { DateField } from './DateField'
import MoneyInput from './MoneyInput'
import { Dialog, Drawer, EmptyState, Field, PageHeader, Pagination, TableFrame } from './ui'

const TABS: { key: 'running' | 'upcoming' | 'ended'; label: string; statuses: PromotionStatus[] }[] = [
  { key: 'running', label: 'Đang chạy', statuses: ['RUNNING'] },
  { key: 'upcoming', label: 'Sắp tới', statuses: ['UPCOMING'] },
  { key: 'ended', label: 'Đã kết thúc', statuses: ['ENDED', 'CANCELLED'] },
]

const STATUS_LABEL: Record<PromotionStatus, string> = {
  RUNNING: 'Đang chạy',
  UPCOMING: 'Sắp tới',
  ENDED: 'Đã kết thúc',
  CANCELLED: 'Đã huỷ',
}

/** The API returns every promotion: the table shows them this many at a time */
const PAGE_SIZE = 20

const dmy = (day: string) => day.split('-').reverse().join('/')
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

const REMINDER = 'Kiểm tra quy định khuyến mại và thông báo với Sở Công Thương trước khi chạy chương trình.'

/**
 * Yearly promotion days of a product as a small bar; orange close to the limit (80%), red over it. The server counts
 * every promotion of the year that is not cancelled (PromotionService.daysUsed): days already run, the whole period
 * of a running one and upcoming ones; one ended early counts up to the moment it ended.
 */
function DaysUsage({ used, max }: { used: number; max: number }) {
  const over = used > max
  const near = !over && used >= max * 0.8
  return (
    <span className="inline-flex w-full max-w-64 min-w-48 flex-col gap-1">
      <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-stone-200">
        <span
          className={`block h-full rounded-full ${over ? 'bg-red-600' : near ? 'bg-orange-500' : 'bg-brand-500'}`}
          style={{ width: `${Math.min(100, (used / max) * 100)}%` }}
        />
      </span>
      <span className={`text-xs tabular-nums ${over ? 'font-semibold text-danger' : near ? 'font-semibold text-orange-800' : 'text-stone-600'}`}>
        Đã đặt {used}/{max} ngày trong năm (gồm cả ngày sắp chạy){over ? ' · vượt giới hạn' : near ? ' · gần chạm giới hạn' : ''}
      </span>
    </span>
  )
}

// ---- create form --------------------------------------------------------------------------------------------

function CreatePromotion({ usage, onDone, onCancel }: { usage: PromotionUsage; onDone: () => void; onCancel: () => void }) {
  const toast = useToast()
  const today = vnToday()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [mode, setMode] = useState<'percent' | 'price'>('percent')
  const [percent, setPercent] = useState('20')
  const [price, setPrice] = useState<number | null>(null)
  const [first, setFirst] = useState(today)
  const [last, setLast] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<BulkPromotionResult[] | null>(null)

  const products = usage.products.filter((p) => p.active && p.name.toLowerCase().includes(search.trim().toLowerCase()))
  const chosen = usage.products.filter((p) => selected.includes(p.id))
  const pct = Number(percent)
  const fixed = price ?? 0
  const periodOk = first >= today && last >= first
  const year = Number(first.slice(0, 4))

  const preview = chosen.map((p) => {
    const sale = mode === 'percent' ? salePriceFor(p.price, pct) : fixed
    const off = sale > 0 ? discountPercent(p.price, sale) : 0
    const adding = periodOk ? daysInYear(first, last, year) : 0
    const problems: string[] = []
    if (!(sale > 0) || sale % 1000 !== 0) problems.push('Giá phải là bội số của 1.000₫')
    else if (sale >= p.price) problems.push('Không thấp hơn giá gốc')
    else if (off > usage.maxDiscountPercent) problems.push(`Giảm quá ${usage.maxDiscountPercent}%`)
    if (year === usage.year && p.daysUsed + adding > usage.maxDaysPerYear) problems.push(`Vượt ${usage.maxDaysPerYear} ngày/năm`)
    return { p, sale, off, after: year === usage.year ? p.daysUsed + adding : null, problems }
  })

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const submit = async () => {
    setError(null)
    if (chosen.length === 0) return setError('Vui lòng chọn ít nhất một sản phẩm')
    if (!periodOk) return setError('Vui lòng chọn ngày bắt đầu (từ hôm nay) và ngày kết thúc không trước ngày bắt đầu')
    if (mode === 'percent' && !(pct >= 1 && pct <= 99)) return setError('Mức giảm phải từ 1% đến 99%')
    if (mode === 'price' && chosen.length !== 1) return setError('Nhập giá khuyến mại chỉ áp dụng cho một sản phẩm')
    setPending(true)
    try {
      const period = { startsAt: vnDayStart(first), endsAt: vnDayEndExclusive(last) }
      if (mode === 'price') {
        await promotionApi.create({ productId: chosen[0].id, salePrice: fixed, ...period })
        toast({ tone: 'success', message: 'Đã tạo khuyến mại' })
        onDone()
      } else {
        const res = await promotionApi.bulk({ productIds: selected, percentOff: pct, ...period })
        const ok = res.filter((r) => r.ok).length
        toast({ tone: ok === res.length ? 'success' : 'info', message: `Đã tạo ${ok}/${res.length} khuyến mại` })
        if (ok === res.length) onDone()
        else setResults(res)
      }
    } catch (err) {
      setError(message(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Drawer
      title="Tạo khuyến mại"
      onClose={onCancel}
      busy={pending}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-sm text-muted max-sm:hidden">
            {chosen.length > 0 ? `${chosen.length} sản phẩm được chọn` : 'Chưa chọn sản phẩm nào'}
          </p>
          <button type="button" className={btn.secondary} onClick={onCancel} disabled={pending}>
            Huỷ
          </button>
          <button type="button" className={btn.primary} onClick={submit} disabled={pending} aria-busy={pending}>
            {pending ? 'Đang lưu...' : 'Tạo khuyến mại'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="note">
        {REMINDER} Giới hạn: giảm tối đa {usage.maxDiscountPercent}%, tối đa {usage.maxDaysPerYear} ngày khuyến mại mỗi sản
        phẩm trong một năm.
      </p>

      <fieldset>
        <legend className="text-sm font-semibold text-stone-900">
          <span aria-hidden="true">1. </span>Chọn sản phẩm<span aria-hidden="true"> ({selected.length})</span>
        </legend>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm sản phẩm"
          aria-label="Tìm sản phẩm"
          className={`${input} mt-2`}
        />
        <div className="mt-2 flex min-h-8 items-center justify-between gap-3 text-sm">
          <span className="text-stone-700" aria-live="polite">
            Đã chọn <strong className="tabular-nums">{selected.length}</strong> sản phẩm
          </span>
          {selected.length > 0 && (
            <button type="button" className={btn.link} onClick={() => setSelected([])}>
              Bỏ chọn tất cả
            </button>
          )}
        </div>
        <ul className="mt-2 max-h-64 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200">
          {products.map((p) => (
            <li key={p.id}>
              {/* The whole row toggles; the name is the checkbox's name, price and days describe it */}
              <label
                htmlFor={`promo-product-${p.id}`}
                className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-stone-50"
              >
                <input
                  id={`promo-product-${p.id}`}
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  aria-labelledby={`promo-product-${p.id}-name`}
                  aria-describedby={`promo-product-${p.id}-info`}
                  className="size-4 accent-brand-600"
                />
                <span id={`promo-product-${p.id}-name`} className="min-w-0 flex-1 font-medium text-stone-900">
                  {p.name}
                </span>
                <span id={`promo-product-${p.id}-info`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="tabular-nums text-stone-700">{formatPrice(p.price)}</span>
                  {p.runningSalePrice != null && <span className="text-xs text-red-700">Đang KM {formatPrice(p.runningSalePrice)}</span>}
                  <DaysUsage used={p.daysUsed} max={usage.maxDaysPerYear} />
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-stone-900">2. Mức giảm và thời gian</legend>
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="sr-only">Cách tính giá khuyến mại</legend>
          <label htmlFor="promo-mode-percent" className="mr-6 inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              id="promo-mode-percent"
              type="radio"
              name="mode"
              value="percent"
              checked={mode === 'percent'}
              onChange={() => setMode('percent')}
              className="accent-brand-600"
            />
            Giảm theo %
          </label>
          <label htmlFor="promo-mode-price" className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              id="promo-mode-price"
              type="radio"
              name="mode"
              value="price"
              checked={mode === 'price'}
              onChange={() => setMode('price')}
              className="accent-brand-600"
            />
            Nhập giá khuyến mại (một sản phẩm)
          </label>
        </fieldset>
        {mode === 'percent' ? (
          <Field label="Giảm (%)" requiredMark hint="Giá mới làm tròn xuống bội số 1.000₫">
            {(p) => <input {...p} inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} />}
          </Field>
        ) : (
          <Field label="Giá khuyến mại (₫)" requiredMark hint="Bội số của 1.000₫, thấp hơn giá gốc">
            {(p) => <MoneyInput {...p} value={price} onChange={setPrice} />}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <DateField label="Từ ngày" requiredMark min={today} value={first} onChange={setFirst} />
          <DateField label="Đến hết ngày" requiredMark min={first || today} value={last} onChange={setLast} />
        </div>
      </fieldset>

      {preview.length > 0 && (
        <TableFrame>
          <table className={table.table}>
            <caption className="px-4 pt-3 text-left text-sm font-semibold text-stone-900">3. Xem trước giá mới</caption>
            <thead>
              <tr>
                <th className={table.thStatic}>Sản phẩm</th>
                <th className={`${table.thStatic} text-right`}>Giá gốc</th>
                <th className={`${table.thStatic} text-right`}>Giá khuyến mại</th>
                <th className={table.thStatic}>Ngày KM trong năm sau khi tạo</th>
              </tr>
            </thead>
            <tbody>
              {preview.map(({ p, sale, off, after, problems }) => (
                <tr key={p.id} className={problems.length ? 'bg-red-50' : undefined}>
                  <td className={table.td}>
                    {p.name}
                    {problems.length > 0 && <p className="text-xs font-semibold text-danger">{problems.join(' · ')}</p>}
                  </td>
                  <td className={`${table.td} text-right tabular-nums`}>{formatPrice(p.price)}</td>
                  <td className={`${table.td} text-right font-semibold tabular-nums`}>
                    {sale > 0 ? `${formatPrice(sale)} (-${off}%)` : '—'}
                  </td>
                  <td className={table.td}>{after != null ? <DaysUsage used={after} max={usage.maxDaysPerYear} /> : 'Năm khác'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}

      {results && (
        <ul className="space-y-1 rounded-xl border border-stone-200 p-4 text-sm" aria-label="Kết quả">
          {results.map((r) => (
            <li key={r.productId} className={r.ok ? 'text-success' : 'text-danger'}>
              {r.ok ? '✓' : '✗'} {r.productName}: {r.ok ? `${formatPrice(r.salePrice!)}` : r.message}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      </div>
    </Drawer>
  )
}

// ---- edit / end ---------------------------------------------------------------------------------------------

function EditDialog({ row, onClose, onDone }: { row: PromotionRow; onClose: () => void; onDone: () => void }) {
  const [price, setPrice] = useState<number | null>(row.salePrice)
  const [first, setFirst] = useState(vnDay(row.startsAt))
  const [last, setLast] = useState(vnDay(row.endsAt, true))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sale = price ?? 0

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      await promotionApi.update(row.id, {
        productId: row.productId,
        salePrice: sale,
        startsAt: vnDayStart(first),
        endsAt: vnDayEndExclusive(last),
      })
      onDone()
    } catch (err) {
      setError(message(err))
      setPending(false)
    }
  }

  return (
    <Dialog title={`Sửa khuyến mại: ${row.productName}`} submitLabel="Lưu" onSubmit={submit} onClose={onClose} pending={pending} error={error}>
      <p className="text-sm text-stone-600">
        Giá gốc hiện tại: <strong className="tabular-nums">{formatPrice(row.regularPrice)}</strong>
        {sale > 0 && sale < row.regularPrice && <> · giảm {discountPercent(row.regularPrice, sale)}%</>}
      </p>
      <Field label="Giá khuyến mại (₫)" requiredMark>{(p) => <MoneyInput {...p} value={price} onChange={setPrice} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Từ ngày" requiredMark value={first} onChange={setFirst} />
        <DateField label="Đến hết ngày" requiredMark min={first || undefined} value={last} onChange={setLast} />
      </div>
      <p className="text-xs text-muted">{REMINDER}</p>
    </Dialog>
  )
}

function EndDialog({ row, onClose, onDone }: { row: PromotionRow; onClose: () => void; onDone: () => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = row.status === 'RUNNING'
  const submit = async () => {
    setPending(true)
    try {
      await promotionApi.end(row.id)
      onDone()
    } catch (err) {
      setError(message(err))
      setPending(false)
    }
  }
  return (
    <Dialog
      title={running ? `Kết thúc sớm khuyến mại "${row.productName}"?` : `Huỷ khuyến mại sắp tới "${row.productName}"?`}
      submitLabel={running ? 'Kết thúc ngay' : 'Huỷ khuyến mại'}
      tone="danger"
      onSubmit={submit}
      onClose={onClose}
      pending={pending}
      error={error}
    >
      <p className="text-sm text-stone-600">
        {running
          ? `Giá trở về ${formatPrice(row.regularPrice)} ngay lập tức. Giỏ hàng đang có sản phẩm này sẽ báo đổi giá.`
          : 'Khuyến mại sẽ không được áp dụng.'}
      </p>
    </Dialog>
  )
}

// ---- page ---------------------------------------------------------------------------------------------------

export default function PromotionsPage() {
  const toast = useToast()
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('running')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PromotionRow | null>(null)
  const [ending, setEnding] = useState<PromotionRow | null>(null)
  const list = useAsync((signal) => promotionApi.list(signal), [])
  const usage = useAsync((signal) => promotionApi.usage(undefined, signal), [])
  const reload = () => {
    list.reload()
    usage.reload()
  }

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, (list.data ?? []).filter((r) => t.statuses.includes(r.status)).length])),
    [list.data],
  )
  const rows = (list.data ?? []).filter((r) => TABS.find((t) => t.key === tab)!.statuses.includes(r.status))
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  // A reload can leave fewer pages than the one shown
  const shownPage = Math.min(page, Math.max(0, totalPages - 1))
  const maxDays = usage.data?.maxDaysPerYear ?? 120

  return (
    <>
      <PageHeader title="Khuyến mại">
        {!creating && (
          <button type="button" className={btn.primary} onClick={() => setCreating(true)} disabled={!usage.data}>
            + Tạo khuyến mại
          </button>
        )}
      </PageHeader>
      {creating && usage.data && (
        <CreatePromotion
          usage={usage.data}
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            reload()
          }}
        />
      )}

      <div className="mb-4 flex gap-2 overflow-x-auto" role="group" aria-label="Lọc khuyến mại">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => {
              setTab(t.key)
              setPage(0)
            }}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${
              tab === t.key ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'
            }`}
          >
            {t.label} ({counts[t.key] ?? 0})
          </button>
        ))}
      </div>

      {list.error ? (
        <ErrorMessage message={list.error.message} onRetry={reload} />
      ) : !list.data ? (
        <Skeleton variant="table" />
      ) : rows.length === 0 ? (
        <EmptyState title="Không có khuyến mại nào." />
      ) : (
        <>
        <TableFrame>
          <table className={table.table}>
            <thead>
              <tr>
                <th className={table.th}>Sản phẩm</th>
                <th className={`${table.th} text-right`}>Giá</th>
                <th className={table.th}>Thời gian</th>
                <th className={table.th}>Ngày KM năm nay</th>
                <th className={table.th}>
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE).map((r) => (
                <tr key={r.id}>
                  <td className={table.td}>
                    <div className="max-w-72 truncate font-medium text-stone-900" title={r.productName}>
                      {r.productName}
                    </div>
                    <div className="text-xs text-muted">{STATUS_LABEL[r.status]}</div>
                  </td>
                  <td className={`${table.td} text-right tabular-nums`}>
                    <div className="font-semibold text-red-700">{formatPrice(r.salePrice)}</div>
                    <div className="text-xs text-muted">
                      <s>{formatPrice(r.regularPrice)}</s> · -{r.discountPercent}%
                    </div>
                  </td>
                  <td className={`${table.td} whitespace-nowrap`}>
                    {dmy(vnDay(r.startsAt))} – {formatPromotionEnd(r.endsAt, { prefix: false })}
                  </td>
                  <td className={table.td}>
                    <DaysUsage used={r.productDaysThisYear} max={maxDays} />
                  </td>
                  <td className={`${table.td} text-right`}>
                    <div className="flex justify-end gap-2">
                      {r.status === 'UPCOMING' && (
                        <button type="button" className={btn.secondary} onClick={() => setEditing(r)}>
                          Sửa
                        </button>
                      )}
                      {(r.status === 'RUNNING' || r.status === 'UPCOMING') && (
                        <button type="button" className={btn.secondary} onClick={() => setEnding(r)}>
                          {r.status === 'RUNNING' ? 'Kết thúc sớm' : 'Huỷ'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
        <Pagination page={shownPage} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {editing && (
        <EditDialog
          row={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null)
            toast({ tone: 'success', message: 'Đã lưu khuyến mại' })
            reload()
          }}
        />
      )}
      {ending && (
        <EndDialog
          row={ending}
          onClose={() => setEnding(null)}
          onDone={() => {
            toast({ tone: 'success', message: ending.status === 'RUNNING' ? 'Đã kết thúc khuyến mại' : 'Đã huỷ khuyến mại' })
            setEnding(null)
            reload()
          }}
        />
      )}
    </>
  )
}

