// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { DateField } from './DateField'
import { displayToIso, isoToDisplay, monthGrid, quickRange, vnTodayIso } from './dates'

afterEach(cleanup)

describe('dates', () => {
  it('converts between dd/MM/yyyy and ISO, rejecting impossible dates', () => {
    expect(displayToIso('14/10/2026')).toBe('2026-10-14')
    expect(displayToIso('4/1/2026')).toBe('2026-01-04')
    expect(displayToIso('31/02/2026')).toBeNull()
    expect(displayToIso('2026-10-14')).toBeNull()
    expect(isoToDisplay('2026-10-14')).toBe('14/10/2026')
  })

  it('uses the day in Vietnam, not the browser time zone', () => {
    // 20:00 UTC on 13/10 is already 03:00 on 14/10 in Vietnam
    expect(vnTodayIso(new Date('2026-10-13T20:00:00Z'))).toBe('2026-10-14')
    expect(quickRange('last7', new Date('2026-10-13T20:00:00Z'))).toEqual({ from: '2026-10-08', to: '2026-10-14' })
    expect(quickRange('thisMonth', new Date('2026-10-13T20:00:00Z'))).toEqual({ from: '2026-10-01', to: '2026-10-14' })
  })

  it('builds Monday-first month grids', () => {
    const grid = monthGrid(2026, 9) // October 2026 starts on a Thursday
    expect(grid[0]).toBe('2026-09-28') // Monday
    expect(grid[3]).toBe('2026-10-01')
  })
})

function Harness() {
  const [value, setValue] = useState('')
  return (
    <>
      <DateField label="Từ ngày" value={value} onChange={setValue} />
      <output data-testid="iso">{value}</output>
    </>
  )
}

describe('DateField', () => {
  it('accepts typed dd/MM/yyyy and reports ISO', () => {
    render(<Harness />)
    const field = screen.getByLabelText('Từ ngày')
    fireEvent.change(field, { target: { value: '14/10/2026' } })
    fireEvent.blur(field)
    expect(screen.getByTestId('iso').textContent).toBe('2026-10-14')
    fireEvent.change(field, { target: { value: '32/10/2026' } })
    fireEvent.blur(field)
    expect(screen.getByText('Ngày không hợp lệ, nhập theo dạng dd/MM/yyyy')).toBeTruthy()
  })

  it('picks a day from the Monday-first calendar with the keyboard', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '14/10/2026' } })
    fireEvent.blur(screen.getByLabelText('Từ ngày'))
    fireEvent.click(screen.getByRole('button', { name: 'Chọn từ ngày từ lịch' }))
    const calendar = screen.getByRole('dialog', { name: 'Lịch chọn từ ngày' })
    expect(screen.getByText('Tháng 10 năm 2026')).toBeTruthy()
    expect(screen.getAllByRole('columnheader')[0].textContent).toBe('T2')
    fireEvent.keyDown(calendar, { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: 'Thứ Năm, 15/10/2026' }))
    expect(screen.getByTestId('iso').textContent).toBe('2026-10-15')
    expect((screen.getByLabelText('Từ ngày') as HTMLInputElement).value).toBe('15/10/2026')
  })
})
