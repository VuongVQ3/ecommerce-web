import { useState } from 'react'
import { isPersonName, NAME_ERROR } from '../auth/schemas'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { ApiError, type Role } from '../lib/api'
import { userApi, type AdminUserRow } from '../lib/adminApi'
import { ROLE_LABEL, ROLE_STYLE } from './labels'
import { ActionMenu, Dialog, Field } from './ui'

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${ROLE_STYLE[role]}`}>{ROLE_LABEL[role]}</span>
}

export function AccountStatus({ user }: { user: AdminUserRow }) {
  if (!user.active) return <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-red-800">Đã khoá</span>
  if (user.invitationPending)
    return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-amber-900">Chờ nhận lời mời</span>
  return <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-brand-800">Hoạt động</span>
}

/** Every change to an account needs a reason: it goes to the audit log. */
function ReasonDialog({
  title,
  description,
  submitLabel,
  tone,
  run,
  onDone,
  onClose,
}: {
  title: string
  description: string
  submitLabel: string
  tone?: 'primary' | 'danger'
  run: (reason: string) => Promise<AdminUserRow>
  onDone: (u: AdminUserRow) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
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
      onDone(await run(reason.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPending(false)
    }
  }

  return (
    <Dialog title={title} submitLabel={submitLabel} tone={tone} onSubmit={submit} onClose={onClose} pending={pending} error={error}>
      <p className="text-sm text-stone-600">{description}</p>
      <Field label="Lý do (ghi vào nhật ký)" requiredMark error={fieldError}>
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
            autoFocus
          />
        )}
      </Field>
    </Dialog>
  )
}

/**
 * Role change (customer ↔ staff only; admins come from ADMIN_EMAIL) and lock/unlock. Nothing is offered on the
 * signed-in admin's own account.
 */
export function UserActions({
  user,
  onChanged,
  extra = [],
}: {
  user: AdminUserRow
  onChanged: (u: AdminUserRow) => void
  extra?: { label: string; onSelect: () => void }[]
}) {
  const { user: me } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState<'role' | 'active' | null>(null)
  const self = me?.id === user.id
  const nextRole: Role | null = user.role === 'CUSTOMER' ? 'STAFF' : user.role === 'STAFF' ? 'CUSTOMER' : null

  const items = [
    ...extra,
    ...(!self && nextRole
      ? [{ label: nextRole === 'STAFF' ? 'Chuyển thành Nhân viên' : 'Chuyển thành Khách hàng', onSelect: () => setOpen('role') }]
      : []),
    ...(!self ? [{ label: user.active ? 'Khoá tài khoản' : 'Mở khoá tài khoản', onSelect: () => setOpen('active'), danger: user.active }] : []),
  ]
  if (items.length === 0) return null

  const done = (u: AdminUserRow, text: string) => {
    setOpen(null)
    onChanged(u)
    toast({ message: text, tone: 'success' })
  }

  return (
    <>
      <ActionMenu label={`Thao tác với ${user.fullName}`} items={items} />
      {open === 'role' && nextRole && (
        <ReasonDialog
          title={`Đổi vai trò của ${user.fullName}`}
          description={
            nextRole === 'STAFF'
              ? 'Người này sẽ vào được trang quản trị (đơn hàng, tồn kho) từ lần tải trang tiếp theo.'
              : 'Người này sẽ mất quyền vào trang quản trị ngay lập tức.'
          }
          submitLabel={`Đổi thành ${ROLE_LABEL[nextRole]}`}
          run={(reason) => userApi.changeRole(user.id, nextRole, reason)}
          onDone={(u) => done(u, `Đã đổi vai trò thành ${ROLE_LABEL[nextRole]}`)}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'active' && (
        <ReasonDialog
          title={user.active ? `Khoá tài khoản ${user.fullName}?` : `Mở khoá tài khoản ${user.fullName}?`}
          description={
            user.active
              ? 'Người này bị đăng xuất khỏi mọi thiết bị và không đăng nhập được nữa. Đơn hàng cũ vẫn giữ nguyên.'
              : 'Người này có thể đăng nhập lại.'
          }
          submitLabel={user.active ? 'Khoá tài khoản' : 'Mở khoá'}
          tone={user.active ? 'danger' : 'primary'}
          run={(reason) => userApi.setActive(user.id, !user.active, reason)}
          onDone={(u) => done(u, u.active ? 'Đã mở khoá tài khoản' : 'Đã khoá tài khoản')}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

/** New staff member: they get an email with a link to choose their password (valid 48 hours). */
export function InviteDialog({ onDone, onClose }: { onDone: (u: AdminUserRow) => void; onClose: () => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', reason: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((x) => ({ ...x, [key]: '' }))
  }

  const submit = async () => {
    const next: Record<string, string> = {}
    if (!form.fullName.trim()) next.fullName = 'Vui lòng nhập họ tên'
    else if (!isPersonName(form.fullName)) next.fullName = NAME_ERROR
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Email không hợp lệ'
    if (!form.reason.trim()) next.reason = 'Vui lòng nhập lý do'
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    setError(null)
    try {
      onDone(await userApi.invite(form.fullName.trim(), form.email.trim(), form.reason.trim()))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_EXISTS') setErrors({ email: err.message })
      else {
        setError(err instanceof Error ? err.message : String(err))
        if (err instanceof ApiError) setErrors(err.fieldErrors)
      }
      setPending(false)
    }
  }

  return (
    <Dialog title="Mời nhân viên" submitLabel="Gửi lời mời" onSubmit={submit} onClose={onClose} pending={pending} error={error}>
      <p className="text-sm text-stone-600">
        Người được mời nhận email có liên kết đặt mật khẩu (hiệu lực 48 giờ, dùng một lần) và vào trang quản trị với vai
        trò Nhân viên.
      </p>
      <Field label="Họ tên" requiredMark error={errors.fullName}>
        {(p) => <input {...p} value={form.fullName} onChange={set('fullName')} maxLength={60} autoComplete="off" autoFocus />}
      </Field>
      <Field label="Email" requiredMark error={errors.email}>
        {(p) => <input {...p} type="email" value={form.email} onChange={set('email')} maxLength={255} autoComplete="off" />}
      </Field>
      <Field label="Lý do (ghi vào nhật ký)" requiredMark error={errors.reason}>
        {(p) => <input {...p} value={form.reason} onChange={set('reason')} maxLength={500} placeholder="VD: Nhân viên kho mới" />}
      </Field>
    </Dialog>
  )
}
