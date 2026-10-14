import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { ErrorMessage, Spinner } from '../components/Feedback'
import OrderDetails from '../components/OrderDetails'
import { useToast } from '../components/Toast'
import { ApiError, type OrderStatus, type Role } from '../lib/api'
import { adminApi, type AdminOrderDetail, type ContactResult, type OrderAction, type PhoneFlagView } from '../lib/adminApi'
import { formatAdminDateTime } from '../lib/format'
import { CANCEL_REASON_LABEL, type CancelReasonCode } from '../lib/orderStatus'
import { useAsync } from '../lib/useAsync'
import NotFoundPage from '../pages/NotFoundPage'
import { FLAG_LABEL } from './labels'
import { FlagDialog } from './phoneFlags'
import { btn, card, input } from './styles'
import { Dialog, Field } from './ui'

const CARRIERS = ['Giao Hàng Nhanh', 'Giao Hàng Tiết Kiệm', 'Viettel Post', 'J&T Express', 'VNPost', 'Shopee Express']

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

function ShipDialog({ code, onDone, onClose }: { code: string; onDone: (d: AdminOrderDetail) => void; onClose: () => void }) {
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    const next: Record<string, string> = {}
    if (!carrier.trim()) next.carrier = 'Vui lòng nhập đơn vị vận chuyển'
    if (!tracking.trim()) next.trackingNumber = 'Vui lòng nhập mã vận đơn'
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    setError(null)
    try {
      onDone(await adminApi.ship(code, carrier.trim(), tracking.trim()))
    } catch (err) {
      setError(message(err))
      if (err instanceof ApiError) setErrors(err.fieldErrors)
      setPending(false)
    }
  }

  return (
    <Dialog
      title={`Giao đơn ${code}`}
      submitLabel="Đã giao cho vận chuyển"
      onSubmit={submit}
      onClose={onClose}
      pending={pending}
      error={error}
    >
      <p className="text-sm text-stone-600">Tồn kho sẽ được trừ và khách nhận email kèm mã vận đơn.</p>
      <Field label="Đơn vị vận chuyển" error={errors.carrier}>
        {(p) => (
          <input {...p} value={carrier} onChange={(e) => setCarrier(e.target.value)} list="carriers" maxLength={100} autoFocus />
        )}
      </Field>
      <datalist id="carriers">
        {CARRIERS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Field label="Mã vận đơn" error={errors.trackingNumber}>
        {(p) => <input {...p} value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={100} />}
      </Field>
    </Dialog>
  )
}

const CONTACTS: { value: ContactResult; label: string }[] = [
  { value: 'CALLED', label: 'Đã gọi điện cho khách' },
  { value: 'ZALO', label: 'Đã nhắn Zalo cho khách' },
  { value: 'UNREACHABLE', label: 'Chưa liên hệ được' },
]

