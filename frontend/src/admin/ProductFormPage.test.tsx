// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../lib/adminApi'
import ProductFormPage, { PriceChangeDialog } from './ProductFormPage'
import { isBigPriceChange, priceChangePercent } from './productSchema'

vi.mock('../components/Toast', () => ({ useToast: () => vi.fn() }))

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
  vi.restoreAllMocks()
})

describe('price change check', () => {
  it('asks only when the price moves by more than half', () => {
    expect(isBigPriceChange(189_000, 1_890_000)).toBe(true)
    expect(isBigPriceChange(189_000, 18_900)).toBe(true)
    expect(isBigPriceChange(200_000, 300_000)).toBe(false)
    expect(isBigPriceChange(200_000, 100_000)).toBe(false)
    expect(isBigPriceChange(200_000, 301_000)).toBe(true)
    expect(priceChangePercent(189_000, 1_890_000)).toBe(900)
    expect(priceChangePercent(200_000, 50_000)).toBe(-75)
  })

  it('shows old and new price with the percentage, and both answers', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<PriceChangeDialog oldPrice={189_000} newPrice={1_890_000} onConfirm={onConfirm} onCancel={onCancel} />)
    const text = screen.getByRole('dialog').textContent ?? ''
    expect(text).toContain('189.000₫')
    expect(text).toContain('1.890.000₫')
    expect(text).toContain('(+900%)')

    fireEvent.click(screen.getByRole('button', { name: 'Sửa lại' }))
    expect(onCancel).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đổi giá' }))
    expect(onConfirm).toHaveBeenCalled()
  })
})

describe('short description field', () => {
  it('sits above the full description, counts characters and stops at 160', async () => {
    vi.spyOn(adminApi, 'categories').mockResolvedValue([])
    const router = createMemoryRouter([{ path: '/admin/san-pham/moi', element: <ProductFormPage /> }], {
      initialEntries: ['/admin/san-pham/moi'],
    })
    render(<RouterProvider router={router} />)

    const short = (await screen.findByLabelText('Mô tả ngắn')) as HTMLTextAreaElement
    const full = screen.getByLabelText(/^Mô tả\s*\*?$/)
    expect(short.compareDocumentPosition(full) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(short.rows).toBe(3)
    // No maxLength: it would cut a paste silently
    expect(short.hasAttribute('maxlength')).toBe(false)
    expect(screen.getByText('0/160')).toBeTruthy()
    expect(short.getAttribute('aria-describedby')).toContain('shortDescription-help')
    expect(document.getElementById('shortDescription-help')?.textContent).toBe(
      'Hiển thị ở xem nhanh và kết quả tìm kiếm Google.',
    )

    fireEvent.change(short, { target: { value: 'Hạt điều giòn' } })
    expect(screen.getByText('13/160')).toBeTruthy()
  })

  it('lets a paste go past 160, then turns the counter red, shows the error and blocks saving', async () => {
    vi.spyOn(adminApi, 'categories').mockResolvedValue([])
    const create = vi.spyOn(adminApi, 'createProduct')
    const router = createMemoryRouter([{ path: '/admin/san-pham/moi', element: <ProductFormPage /> }], {
      initialEntries: ['/admin/san-pham/moi'],
    })
    render(<RouterProvider router={router} />)
    const short = (await screen.findByLabelText('Mô tả ngắn')) as HTMLTextAreaElement
    const save = screen.getByRole('button', { name: 'Tạo sản phẩm' }) as HTMLButtonElement

    const pasted = 'Đ'.repeat(170)
    fireEvent.change(short, { target: { value: pasted } })
    expect(short.value).toBe(pasted)
    const counter = screen.getByText('170/160')
    expect(counter.className).toContain('text-danger')
    expect(screen.getByText('Mô tả ngắn tối đa 160 ký tự')).toBeTruthy()
    expect(short.getAttribute('aria-invalid')).toBe('true')
    expect(save.disabled).toBe(true)
    fireEvent.submit(save.form!)
    expect(create).not.toHaveBeenCalled()

    // Back to 160 (spaces around do not count): fine again
    fireEvent.change(short, { target: { value: ` ${'Đ'.repeat(160)} ` } })
    expect(screen.getByText('160/160').className).not.toContain('text-danger')
    expect(screen.queryByText('Mô tả ngắn tối đa 160 ký tự')).toBeNull()
    await waitFor(() => expect(save.disabled).toBe(false))
  })
})
