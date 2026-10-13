import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import OrderDetails from '../components/OrderDetails'
import { useToast } from '../components/Toast'
import { ApiError } from '../lib/api'
import { adminApi, type AdminOrderDetail, type OrderAction } from '../lib/adminApi'
import { formatDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import NotFoundPage from '../pages/NotFoundPage'
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

export function CancelDialog({
  code,
  onDone,
  onClose,
}: {
  code: string
  onDone: (d: AdminOrderDetail) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (!reason.trim()) {
      setFieldError('Vui lòng nhập lý do huỷ đơn')
      return
    }
    setPending(true)
    setError(null)
    try {
      onDone(await adminApi.cancel(code, reason.trim()))
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
        Hàng đang giữ cho đơn sẽ được trả lại kho. Khách nhận email thông báo kèm lý do bên dưới.
      </p>
      <Field label="Lý do huỷ (gửi cho khách)" error={fieldError}>
        {(p) => (
          <textarea
            {...p}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setFieldError(undefined)
            }}
            autoFocus
          />
        )}
      </Field>
    </Dialog>
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
              <p className="whitespace-pre-line text-stone-800">{n.body}</p>
              <p className="mt-1 text-xs text-muted">
                {n.authorName} · {formatDateTime(n.createdAt)}
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

export default function OrderDetailPage() {
  const { code = '' } = useParams()
  const toast = useToast()
  const { data, error, reload } = useAsync((signal) => adminApi.order(code, signal), [code])
  // Latest server response after an action (newer than `data` until the next reload)
  const [updated, setUpdated] = useState<AdminOrderDetail | null>(null)
  const [open, setOpen] = useState<'ship' | 'cancel' | null>(null)
  const [busy, setBusy] = useState(false)

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
  if (error) return <ErrorMessage message={error.message} onRetry={reload} />
  const detail = updated?.order.code === code ? updated : data
  if (!detail) return <Spinner />

  const done = (next: AdminOrderDetail, text: string) => {
    setUpdated(next)
    setOpen(null)
    toast({ message: text, tone: 'success' })
  }

  /** Confirm/Complete: one request at a time; if someone else changed the order, show why and reload. */
  const run = async (action: () => Promise<AdminOrderDetail>, text: string) => {
    if (busy) return
    setBusy(true)
    try {
      done(await action(), text)
    } catch (err) {
      toast({ message: message(err), tone: 'error' })
      setUpdated(null)
      reload()
    } finally {
      setBusy(false)
    }
  }

  const can = (a: OrderAction) => detail.allowedActions.includes(a)
  const actions = detail.allowedActions.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {can('CONFIRM') && (
        <button type="button" className={btn.primary} disabled={busy} onClick={() => run(() => adminApi.confirm(code), 'Đã xác nhận đơn')}>
          Xác nhận đơn
        </button>
      )}
      {can('SHIP') && (
        <button type="button" className={btn.primary} disabled={busy} onClick={() => setOpen('ship')}>
          Giao cho vận chuyển
        </button>
      )}
      {can('COMPLETE') && (
        <button
          type="button"
          className={btn.primary}
          disabled={busy}
          onClick={() => run(() => adminApi.complete(code), 'Đã đánh dấu giao thành công')}
        >
          Giao thành công
        </button>
      )}
      {can('CANCEL') && (
        <button type="button" className={btn.secondary} disabled={busy} onClick={() => setOpen('cancel')}>
          Huỷ đơn
        </button>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/admin/don-hang" className="text-sm text-stone-600 hover:text-brand-700">
        ← Danh sách đơn hàng
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <OrderDetails order={detail.order} actions={actions || undefined} />
        <div className="space-y-6">
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
                  <dd className="inline font-mono font-medium">{detail.trackingNumber}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-stone-600">Chưa giao cho đơn vị vận chuyển.</p>
            )}
            <p className="mt-3 text-muted">{detail.guest ? 'Khách vãng lai (không đăng nhập)' : 'Khách có tài khoản'}</p>
          </section>
          <Notes detail={detail} onChange={setUpdated} />
        </div>
      </div>

      {open === 'ship' && (
        <ShipDialog code={code} onClose={() => setOpen(null)} onDone={(d) => done(d, 'Đã chuyển sang Đang giao')} />
      )}
      {open === 'cancel' && (
        <CancelDialog code={code} onClose={() => setOpen(null)} onDone={(d) => done(d, 'Đã huỷ đơn')} />
      )}
    </div>
  )
}
