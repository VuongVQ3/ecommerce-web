// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminApi, type AdminOrderDetail } from '../lib/adminApi'
import { CancelDialog, ConfirmDialog } from './OrderDetailPage'

beforeAll(() => {
  // jsdom has no modal support: just mark the dialog open
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CancelDialog', () => {
  it('requires a reason code and a reason before calling the API', async () => {
    const cancel = vi.spyOn(adminApi, 'cancel').mockResolvedValue({} as AdminOrderDetail)
    const onDone = vi.fn()
    render(<CancelDialog code="HL2610131234" status="PENDING" onDone={onDone} onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ đơn' }))
    expect(await screen.findByText('Vui lòng chọn lý do huỷ đơn')).toBeTruthy()
    expect(screen.getByText('Vui lòng nhập lý do huỷ đơn')).toBeTruthy()
    expect(cancel).not.toHaveBeenCalled()
    // "Khách không nhận hàng" only exists for orders out for delivery
    expect(screen.queryByRole('option', { name: 'Khách không nhận hàng' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Nhóm lý do'), { target: { value: 'OUT_OF_STOCK' } })
    fireEvent.change(screen.getByLabelText('Lý do huỷ (gửi cho khách)'), { target: { value: '  Hết hàng  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ đơn' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(cancel).toHaveBeenCalledWith('HL2610131234', 'OUT_OF_STOCK', 'Hết hàng')
  })

  it('offers only "Khách không nhận hàng" for an order out for delivery', () => {
    render(<CancelDialog code="HL1" status="SHIPPING" onDone={() => {}} onClose={() => {}} />)
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Khách không nhận hàng'])
  })

  it('shows the server message when the order can no longer be cancelled', async () => {
    vi.spyOn(adminApi, 'cancel').mockRejectedValue(new Error('Không thể chuyển đơn từ "Đang giao" sang "Đã huỷ"'))
    render(<CancelDialog code="HL1" status="CONFIRMED" onDone={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Nhóm lý do'), { target: { value: 'OTHER' } })
    fireEvent.change(screen.getByLabelText('Lý do huỷ (gửi cho khách)'), { target: { value: 'Khách đổi ý' } })
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ đơn' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Đang giao')
  })
})

describe('ConfirmDialog', () => {
  it('sends the contact result and note; "Chưa liên hệ được" keeps the order pending', async () => {
    const confirm = vi.spyOn(adminApi, 'confirm').mockResolvedValue({} as AdminOrderDetail)
    const onDone = vi.fn()
    render(<ConfirmDialog code="HL1" onDone={onDone} onClose={() => {}} />)

    fireEvent.click(screen.getByLabelText('Chưa liên hệ được'))
    expect(screen.getByText(/vẫn ở trạng thái Chờ xác nhận/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Ghi chú (không bắt buộc)'), { target: { value: 'Thuê bao' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu, chưa xác nhận' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({}, 'UNREACHABLE'))
    expect(confirm).toHaveBeenCalledWith('HL1', 'UNREACHABLE', 'Thuê bao')
  })
})
