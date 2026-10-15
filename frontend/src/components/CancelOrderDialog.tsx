import { useId, useState } from 'react'
import type { CustomerCancelInput } from '../lib/api'
import { CANCEL_REASON_LABEL, CUSTOMER_CANCEL_REASONS, type CustomerCancelReasonCode } from '../lib/orderStatus'
import { telHref, useSiteInfo } from '../lib/siteInfo'
import Modal from './Modal'

const MAX_NOTE = 300

/** Reasons where a phone call can fix the order instead of cancelling it. */
const FIXABLE: CustomerCancelReasonCode[] = ['CHANGE_ITEMS', 'CHANGE_ADDRESS']

/**
 * The customer cancels their own order (account page and guest tracking page): one reason out of six, an optional
 * note (required for "Lý do khác"). The caller sends it and returns the updated order; errors are shown here.
 */
export default function CancelOrderDialog({
  code,
  onClose,
  onSubmit,
}: {
  code: string
  onClose: () => void
  onSubmit: (input: CustomerCancelInput) => Promise<void>
}) {
  const [reasonCode, setReasonCode] = useState<CustomerCancelReasonCode | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const noteId = useId()
  const hotline = useSiteInfo()?.business.hotline

  const noteRequired = reasonCode === 'OTHER'
  const trimmed = note.trim()
  const ready = reasonCode !== null && (!noteRequired || trimmed.length > 0) && trimmed.length <= MAX_NOTE

  const submit = async () => {
    if (!reasonCode || !ready) return
    setPending(true)
    setError(null)
    try {
      await onSubmit({ reasonCode, reason: trimmed || undefined })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPending(false)
    }
  }

  return (
    <Modal
      title={`Huỷ đơn ${code}?`}
      submitLabel="Huỷ đơn"
      pendingLabel="Đang huỷ..."
      cancelLabel="Giữ đơn"
      danger
      submitDisabled={!ready}
      onSubmit={submit}
      onClose={onClose}
      pending={pending}
      error={error}
    >
      <p className="text-sm text-stone-600">Thao tác này không hoàn tác được.</p>
      <fieldset>
        <legend className="text-sm font-medium text-stone-800">Lý do huỷ</legend>
        <div className="mt-2 space-y-2">
          {CUSTOMER_CANCEL_REASONS.map((value) => (
            <label key={value} className="flex cursor-pointer items-center gap-3 text-sm text-stone-800">
              <input
                type="radio"
                name="cancel-reason"
                value={value}
                checked={reasonCode === value}
                onChange={() => setReasonCode(value)}
                className="size-4 shrink-0 accent-brand-600"
              />
              {CANCEL_REASON_LABEL[value]}
            </label>
          ))}
        </div>
      </fieldset>
      {reasonCode && FIXABLE.includes(reasonCode) && hotline && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-stone-800" role="note">
          Bạn có thể liên hệ shop để sửa đơn mà không cần huỷ. Hotline:{' '}
          <a href={telHref(hotline)} className="font-semibold text-brand-700 underline">
            {hotline}
          </a>
        </div>
      )}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={noteId} className="text-sm font-medium text-stone-700">
            Ghi chú thêm{noteRequired ? ' (bắt buộc)' : ''}
          </label>
          <span className={`text-xs tabular-nums ${note.length > MAX_NOTE ? 'text-danger' : 'text-muted'}`} aria-live="polite">
            {`${note.length}/${MAX_NOTE}`}
          </span>
        </div>
        <textarea
          id={noteId}
          rows={3}
          maxLength={MAX_NOTE}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required={noteRequired}
          aria-invalid={noteRequired && trimmed.length === 0 && note.length > 0 ? true : undefined}
          className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {noteRequired && trimmed.length === 0 && <p className="mt-1 text-sm text-muted">Vui lòng ghi rõ lý do huỷ đơn.</p>}
      </div>
    </Modal>
  )
}
