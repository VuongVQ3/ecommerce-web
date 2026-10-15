// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import CancelOrderDialog from './CancelOrderDialog'

const site = vi.hoisted(() => ({ business: { hotline: '0912 345 678' } as Record<string, string> }))
vi.mock('../lib/siteInfo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/siteInfo')>()),
  useSiteInfo: () => ({ siteUrl: 'https://example.test', business: site.business }),
}))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

afterEach(() => {
  cleanup()
  site.business = { hotline: '0912 345 678' }
})

const submitButton = () => screen.getByRole('button', { name: 'Huỷ đơn' }) as HTMLButtonElement

describe('CancelOrderDialog', () => {
  it('needs a reason, and a note for "Lý do khác"', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CancelOrderDialog code="HL1" onClose={vi.fn()} onSubmit={onSubmit} />)
    expect(screen.getByRole('heading', { name: 'Huỷ đơn HL1?' })).toBeTruthy()
    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true)
    expect(screen.getAllByRole('radio')).toHaveLength(6)
    expect(submitButton().disabled).toBe(true)

    fireEvent.click(screen.getByLabelText('Lý do khác'))
    expect(submitButton().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Ghi chú thêm/), { target: { value: '  Đổi ý  ' } })
    expect(screen.getByText(`${'  Đổi ý  '.length}/300`)).toBeTruthy()
    expect(submitButton().disabled).toBe(false)
    fireEvent.click(submitButton())
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ reasonCode: 'OTHER', reason: 'Đổi ý' }))
  })

  it('suggests calling the shop instead when the order only needs a change', () => {
    render(<CancelOrderDialog code="HL1" onClose={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.queryByText(/liên hệ shop để sửa đơn/)).toBeNull()
    fireEvent.click(screen.getByLabelText('Muốn đổi địa chỉ giao hàng'))
    expect(screen.getByText(/liên hệ shop để sửa đơn/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '0912 345 678' }).getAttribute('href')).toBe('tel:0912345678')
    fireEvent.click(screen.getByLabelText('Không muốn mua nữa'))
    expect(screen.queryByText(/liên hệ shop để sửa đơn/)).toBeNull()
  })

  it('shows no suggestion when no hotline is configured', () => {
    site.business = {}
    render(<CancelOrderDialog code="HL1" onClose={vi.fn()} onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Muốn đổi sản phẩm hoặc số lượng'))
    expect(screen.queryByText(/liên hệ shop để sửa đơn/)).toBeNull()
  })

  it('shows the server error and lets the customer try again', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Đơn hàng đã được xác nhận nên không thể tự huỷ.'))
    render(<CancelOrderDialog code="HL1" onClose={vi.fn()} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByLabelText('Tìm được giá tốt hơn'))
    fireEvent.click(submitButton())
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(submitButton().disabled).toBe(false)
  })
})
