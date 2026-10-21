// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { api } from '../lib/api'
import GoogleSignInButton from './GoogleSignInButton'

// Google's script is loaded once per page (module state), like in the browser: the failing load comes first, since
// a failure lets the next button try again, then one successful load serves the remaining tests.

type Config = { client_id: string; callback: (r: { credential: string }) => void }

let config: Config | null
const renderButton = vi.fn()

const googleScript = () => document.head.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]')

function show(
  onCredential: (credential: string) => Promise<void> = vi.fn(),
  text: 'signin_with' | 'signup_with' = 'signin_with',
) {
  render(
    <ToastProvider>
      <GoogleSignInButton text={text} onCredential={onCredential} footnote="Ghi chú" />
      <form aria-label="Form email" />
    </ToastProvider>,
  )
}

/** The first button adds the script tag; the test decides whether it loads */
async function scriptLoads(loads: boolean) {
  await waitFor(() => expect(googleScript()).not.toBeNull())
  await act(async () => {
    if (loads) googleScript()!.onload!(new Event('load'))
    else googleScript()!.onerror!(new Event('error'))
  })
}

beforeEach(() => {
  config = null
  renderButton.mockReset()
  window.google = {
    accounts: {
      id: {
        initialize: (c) => {
          config = c
        },
        renderButton,
        disableAutoSelect: () => {},
      },
    },
  }
  vi.spyOn(api, 'authProviders').mockResolvedValue({ googleClientId: 'client-123' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete window.google
})

describe('GoogleSignInButton', () => {
  it("hides itself when Google's script cannot be loaded, leaving the email form", async () => {
    show()
    await scriptLoads(false)

    expect(screen.queryByText('hoặc')).toBeNull()
    expect(screen.getByRole('form', { name: 'Form email' })).toBeTruthy()
    expect(googleScript()).toBeNull() // removed, so a later visit can try again
  })

  it('renders Google\'s button in Vietnamese ("Đăng nhập bằng Google"), then "hoặc" above the email form', async () => {
    show()
    await scriptLoads(true)

    expect(config?.client_id).toBe('client-123')
    expect(renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ locale: 'vi', text: 'signin_with' }),
    )
    expect(screen.getByText('hoặc')).toBeTruthy()
    expect(screen.getByText('Ghi chú')).toBeTruthy()
  })

  it('says "Đăng ký bằng Google" on the sign-up page', async () => {
    show(vi.fn(), 'signup_with')
    await waitFor(() => expect(renderButton).toHaveBeenCalled())

    expect(renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ locale: 'vi', text: 'signup_with' }),
    )
  })

  it('sends the credential once, even if Google calls back twice while it is being exchanged', async () => {
    let finish: () => void = () => {}
    const onCredential = vi.fn(() => new Promise<void>((r) => (finish = r)))
    show(onCredential)
    await waitFor(() => expect(config).not.toBeNull())

    // Not returning the callbacks' promises: the exchange stays pending until finish()
    await act(async () => {
      void config!.callback({ credential: 'id-token' })
      void config!.callback({ credential: 'id-token' })
    })

    expect(onCredential).toHaveBeenCalledTimes(1)
    expect(onCredential).toHaveBeenCalledWith('id-token')
    expect(screen.getByText('Đang đăng nhập với Google...')).toBeTruthy()
    await act(async () => finish())
    expect(screen.queryByText('Đang đăng nhập với Google...')).toBeNull()
  })

  it('shows a refusal as a toast', async () => {
    show(() => Promise.reject(new Error('Đăng nhập Google không thành công. Vui lòng thử lại.')))
    await waitFor(() => expect(config).not.toBeNull())

    await act(async () => config!.callback({ credential: 'bad' }))

    expect(await screen.findByText('Đăng nhập Google không thành công. Vui lòng thử lại.')).toBeTruthy()
  })

  it('renders nothing when Google sign-in is not configured', async () => {
    vi.mocked(api.authProviders).mockResolvedValue({ googleClientId: null })
    const { container } = render(
      <ToastProvider>
        <GoogleSignInButton text="signin_with" onCredential={vi.fn()} />
      </ToastProvider>,
    )

    await waitFor(() => expect(api.authProviders).toHaveBeenCalled())
    await act(async () => {})
    expect(container.textContent).toBe('')
    expect(config).toBeNull()
  })
})
