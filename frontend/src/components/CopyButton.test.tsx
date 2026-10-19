// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CopyButton, { COPIED_MS } from './CopyButton'

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  vi.useFakeTimers()
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Clicks and lets the awaited clipboard promise settle (fake timers stay put). */
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

const renderButton = () => render(<CopyButton text="HL261019ABCD" label="Sao chép mã đơn" copiedLabel="Đã sao chép mã" />)

describe('CopyButton', () => {
  it('copies, says so for 2 seconds, then goes back', async () => {
    renderButton()
    await click('Sao chép mã đơn')
    expect(writeText).toHaveBeenCalledWith('HL261019ABCD')
    expect(screen.getByRole('button', { name: 'Đã sao chép mã' })).toBeTruthy()
    // Screen readers are told too
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Đã sao chép mã')

    act(() => vi.advanceTimersByTime(COPIED_MS - 1))
    expect(screen.getByRole('button', { name: 'Đã sao chép mã' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('button', { name: 'Sao chép mã đơn' })).toBeTruthy()
  })

  it('a second click copies again and restarts the 2 seconds (one timer only)', async () => {
    renderButton()
    await click('Sao chép mã đơn')
    act(() => vi.advanceTimersByTime(1500))
    await click('Đã sao chép mã')
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)

    act(() => vi.advanceTimersByTime(1500))
    expect(screen.getByRole('button', { name: 'Đã sao chép mã' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByRole('button', { name: 'Sao chép mã đơn' })).toBeTruthy()
  })

  it('unmounting while the 2 seconds run leaves no timer behind and no warning', async () => {
    const error = vi.spyOn(console, 'error')
    const view = renderButton()
    await click('Sao chép mã đơn')
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(COPIED_MS))
    expect(error).not.toHaveBeenCalled()
  })

  it('shows the text selected for manual copy when the clipboard is refused', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    renderButton()
    await click('Sao chép mã đơn')
    const field = screen.getByLabelText('Nhấn giữ hoặc Ctrl+C để sao chép') as HTMLInputElement
    expect(field.value).toBe('HL261019ABCD')
    expect(screen.getByRole('button', { name: 'Sao chép mã đơn' })).toBeTruthy()
  })
})
