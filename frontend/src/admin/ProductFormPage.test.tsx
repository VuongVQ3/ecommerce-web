// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PriceChangeDialog } from './ProductFormPage'
import { isBigPriceChange, priceChangePercent } from './productSchema'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

afterEach(cleanup)

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
