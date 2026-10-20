// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type ProductSuggestion } from '../lib/api'
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

/** Lets the debounce run and the (mocked) request resolve */
async function wait(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

const where = () => screen.getByTestId('where').textContent

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('SearchBox suggestions', () => {
  it('asks once, 300 ms after the last keystroke, and aborts the older request', async () => {
    const suggest = vi.spyOn(api, 'suggest').mockResolvedValue(ITEMS)
    const input = renderBox()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'h' } })
    await wait(1000)
    expect(suggest).not.toHaveBeenCalled() // under 2 characters

    fireEvent.change(input, { target: { value: 'ha' } })
    await wait(200)
    fireEvent.change(input, { target: { value: 'hat dieu' } })
    await wait(299)
    expect(suggest).not.toHaveBeenCalled()
    await wait(1)
    expect(suggest).toHaveBeenCalledTimes(1)
    expect(suggest).toHaveBeenCalledWith('hat dieu', expect.any(AbortSignal))

    // A new term while a request is out: the old one is aborted
    suggest.mockImplementation(() => new Promise(() => {}))
    fireEvent.change(input, { target: { value: 'hat dieu r' } })
    await wait(300)
    const first = suggest.mock.calls[1][1] as AbortSignal
    fireEvent.change(input, { target: { value: 'hat dieu ra' } })
    await wait(300)
    expect(first.aborted).toBe(true)
  })

  it('lists products with the match in bold and the price, then "Xem tất cả"; Enter opens the picked one', async () => {
    vi.spyOn(api, 'suggest').mockResolvedValue(ITEMS)
    const input = renderBox()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'hat dieu' } })
    await wait(300)

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
    vi.spyOn(api, 'suggest').mockResolvedValue(ITEMS)
    const input = renderBox()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'hạt điều' } })
    await wait(300)
    fireEvent.submit(input.form!)
    expect(where()).toBe(`/san-pham?q=${encodeURIComponent('hạt điều')}`)

    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' }) // wraps to the last row
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(where()).toBe(`/san-pham?q=${encodeURIComponent('hạt điều')}`)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('Esc and a click outside close it; focusing the field again reopens it', async () => {
    vi.spyOn(api, 'suggest').mockResolvedValue(ITEMS)
    const input = renderBox()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'dieu' } })
    await wait(300)
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

  it('shows a spinner while looking and "Không tìm thấy" when nothing matches', async () => {
    let answer: (v: ProductSuggestion[]) => void = () => {}
    vi.spyOn(api, 'suggest').mockImplementation(() => new Promise((r) => (answer = r)))
    const input = renderBox()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'xyz' } })
    expect(screen.getByRole('status').textContent).toContain('Đang tìm...')
    await wait(300)
    await act(async () => answer([]))
    expect(screen.getByRole('status').textContent).toBe('Không tìm thấy sản phẩm phù hợp')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('a click on a product opens it and closes the list', async () => {
    vi.spyOn(api, 'suggest').mockResolvedValue(ITEMS)
    const input = renderBox()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'mac ca' } })
    await wait(300)
    fireEvent.click(screen.getAllByRole('option')[1])
    expect(where()).toBe('/san-pham/sp-2')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.value).toBe('')
  })
})
