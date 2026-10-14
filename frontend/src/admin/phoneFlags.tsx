import { useState } from 'react'
import { ApiError, type Role } from '../lib/api'
import { adminApi, type PhoneFlagLevel, type PhoneFlagView } from '../lib/adminApi'
import { FLAG_LABEL } from './labels'
import { Dialog, Field } from './ui'

/** Warning triangle next to a flagged phone number; the reason is in the tooltip and the accessible name. */
export function FlagIcon({ level, reason }: { level: PhoneFlagLevel; reason: string | null }) {
  const text = `${FLAG_LABEL[level]}${reason ? `: ${reason}` : ''}`
  return (
    <span role="img" aria-label={text} title={text} className={level === 'BLOCK_COD' ? 'text-red-700' : 'text-amber-600'}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="inline size-4 align-[-2px]" fill="currentColor">
        <path d="M8.26 2.9a2 2 0 0 1 3.48 0l6.3 11.1A2 2 0 0 1 16.3 17H3.7a2 2 0 0 1-1.74-3L8.26 2.9ZM10 7a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
      </svg>
    </span>
  )
}

type Choice = PhoneFlagLevel | 'REMOVE'

/**
 * Flag / edit the flag of a phone number. Staff can only add "Cần lưu ý" to a number without a flag; admins can
 * also block COD or remove the flag. A reason is always required (it is shown to the next person handling an
 * order from this number).
 */
export function FlagDialog({
  phone,
  current,
  role,
  intro,
  defaultReason = '',
  onDone,
  onClose,
}: {
  phone: string
  current: PhoneFlagView | null
  role: Role
  intro?: string
  defaultReason?: string
  onDone: (flag: PhoneFlagView | null) => void
  onClose: () => void
}) {
  const admin = role === 'ADMIN'
  const choices: { value: Choice; label: string; hint: string }[] = [
    { value: 'WATCH', label: FLAG_LABEL.WATCH, hint: 'Hiện cảnh báo vàng khi có đơn mới từ số này' },
    ...(admin
      ? [
          { value: 'BLOCK_COD' as const, label: FLAG_LABEL.BLOCK_COD, hint: 'Số này không thể đặt hàng COD nữa' },
          ...(current ? [{ value: 'REMOVE' as const, label: 'Bỏ đánh dấu', hint: 'Xoá cảnh báo cho số này' }] : []),
        ]
      : []),
  ]
  const [choice, setChoice] = useState<Choice>(current?.level ?? 'WATCH')
  const [reason, setReason] = useState(defaultReason)
  const [fieldError, setFieldError] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (!reason.trim()) {
      setFieldError('Vui lòng nhập lý do')
      return
    }
    setPending(true)
    setError(null)
    try {
      if (choice === 'REMOVE') {
        await adminApi.removePhoneFlag(phone, reason.trim())
        onDone(null)
      } else {
        onDone(await adminApi.setPhoneFlag(phone, choice, reason.trim()))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      if (err instanceof ApiError && err.fieldErrors.reason) setFieldError(err.fieldErrors.reason)
      setPending(false)
    }
  }

  return (
    <Dialog
      title={current ? `Sửa đánh dấu ${phone}` : `Đánh dấu số ${phone}`}
      submitLabel={choice === 'REMOVE' ? 'Bỏ đánh dấu' : 'Lưu đánh dấu'}
      tone={choice === 'BLOCK_COD' ? 'danger' : 'primary'}
      onSubmit={submit}
      onClose={onClose}
      pending={pending}
      error={error}
    >
      {intro && <p className="text-sm text-stone-700">{intro}</p>}
      {current && (
        <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-700">
          Hiện tại: <strong>{FLAG_LABEL[current.level]}</strong> — {current.reason}
        </p>
      )}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-stone-700">Mức đánh dấu</legend>
        <div className="space-y-2">
          {choices.map((c) => (
            <label key={c.value} className="flex cursor-pointer gap-3 rounded-xl border border-stone-200 px-3 py-2.5 has-checked:border-brand-500 has-checked:bg-brand-50">
              <input
                type="radio"
                name="flag-level"
                value={c.value}
                checked={choice === c.value}
                onChange={() => setChoice(c.value)}
                className="mt-1 accent-brand-600"
              />
              <span className="text-sm">
                <span className="block font-semibold text-stone-900">{c.label}</span>
                <span className="text-muted">{c.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Lý do" error={fieldError}>
        {(p) => (
          <textarea
            {...p}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setFieldError(undefined)
            }}
            placeholder="VD: Không nhận hàng đơn HL..., không nghe máy"
          />
        )}
      </Field>
    </Dialog>
  )
}
