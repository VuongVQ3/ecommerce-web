// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type ProductSuggestion } from '../lib/api'
import { forgetSuggestionIndex } from '../lib/searchSuggestions'
import SearchBox from './SearchBox'

const item = (id: number, name: string): ProductSuggestion => ({
  id,
  name,
  slug: `sp-${id}`,
  price: 210_000,
  imageUrl: null,
  categorySlug: 'hat-dinh-duong',
})
const ITEMS = [item(1, 'Hạt điều A cồ rang muối – hũ PET'), item(2, 'Bánh thuyền hạt điều – mắc ca')]

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

function renderBox() {
  const page = (
    <>
      <SearchBox />
      <button type="button">Ngoài</button>
      <Where />
    </>
  )
  const router = createMemoryRouter([{ path: '*', element: page }], { initialEntries: ['/'] })
  render(<RouterProvider router={router} />)
  return screen.getByRole('combobox', { name: 'Tìm sản phẩm' }) as HTMLInputElement
}

/** Lets the (mocked) list fetch resolve */
const settle = () => act(async () => {})

const where = () => screen.getByTestId('where').textContent
const productNames = () => screen.getAllByRole('option').slice(0, -1).map((o) => o.querySelector('.truncate')?.textContent)

beforeEach(() => forgetSuggestionIndex())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SearchBox suggestions', () => {
  it('fetches the product list once, on the first focus, and filters it as the user types', async () => {
    const load = vi.spyOn(api, 'suggestionIndex').mockResolvedValue(ITEMS)
    const input = renderBox()
    expect(load).not.toHaveBeenCalled()
    fireEvent.focus(input)
    await settle()
    expect(load).toHaveBeenCalledTimes(1)

    for (const value of ['h', 'ha', 'hat dieu', 'mac ca']) fireEvent.change(input, { target: { value } })
    fireEvent.blur(input)
    fireEvent.focus(input)
    await settle()
    expect(load).toHaveBeenCalledTimes(1)
    expect(productNames()).toEqual(['Bánh thuyền hạt điều – mắc ca'])
  })

  it('suggests from one character, nothing for spaces only', async () => {
    vi.spyOn(api, 'suggestionIndex').mockResolvedValue(ITEMS)
    const input = renderBox()
    fireEvent.focus(input)
    await settle()
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.getAttribute('aria-expanded')).toBe('false')

    fireEvent.change(input, { target: { value: 'đ' } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(options[0].querySelector('strong')?.textContent).toBe('đ')
  })

  it('puts names starting with the term first and shows at most 6', async () => {
    const many = [item(1, 'Bánh hạt điều'), ...Array.from({ length: 7 }, (_, i) => item(i + 2, `Điều loại ${i + 1}`))]
    vi.spyOn(api, 'suggestionIndex').mockResolvedValue(many)
    const input = renderBox()
    fireEvent.focus(input)
    await settle()
    fireEvent.change(input, { target: { value: 'DIEU' } })
    expect(screen.getAllByRole('option')).toHaveLength(7) // 6 products + "Xem tất cả"
    expect(productNames()).toEqual(Array.from({ length: 6 }, (_, i) => `Điều loại ${i + 1}`))
  })

  it('lists products with the match in bold and the price, then "Xem tất cả"; Enter opens the picked one', async () => {
    vi.spyOn(api, 'suggestionIndex').mockResolvedValue(ITEMS)
    const input = renderBox()
    fireEvent.focus(input)
    await settle()
    fireEvent.change(input, { target: { value: 'hat dieu' } })

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(options[0].querySelector('strong')?.textContent).toBe('Hạt điều')
    expect(options[1].querySelector('strong')?.textContent).toBe('hạt điều')
    expect(options[0].textContent).toContain('210.000₫')
    expect(options[2].textContent).toBe('Xem tất cả kết quả cho ‘hat dieu’')
    expect(input.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id)
    expect(options[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.submit(input.form!)
    expect(where()).toBe('/san-pham/sp-2')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('Enter without a pick goes to the search page; so does the last row', async () => {
    vi.spyOn(api, 'suggestionIndex').mockResolvedValue(ITEMS)
    const input = renderBox()
    fireEvent.focus(input)
    await settle()
    fireEvent.change(input, { target: { value: 'hạt điều' } })
    fireEvent.submit(input.form!)
    expect(where()).toBe(`/san-pham?q=${encodeURIComponent('hạt điều')}`)

    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' }) // wraps to the last row
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(where()).toBe(`/san-pham?q=${encodeURIComponent('hạt điều')}`)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('Esc and a click outside close it; focusing the field again reopens it', async () => {
    vi.spyOn(api, 'suggestionIndex').mockResolvedValue(ITEMS)
    const input = renderBox()
    fireEvent.focus(input)
    await settle()
    fireEvent.change(input, { target: { value: 'dieu' } })
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.focus(input)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Ngoài' }))
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.focus(input)
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('shows a spinner until the list is there and "Không tìm thấy" when nothing matches', async () => {
    let answer: (v: ProductSuggestion[]) => void = () => {}
    vi.spyOn(api, 'suggestionIndex').mockImplementation(() => new Promise((r) => (answer = r)))
    const input = renderBox()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'xyz' } })
    expect(screen.getByRole('status').textContent).toContain('Đang tìm...')
    await act(async () => answer(ITEMS))
    expect(screen.getByRole('status').textContent).toBe('Không tìm thấy sản phẩm phù hợp')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('a failed fetch shows "Không tìm thấy" and is tried again on the next focus', async () => {
    const load = vi.spyOn(api, 'suggestionIndex').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(ITEMS)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const input = renderBox()
    fireEvent.focus(input)
    await settle()
    fireEvent.change(input, { target: { value: 'dieu' } })
    expect(screen.getByRole('status').textContent).toBe('Không tìm thấy sản phẩm phù hợp')

    fireEvent.blur(input)
    fireEvent.focus(input)
    await settle()
    expect(load).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('a click on a product opens it and closes the list', async () => {
    vi.spyOn(api, 'suggestionIndex').mockResolvedValue(ITEMS)
    const input = renderBox()
    fireEvent.focus(input)
    await settle()
    fireEvent.change(input, { target: { value: 'mac ca' } })
    fireEvent.click(screen.getAllByRole('option')[0])
    expect(where()).toBe('/san-pham/sp-2')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.value).toBe('')
  })
})