/** Confirming a COD order means the customer was reached; "Chưa liên hệ được" only records the attempt. */
export function ConfirmDialog({
  code,
  onDone,
  onClose,
}: {
  code: string
  onDone: (d: AdminOrderDetail, contact: ContactResult) => void
  onClose: () => void
}) {
  const [contact, setContact] = useState<ContactResult>('CALLED')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      onDone(await adminApi.confirm(code, contact, note.trim()), contact)
    } catch (err) {
      setError(message(err))
      setPending(false)
    }
  }

  return (
    <Dialog
      title={`Xác nhận đơn ${code}`}
      submitLabel={contact === 'UNREACHABLE' ? 'Lưu, chưa xác nhận' : 'Xác nhận đơn'}
      onSubmit={submit}
      onClose={onClose}
      pending={pending}
      error={error}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-stone-700">Kết quả liên hệ khách</legend>
        <div className="space-y-2">
          {CONTACTS.map((c) => (
            <label
              key={c.value}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5 text-sm has-checked:border-brand-500 has-checked:bg-brand-50"
            >
              <input
                type="radio"
                name="contact"
                value={c.value}
                checked={contact === c.value}
                onChange={() => setContact(c.value)}
                className="accent-brand-600"
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      {contact === 'UNREACHABLE' && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Đơn vẫn ở trạng thái Chờ xác nhận. Lần liên hệ này được ghi vào ghi chú nội bộ.
        </p>
      )}
      <Field label="Ghi chú (không bắt buộc)">
        {(p) => (
          <textarea
            {...p}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="VD: Khách hẹn giao sau 17h"
          />
        )}
      </Field>
    </Dialog>
  )
}

/**
 * Cancel with a reason code (for statistics) and a text sent to the customer. An order already handed to the
 * carrier can only be cancelled because the customer refused it: the goods come back to stock.
 */
export function CancelDialog({
  code,
  status,
  onDone,
  onClose,
}: {
  code: string
  status: OrderStatus
  onDone: (d: AdminOrderDetail, reasonCode: CancelReasonCode) => void
  onClose: () => void
}) {
  const shipping = status === 'SHIPPING'
  const codes: CancelReasonCode[] = shipping
    ? ['REFUSED_DELIVERY']
    : ['CUSTOMER_REQUEST', 'OUT_OF_STOCK', 'UNREACHABLE', 'OTHER']
  const [reasonCode, setReasonCode] = useState<CancelReasonCode | ''>(shipping ? 'REFUSED_DELIVERY' : '')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ reasonCode?: string; reason?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    const next: typeof errors = {}
    if (!reasonCode) next.reasonCode = 'Vui lòng chọn lý do huỷ đơn'
    if (!reason.trim()) next.reason = 'Vui lòng nhập lý do huỷ đơn'
    setErrors(next)
    if (!reasonCode || next.reason) return
    setPending(true)
    setError(null)
    try {
      onDone(await adminApi.cancel(code, reasonCode, reason.trim()), reasonCode)
    } catch (err) {
      setError(message(err))
      setPending(false)
    }
  }

  return (
    <Dialog
      title={`Huỷ đơn ${code}?`}
      tone="danger"
      submitLabel="Huỷ đơn"
      onSubmit={submit}
      onClose={onClose}
      pending={pending}
      error={error}
    >
      <p className="text-sm text-stone-600">
        {shipping
          ? 'Hàng hoàn về sẽ được cộng lại vào kho. Khách nhận email thông báo kèm lý do bên dưới.'
          : 'Hàng đang giữ cho đơn sẽ được trả lại kho. Khách nhận email thông báo kèm lý do bên dưới.'}
      </p>
      <Field label="Nhóm lý do" error={errors.reasonCode}>
        {(p) => (
          <select
            {...p}
            value={reasonCode}
            onChange={(e) => {
              setReasonCode(e.target.value as CancelReasonCode)
              setErrors((x) => ({ ...x, reasonCode: undefined }))
            }}
            disabled={shipping}
          >
            {!shipping && <option value="">— Chọn lý do —</option>}
            {codes.map((c) => (
              <option key={c} value={c}>
                {CANCEL_REASON_LABEL[c]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Lý do huỷ (gửi cho khách)" error={errors.reason}>
        {(p) => (
          <textarea
            {...p}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setErrors((x) => ({ ...x, reason: undefined }))
            }}
          />
        )}
      </Field>
    </Dialog>
  )
}

/** Copies with the Clipboard API, falling back to a hidden textarea (older browsers, plain http). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the fallback
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

const contactBtn =
  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'

/** Who ordered: one-tap contact, the number's order history and its flag. */
function CustomerBlock({
  detail,
  role,
  version,
  onEditFlag,
}: {
  detail: AdminOrderDetail
  role: Role
  version: number
  onEditFlag: (current: PhoneFlagView | null) => void
}) {
  const { order } = detail
  const toast = useToast()
  const { data: stats, error } = useAsync(
    (signal) => adminApi.customerStats(order.phone, order.code, signal),
    [order.phone, order.code, version],
  )
  const flag = stats?.flag ?? null
  const canEdit = role === 'ADMIN' || !flag

  const copy = async () => {
    const ok = await copyText(order.phone)
    toast(ok ? { message: 'Đã sao chép', tone: 'success', duration: 2000 } : { message: 'Không sao chép được', tone: 'error' })
  }

  return (
    <section className={`${card} p-5 text-sm`} aria-labelledby="customer-title">
      <h2 id="customer-title" className="font-bold text-stone-900">
        Khách hàng
      </h2>
      <p className="mt-2 font-medium break-words text-stone-900">{order.customerName}</p>
      <p className="text-lg font-semibold tracking-wide text-stone-900 tabular-nums">{order.phone}</p>
      <p className="text-muted">{detail.guest ? 'Khách vãng lai (không đăng nhập)' : 'Khách có tài khoản'}</p>

      <div className="mt-3 flex gap-2">
        <a href={`tel:${order.phone}`} className={contactBtn}>
          Gọi
        </a>
        <a href={`https://zalo.me/${order.phone}`} target="_blank" rel="noopener noreferrer" className={contactBtn}>
          Zalo
          <span className="sr-only"> (mở tab mới)</span>
        </a>
        <button type="button" onClick={copy} className={contactBtn}>
          Sao chép
        </button>
      </div>

      <div className="mt-4 border-t border-stone-100 pt-3" aria-live="polite">
        {error ? (
          <p className="text-muted">Không tải được lịch sử khách.</p>
        ) : !stats ? (
          <p className="text-muted">Đang tải lịch sử khách...</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {stats.previousOrders === 0 && (
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">Khách mới</span>
              )}
              {flag?.level === 'BLOCK_COD' ? (
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">⚠ {FLAG_LABEL.BLOCK_COD}</span>
              ) : (
                (flag?.level === 'WATCH' || stats.refusedDelivery > 0) && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">⚠ {FLAG_LABEL.WATCH}</span>
                )
              )}
            </div>
            {flag && (
              <p
                className={`mt-2 rounded-xl px-3 py-2 ${flag.level === 'BLOCK_COD' ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'}`}
              >
                {flag.reason}
                {flag.updatedByName && <span className="block text-xs opacity-80">— {flag.updatedByName}, {formatAdminDateTime(flag.updatedAt)}</span>}
              </p>
            )}
            {stats.previousOrders > 0 && (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                <dt className="text-muted">Đơn trước đây</dt>
                <dd className="text-right font-medium tabular-nums">{stats.previousOrders}</dd>
                <dt className="text-muted">Hoàn tất</dt>
                <dd className="text-right font-medium tabular-nums">{stats.completed}</dd>
                <dt className="text-muted">Đã huỷ</dt>
                <dd className="text-right font-medium tabular-nums">{stats.cancelled}</dd>
                <dt className="text-muted">Không nhận hàng</dt>
                <dd className={`text-right font-medium tabular-nums ${stats.refusedDelivery > 0 ? 'text-danger' : ''}`}>
                  {stats.refusedDelivery}
                </dd>
                {stats.firstOrderAt && (
                  <>
                    <dt className="text-muted">Đơn đầu tiên</dt>
                    <dd className="text-right tabular-nums">{formatAdminDateTime(stats.firstOrderAt).slice(0, 10)}</dd>
                  </>
                )}
              </dl>
            )}
            {canEdit && (
              <button type="button" className={`${btn.link} mt-3`} onClick={() => onEditFlag(flag)}>
                {flag ? 'Sửa đánh dấu' : 'Đánh dấu số điện thoại'}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function Notes({ detail, onChange }: { detail: AdminOrderDetail; onChange: (d: AdminOrderDetail) => void }) {
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim() || pending) return
    setPending(true)
    setError(null)
    try {
      onChange(await adminApi.addNote(detail.order.code, body.trim()))
      setBody('')
    } catch (err) {
      setError(message(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className={`${card} p-5`} aria-labelledby="notes-title">
      <h2 id="notes-title" className="font-bold text-stone-900">
        Ghi chú nội bộ
      </h2>
      <p className="text-sm text-muted">Chỉ nhân viên thấy, khách hàng không thấy.</p>
      {detail.notes.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600">Chưa có ghi chú.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {detail.notes.map((n) => (
            <li key={n.createdAt + n.body} className="rounded-xl bg-stone-50 px-4 py-3 text-sm">
              <p className="whitespace-pre-line break-words text-stone-800">{n.body}</p>
              <p className="mt-1 text-xs text-muted">
                {n.authorName} · {formatAdminDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
        <label htmlFor="new-note" className="sr-only">
          Thêm ghi chú
        </label>
        <textarea
          id="new-note"
          rows={2}
          maxLength={1000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="VD: Khách hẹn giao sau 17h"
          className={input}
        />
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={`${btn.secondary} self-end`} disabled={pending || !body.trim()}>
          {pending ? 'Đang lưu...' : 'Thêm ghi chú'}
        </button>
      </form>
    </section>
  )
}

type Open =
  | { kind: 'confirm' | 'ship' | 'cancel' }
  | { kind: 'flag'; current: PhoneFlagView | null; intro?: string; defaultReason?: string }

export default function OrderDetailPage() {
  const { code = '' } = useParams()
  const toast = useToast()
  const { user } = useAuth()
  const role = user?.role ?? 'STAFF'
  const { data, error, reload } = useAsync((signal) => adminApi.order(code, signal), [code])
  // Latest server response after an action (newer than `data` until the next reload)
  const [updated, setUpdated] = useState<AdminOrderDetail | null>(null)
  const [open, setOpen] = useState<Open | null>(null)
  const [busy, setBusy] = useState(false)
  // Bumped after anything that changes the customer's stats or flag
  const [statsVersion, setStatsVersion] = useState(0)

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
  if (error) return <ErrorMessage message={error.message} onRetry={reload} />
  const detail = updated?.order.code === code ? updated : data
  if (!detail) return <Spinner />

  const done = (next: AdminOrderDetail, text: string) => {
    setUpdated(next)
    setOpen(null)
    setStatsVersion((v) => v + 1)
    toast({ message: text, tone: 'success' })
  }

  const complete = async () => {
    if (busy) return
    setBusy(true)
    try {
      done(await adminApi.complete(code), 'Đã đánh dấu giao thành công')
    } catch (err) {
      // Someone else changed the order: show why and reload
      toast({ message: message(err), tone: 'error' })
      setUpdated(null)
      reload()
    } finally {
      setBusy(false)
    }
  }

  const can = (a: OrderAction) => detail.allowedActions.includes(a)
  const hasActions = detail.allowedActions.length > 0
  const buttons = (
    <>
      {can('CONFIRM') && (
        <button type="button" className={`${btn.primary} flex-1 sm:flex-none`} onClick={() => setOpen({ kind: 'confirm' })}>
          Xác nhận đơn
        </button>
      )}
      {can('SHIP') && (
        <button type="button" className={`${btn.primary} flex-1 sm:flex-none`} onClick={() => setOpen({ kind: 'ship' })}>
          Giao cho vận chuyển
        </button>
      )}
      {can('COMPLETE') && (
        <button type="button" className={`${btn.primary} flex-1 sm:flex-none`} disabled={busy} onClick={complete}>
          Giao thành công
        </button>
      )}
      {can('CANCEL') && (
        <button type="button" className={`${btn.secondary} flex-1 sm:flex-none`} onClick={() => setOpen({ kind: 'cancel' })}>
          {detail.order.status === 'SHIPPING' ? 'Khách không nhận' : 'Huỷ đơn'}
        </button>
      )}
    </>
  )

  return (
    <div className={`mx-auto max-w-5xl ${hasActions ? 'pb-24 lg:pb-0' : ''}`}>
      <Link to="/admin/don-hang" className="text-sm text-stone-600 hover:text-brand-700">
        ← Danh sách đơn hàng
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <OrderDetails
            order={detail.order}
            actions={hasActions ? <div className="hidden flex-wrap gap-2 lg:flex">{buttons}</div> : undefined}
          />
        </div>
        <div className="min-w-0 space-y-6">
          <CustomerBlock
            detail={detail}
            role={role}
            version={statsVersion}
            onEditFlag={(current) => setOpen({ kind: 'flag', current })}
          />
          <section className={`${card} p-5 text-sm`} aria-labelledby="ship-title">
            <h2 id="ship-title" className="font-bold text-stone-900">
              Vận chuyển
            </h2>
            {detail.carrier ? (
              <dl className="mt-2 space-y-1">
                <div>
                  <dt className="inline text-muted">Đơn vị: </dt>
                  <dd className="inline font-medium">{detail.carrier}</dd>
                </div>
                <div>
                  <dt className="inline text-muted">Mã vận đơn: </dt>
                  <dd className="inline font-mono font-medium break-all">{detail.trackingNumber}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-stone-600">Chưa giao cho đơn vị vận chuyển.</p>
            )}
            {detail.cancelReasonCode && (
              <p className="mt-3 text-stone-700">
                Lý do huỷ: <strong>{CANCEL_REASON_LABEL[detail.cancelReasonCode]}</strong>
              </p>
            )}
          </section>
          <Notes detail={detail} onChange={setUpdated} />
        </div>
      </div>

      {hasActions && (
        <div role="toolbar" aria-label="Thao tác đơn hàng" className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgb(0_0_0/0.06)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-5xl gap-2">{buttons}</div>
        </div>
      )}

      {open?.kind === 'confirm' && (
        <ConfirmDialog
          code={code}
          onClose={() => setOpen(null)}
          onDone={(d, contact) =>
            done(d, contact === 'UNREACHABLE' ? 'Đã ghi nhận: chưa liên hệ được khách' : 'Đã xác nhận đơn')
          }
        />
      )}
      {open?.kind === 'ship' && (
        <ShipDialog code={code} onClose={() => setOpen(null)} onDone={(d) => done(d, 'Đã chuyển sang Đang giao')} />
      )}
      {open?.kind === 'cancel' && (
        <CancelDialog
          code={code}
          status={detail.order.status}
          onClose={() => setOpen(null)}
          onDone={(d, reasonCode) => {
            done(d, 'Đã huỷ đơn')
            // Refused at the door: offer to flag the number right away
            if (reasonCode === 'REFUSED_DELIVERY') {
              adminApi.customerStats(detail.order.phone, code).then(
                (s) => {
                  if (s.flag?.level === 'BLOCK_COD' || (s.flag && role !== 'ADMIN')) return
                  setOpen({
                    kind: 'flag',
                    current: s.flag,
                    intro: 'Khách vừa không nhận hàng. Đánh dấu số điện thoại này?',
                    defaultReason: `Không nhận hàng đơn ${code}`,
                  })
                },
                () => {},
              )
            }
          }}
        />
      )}
      {open?.kind === 'flag' && (
        <FlagDialog
          phone={detail.order.phone}
          current={open.current}
          role={role}
          intro={open.intro}
          defaultReason={open.defaultReason}
          onClose={() => setOpen(null)}
          onDone={(flag) => {
            setOpen(null)
            setStatsVersion((v) => v + 1)
            toast({ message: flag ? 'Đã lưu đánh dấu' : 'Đã bỏ đánh dấu', tone: 'success' })
          }}
        />
      )}
    </div>
  )
}
