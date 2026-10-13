// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminApi, type AdminOrderDetail } from '../lib/adminApi'
import { CancelDialog } from './OrderDetailPage'

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
  it('requires a reason before calling the API', async () => {
    const cancel = vi.spyOn(adminApi, 'cancel').mockResolvedValue({} as AdminOrderDetail)
    const onDone = vi.fn()
    render(<CancelDialog code="HL2610131234" onDone={onDone} onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ đơn' }))
    expect(await screen.findByText('Vui lòng nhập lý do huỷ đơn')).toBeTruthy()
    expect(cancel).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Lý do huỷ (gửi cho khách)'), { target: { value: '  Hết hàng  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ đơn' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(cancel).toHaveBeenCalledWith('HL2610131234', 'Hết hàng')
  })

  it('shows the server message when the order can no longer be cancelled', async () => {
    vi.spyOn(adminApi, 'cancel').mockRejectedValue(new Error('Không thể chuyển đơn từ "Đang giao" sang "Đã huỷ"'))
    render(<CancelDialog code="HL1" onDone={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Lý do huỷ (gửi cho khách)'), { target: { value: 'Khách đổi ý' } })
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ đơn' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Đang giao')
  })
})
