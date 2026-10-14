import type { Role } from '../lib/api'
import type { PhoneFlagLevel } from '../lib/adminApi'

export const FLAG_LABEL: Record<PhoneFlagLevel, string> = {
  WATCH: 'Cần lưu ý',
  BLOCK_COD: 'Chặn đặt COD',
}

export const FLAG_STYLE: Record<PhoneFlagLevel, string> = {
  WATCH: 'bg-amber-100 text-amber-900',
  BLOCK_COD: 'bg-red-100 text-red-800',
}

export const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: 'Khách hàng',
  STAFF: 'Nhân viên',
  ADMIN: 'Quản trị viên',
}

export const ROLE_STYLE: Record<Role, string> = {
  CUSTOMER: 'bg-stone-100 text-stone-700',
  STAFF: 'bg-sky-100 text-sky-900',
  ADMIN: 'bg-violet-100 text-violet-900',
}
