// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../lib/adminApi'
import { NewOrdersContext } from './newOrders'
import OrdersPage from './OrdersPage'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** OrdersPage under a stand-in for the layout's context; the button simulates the poll noticing a new order */
function Harness() {
  const [newOrders, setNewOrders] = useState(0)
  return (
    <NewOrdersContext.Provider value={{ newOrders, refresh: () => {} }}>
      <button type="button" onClick={() => setNewOrders((n) => n + 1)}>
        poll sees a new order
      </button>
      <OrdersPage />
    </NewOrdersContext.Provider>
  )
}

function renderAt(url: string) {
  // The list itself (not the size=1 counts of the status chips)
  const list = vi.fn()
  vi.spyOn(adminApi, 'orders').mockImplementation(async (f) => {
    if (f.size !== 1) list(f)
    return { page: { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 }, pendingCount: 0 }
  })
  const router = createMemoryRouter([{ path: '/admin/don-hang', element: <Harness /> }], { initialEntries: [url] })
  render(<RouterProvider router={router} />)
  return list
}

describe('OrdersPage and new orders', () => {
  it('reloads by itself on the first page with no filter', async () => {
    const list = renderAt('/admin/don-hang')
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'poll sees a new order' })))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Có đơn mới')).toBeNull()
  })

  it('offers "Tải lại" instead when filtered or on another page', async () => {
    const list = renderAt('/admin/don-hang?status=PENDING&page=1')
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'poll sees a new order' })))
    expect(await screen.findByText('Có đơn mới')).toBeTruthy()
    expect(list).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Có đơn mới')).toBeNull()
  })
})
