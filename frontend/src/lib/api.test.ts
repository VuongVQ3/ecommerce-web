import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, apiRequest, ApiError, onSessionExpired } from './api'

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const user = { id: 'u1', email: 'an@example.com', fullName: 'An', phone: null, role: 'CUSTOMER' }

describe('apiRequest', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const expired = vi.fn()
  let unsubscribe: () => void

  const calls = () => fetchMock.mock.calls.map(([url]) => String(url))

  beforeEach(() => {
    fetchMock.mockReset()
    expired.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    unsubscribe = onSessionExpired(expired)
  })

  afterEach(() => {
    unsubscribe()
    vi.unstubAllGlobals()
  })

  it('sends cookies and the CSRF header on every request', async () => {
    fetchMock.mockResolvedValueOnce(json(200, user))

    await api.login({ email: 'an@example.com', password: 'matkhau123' })

    const [, init] = fetchMock.mock.calls[0]
    expect(init?.credentials).toBe('include')
    expect(new Headers(init?.headers).get('X-Requested-With')).toBe('XMLHttpRequest')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
  })

  it('refreshes once on 401 and retries the original request', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(200, user)) // refresh
      .mockResolvedValueOnce(json(200, { ok: true })) // retry

    await expect(apiRequest('/api/orders')).resolves.toEqual({ ok: true })
    expect(calls()).toEqual(['/api/orders', '/api/auth/refresh', '/api/orders'])
    expect(expired).not.toHaveBeenCalled()
  })

  it('shares a single refresh between concurrent 401s', async () => {
    let finishRefresh: (r: Response) => void = () => {}
    fetchMock.mockImplementation((url) => {
      if (String(url) === '/api/auth/refresh') return new Promise((resolve) => (finishRefresh = resolve))
      return Promise.resolve(json(fetchMock.mock.calls.filter(([u]) => u === url).length === 1 ? 401 : 200, {}))
    })

    const both = Promise.all([apiRequest('/api/a'), apiRequest('/api/b')])
    await vi.waitFor(() => expect(calls()).toContain('/api/auth/refresh'))
    finishRefresh(json(200, user))
    await both

    expect(calls().filter((u) => u === '/api/auth/refresh')).toHaveLength(1)
  })

  it('reports an expired session when the refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { detail: 'Vui lòng đăng nhập để tiếp tục' }))
      .mockResolvedValueOnce(json(401, { detail: 'Phiên đăng nhập đã hết hạn' })) // refresh

    const error = await apiRequest('/api/orders').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect((error as ApiError).message).toBe('Vui lòng đăng nhập để tiếp tục')
    expect(expired).toHaveBeenCalledOnce()
  })

  it('does not redirect for the silent session check on page load', async () => {
    fetchMock.mockResolvedValueOnce(json(401)).mockResolvedValueOnce(json(401))

    await expect(api.me()).rejects.toBeInstanceOf(ApiError)
    expect(calls()).toEqual(['/api/auth/me', '/api/auth/refresh'])
    expect(expired).not.toHaveBeenCalled()
  })

  it('treats 401 from login as wrong credentials, not as an expired session', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { detail: 'Email hoặc mật khẩu không đúng' }))

    await expect(api.login({ email: 'an@example.com', password: 'x' })).rejects.toThrow(
      'Email hoặc mật khẩu không đúng',
    )
    expect(calls()).toEqual(['/api/auth/login'])
    expect(expired).not.toHaveBeenCalled()
  })

  it('uses Vietnamese messages for network failures and server errors, and exposes error codes', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api.categories()).rejects.toThrow('Không kết nối được máy chủ. Vui lòng thử lại.')

    fetchMock.mockResolvedValueOnce(json(500, { detail: 'Internal Server Error' }))
    await expect(api.categories()).rejects.toThrow('Đã có lỗi xảy ra. Vui lòng thử lại.')

    fetchMock.mockResolvedValueOnce(json(409, { detail: 'Email này đã có tài khoản', code: 'EMAIL_EXISTS' }))
    const error = (await api.login({ email: 'a@b.vn', password: 'x' }).catch((e: unknown) => e)) as ApiError
    expect(error.code).toBe('EMAIL_EXISTS')
    expect(error.message).toBe('Email này đã có tài khoản')
  })

  it('exposes backend field errors and handles 204', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, { detail: 'Dữ liệu không hợp lệ', errors: { phone: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0' } }),
    )
    const error = (await api
      .register({
        fullName: 'A',
        email: 'a@b.vn',
        password: 'abc12345',
        phone: '1',
        acceptTerms: true,
        marketingConsent: false,
        turnstileToken: 't',
        website: '',
      })
      .catch(
      (e: unknown) => e,
    )) as ApiError
    expect(error.fieldErrors.phone).toBe('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0')

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(api.logout()).resolves.toBeUndefined()
  })
})
