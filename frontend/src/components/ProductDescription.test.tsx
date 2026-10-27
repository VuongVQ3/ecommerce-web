// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ProductDescription from './ProductDescription'

afterEach(cleanup)

describe('ProductDescription', () => {
  it('shows each section with its heading and one paragraph per line', () => {
    const { container } = render(
      <ProductDescription text={'Thơm, giòn.\n\nThông tin chi tiết:\nXuất xứ: Đăk Lăk.\nKhối lượng: 500g.\n\nBảo quản:\nNơi khô ráo.'} />,
    )
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Thông tin chi tiết',
      'Bảo quản',
    ])
    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      'Thơm, giòn.',
      'Xuất xứ: Đăk Lăk.',
      'Khối lượng: 500g.',
      'Nơi khô ráo.',
    ])
  })

  it('keeps a short description as one paragraph without a heading', () => {
    const { container } = render(<ProductDescription text="Mắc ca nguyên vỏ, hạt to, chắc." />)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })

  it('renders markup as text, never as HTML', () => {
    const { container } = render(<ProductDescription text={'<b>Đậm</b>:\n<img src=x onerror="alert(1)">\n\nHết.'} />)
    expect(container.querySelector('img, b')).toBeNull()
    expect(screen.getByRole('heading').textContent).toBe('<b>Đậm</b>')
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeTruthy()
  })
})
