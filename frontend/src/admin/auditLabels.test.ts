import { describe, expect, it } from 'vitest'
import { actionLabel, actorText, changeRows, formatAuditValue, reasonText, rowReason } from './auditLabels'

const product = { entityType: 'PRODUCT', action: 'PRODUCT_UPDATED', categories: new Map([[3, 'Hạt dinh dưỡng']]) }

describe('audit labels', () => {
  it('names actions, and shows unknown codes as they are', () => {
    expect(actionLabel('ORDER_CANCEL')).toBe('Huỷ đơn')
    expect(actionLabel('ORDER_SHIP')).toBe('Giao cho vận chuyển')
    expect(actionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })

  it('formats values for people', () => {
    expect(formatAuditValue('price', 189000, product)).toBe('189.000₫')
    expect(formatAuditValue('endsAt', '2026-10-16T17:00:00Z', product)).toBe('Đến hết 16/10/2026')
    expect(formatAuditValue('startsAt', '2026-10-09T17:00:00Z', product)).toBe('10/10/2026 00:00')
    expect(formatAuditValue('active', false, product)).toBe('Đã ẩn')
    expect(formatAuditValue('active', true, { entityType: 'PRODUCT', action: 'PROMOTION_ENDED' })).toBe('Đang chạy')
    expect(formatAuditValue('active', false, { entityType: 'USER', action: 'USER_LOCKED' })).toBe('Đã khoá')
    expect(formatAuditValue('level', 'BLOCK_COD', { entityType: 'PHONE', action: 'PHONE_FLAG_CREATED' })).toBe('Chặn COD')
    expect(formatAuditValue('status', 'CANCELLED', { entityType: 'ORDER', action: 'ORDER_CANCEL' })).toBe('Đã huỷ')
    expect(formatAuditValue('categoryId', 3, product)).toBe('Hạt dinh dưỡng')
    expect(formatAuditValue('weightGrams', 500, product)).toBe('500g')
    expect(formatAuditValue('origin', null, product)).toBe('—')
    expect(formatAuditValue('description', '', product)).toBe('—')
  })

  it('keeps only changed fields of old whole-object snapshots', () => {
    const rows = changeRows({
      before: { name: 'Granola', price: 139000, calories: '450.00', active: true },
      after: { name: 'Granola', price: 230000, calories: 450, active: true },
    })
    expect(rows).toEqual([{ field: 'price', before: 139000, after: 230000 }])
    expect(changeRows({ before: null, after: { salePrice: 111000 } })).toEqual([{ field: 'salePrice', before: null, after: 111000 }])
  })

  it('writes the reason and the actor', () => {
    expect(reasonText({ reasonCode: 'CHANGED_MIND', reason: 'hiutest' })).toBe('Không muốn mua nữa – hiutest')
    expect(reasonText({ reasonCode: null, reason: 'nghỉ việc' })).toBe('nghỉ việc')
    expect(reasonText({ reasonCode: null, reason: null })).toBeNull()
    expect(actorText({ actorType: 'CUSTOMER', actorName: 'Nguyễn A', actorEmail: null, actorId: null })).toBe('Khách hàng: Nguyễn A')
    expect(actorText({ actorType: 'SYSTEM', actorName: null, actorEmail: null, actorId: null })).toBe('Hệ thống')
    expect(actorText({ actorType: 'STAFF', actorName: 'Quốc Vương', actorEmail: 'q@x.vn', actorId: 'u1' })).toBe('Quốc Vương')
  })
})

describe('older rows', () => {
  it('parses JSON text, shows other text as is, and keeps the reason out of the table', () => {
    expect(changeRows({ before: '{"role": "STAFF"}', after: '{"role": "CUSTOMER", "reason": "Nghỉ việc"}' })).toEqual([
      { field: 'role', before: 'STAFF', after: 'CUSTOMER' },
    ])
    expect(changeRows({ before: null, after: 'không phải JSON' })).toEqual([{ field: '', before: null, after: 'không phải JSON' }])
    expect(rowReason({ reasonCode: null, reason: null, after: { reason: 'Nghỉ việc' } })).toBe('Nghỉ việc')
  })
})
