// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import AssetPicker from './AssetPicker'
import { assetDetail, assetRow, fakeFile, page, TREE } from './damFixtures'
import { damApi } from './damApi'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  vi.spyOn(damApi, 'folders').mockResolvedValue(TREE)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AssetPicker', () => {
  it('lists only the kind asked for', async () => {
    const list = vi.spyOn(damApi, 'list').mockResolvedValue(page([assetRow({ kind: 'PDF', title: 'Bảng giá' })]))
    render(<AssetPicker kind="PDF" onSelect={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('button', { name: /Bảng giá/ })
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ kind: 'PDF' }), expect.anything())

    cleanup()
    list.mockClear()
    render(<AssetPicker kind="ANY" onSelect={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('button', { name: /Bảng giá/ })
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ kind: null }), expect.anything())
  })

  it('a click selects, "Chọn" hands back that asset', async () => {
    vi.spyOn(damApi, 'list').mockResolvedValue(page([assetRow({ id: 'a1', title: 'Một' }), assetRow({ id: 'a2', title: 'Hai' })]))
    const onSelect = vi.fn()
    render(<AssetPicker kind="IMAGE" onSelect={onSelect} onClose={vi.fn()} />)
    const choose = (await screen.findByRole('button', { name: 'Chọn' })) as HTMLButtonElement
    expect(choose.disabled).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: /Hai/ }))
    expect(screen.getByRole('button', { name: /Hai/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(choose)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a2', title: 'Hai' }))
  })

  it('a double click chooses at once; searching and folders narrow the list', async () => {
    const list = vi.spyOn(damApi, 'list').mockResolvedValue(page([assetRow({ id: 'a1', title: 'Một' })]))
    const onSelect = vi.fn()
    render(<AssetPicker kind="IMAGE" onSelect={onSelect} onClose={vi.fn()} />)
    fireEvent.doubleClick(await screen.findByRole('button', { name: /Một/ }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }))

    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm asset' }), { target: { value: 'banner' } })
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'banner' }), expect.anything()))
    fireEvent.click(screen.getByRole('button', { name: /banners/ }))
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ folderId: 2, includeSubfolders: true }), expect.anything()),
    )
  })

  it('a quick upload goes into the open folder and is selected', async () => {
    vi.spyOn(damApi, 'list').mockResolvedValue(page([]))
    const upload = vi.spyOn(damApi, 'upload').mockResolvedValue(assetDetail({ id: 'new', title: 'Mới tải' }))
    const onSelect = vi.fn()
    const { container } = render(<AssetPicker kind="IMAGE" onSelect={onSelect} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /banners/ }))
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!

    fireEvent.change(input, { target: { files: [fakeFile('gia.pdf', 'application/pdf')] } })
    expect(await screen.findByText('Cần chọn ảnh (JPEG, PNG hoặc WebP)')).toBeTruthy()
    expect(upload).not.toHaveBeenCalled()

    await act(async () => fireEvent.change(input, { target: { files: [fakeFile('anh.png', 'image/png')] } }))
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ name: 'anh.png' }), 2)
    fireEvent.click(screen.getByRole('button', { name: 'Chọn' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }))
  })
})
