// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import FreeShippingNudge from './FreeShippingNudge'

afterEach(cleanup)

describe('FreeShippingNudge', () => {
  it('a 109.000₫ cart: the threshold in short form, the amount left in bold', () => {
    const { container } = render(
      <FreeShippingNudge view={{ amountToFreeShipping: 90_000, freeShippingThreshold: 199_000, freeShippingForAll: false }} />,
    )
    expect(container.textContent).toBe('FREESHIP cho đơn từ 199k. Mua thêm 90.000₫ để được miễn phí giao hàng!!')
    expect([...container.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['FREESHIP', '90.000₫'])
  })

  it('says nothing once the order ships free, or when shipping is free for everyone', () => {
    const free = render(
      <FreeShippingNudge view={{ amountToFreeShipping: 0, freeShippingThreshold: 199_000, freeShippingForAll: false }} />,
    )
    expect(free.container.textContent).toBe('')
    const all = render(<FreeShippingNudge view={{ amountToFreeShipping: 0, freeShippingThreshold: 0, freeShippingForAll: true }} />)
    expect(all.container.textContent).toBe('')
  })
})
