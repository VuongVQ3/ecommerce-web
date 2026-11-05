// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { promotionApi, type PromotionRow, type PromotionStatus } from '../lib/adminApi'
import PromotionsPage from './PromotionsPage'

const toast = vi.hoisted(() => vi.fn())
vi.mock('../components/Toast', () => ({ useToast: () => toast }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  // 05/11/2026 17:00 in Vietnam
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
  toast.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const row = (id: string, status: PromotionStatus, startsAt: string, endsAt: string): PromotionRow => ({
  id,
  productId: 29,
  productName: `Mắc ca ${id}`,
  productSlug: 'mac-ca',
  regularPrice: 269_000,
  salePrice: 229_000,
  discountPercent: 15,
  startsAt,
  endsAt,
  status,
  productDaysThisYear: 8,
})

/** Started 03/11 14:31:38 in Vietnam, until the end of 10/11 */
const RUNNING = row('run', 'RUNNING', '2026-11-03T07:31:38Z', '2026-11-10T17:00:00Z')
/** 08/11 → 12/11 */
const UPCOMING = row('up', 'UPCOMING', '2026-11-07T17:00:00Z', '2026-11-12T17:00:00Z')
const ENDED = row('end', 'ENDED', '2026-10-01T17:00:00Z', '2026-10-05T09:25:49Z')

function renderPage() {
  vi.spyOn(promotionApi, 'list').mockResolvedValue([RUNNING, UPCOMING, ENDED])
  vi.spyOn(promotionApi, 'usage').mockResolvedValue({ year: 2026, maxDaysPerYear: 120, maxDiscountPercent: 50, products: [] })
  const update = vi.spyOn(promotionApi, 'update').mockResolvedValue(RUNNING)
  render(<PromotionsPage />)
  return update
}

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!

describe('PromotionsPage: editing', () => {
  it('offers "Sửa" next to "Kết thúc sớm" on a running promotion', async () => {
    renderPage()
    const tr = within(await rowOf('Mắc ca run'))
    expect(tr.getByRole('button', { name: 'Sửa' })).toBeTruthy()
    expect(tr.getByRole('button', { name: 'Kết thúc sớm' })).toBeTruthy()
  })

  it('running: price and last day change, the first day is shown but not editable and sent back unchanged', async () => {
    const update = renderPage()
    fireEvent.click(within(await rowOf('Mắc ca run')).getByRole('button', { name: 'Sửa' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.queryByLabelText('Từ ngày')).toBeNull()
    expect(dialog.getByText('03/11/2026')).toBeTruthy()
    expect(dialog.getByText('Đã bắt đầu, không đổi được')).toBeTruthy()
    expect(dialog.getByText(/Giá mới áp dụng ngay trên cửa hàng/)).toBeTruthy()
    expect(dialog.getByLabelText('Đến hết ngày')).toBeTruthy()

    fireEvent.change(dialog.getByLabelText('Giá khuyến mại (₫)'), { target: { value: '199000' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Lưu' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('run', {
        productId: 29,
        salePrice: 199_000,
        startsAt: '2026-11-03T07:31:38Z',
        endsAt: '2026-11-10T17:00:00.000Z',
      }),
    )
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ tone: 'success', message: 'Đã lưu khuyến mại' }))
  })

  it('upcoming: both days are editable and sent as Vietnam days', async () => {
    const update = renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Sắp tới (1)' }))
    fireEvent.click(within(await rowOf('Mắc ca up')).getByRole('button', { name: 'Sửa' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByLabelText('Từ ngày')).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: 'Lưu' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('up', {
        productId: 29,
        salePrice: 229_000,
        startsAt: '2026-11-07T17:00:00.000Z',
        endsAt: '2026-11-12T17:00:00.000Z',
      }),
    )
  })

  it('ended promotions have no actions', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Đã kết thúc (1)' }))
    const tr = within(await rowOf('Mắc ca end'))
    expect(tr.queryByRole('button')).toBeNull()
  })
})
