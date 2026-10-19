import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, ApiError, onSessionExpired, type LoginInput, type RegisterInput, type User } from '../lib/api'
import { loginUrl } from '../lib/redirect'

interface AuthContextValue {
  user: User | null
  /** True until we know whether the visitor is signed in (first definite /me answer: a user or a 401). */
  loading: boolean
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  /** `credential` is the ID token returned by Google Identity Services. */
  loginWithGoogle: (credential: string) => Promise<void>
  logout: () => Promise<void>
  /** The server already signed this user in (cookies set), e.g. after creating an account from an order. */
  signedIn: (user: User) => void
  /**
   * Asks the backend again who is signed in (the cookies may have changed in another tab) and returns that user.
   * A network error or 5xx leaves the state as it was (and returns it): only a 401 means "signed out".
   */
  refresh: () => Promise<User | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Tabs tell each other about sign-in / sign-out; the others then ask /me again. */
export const AUTH_CHANNEL = 'hatlanh-auth'
/** Fallback when BroadcastChannel is missing: a storage event on this key */
export const AUTH_PING_KEY = 'hatlanh_auth_ping'
/** Coming back to the tab checks the session again, at most this often */
export const REFOCUS_CHECK_MS = 30_000
/** The first check failed for another reason than "not signed in" (server down, network): retry after these */
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000]

function tellOtherTabs() {
  try {
    if (typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel(AUTH_CHANNEL)
      channel.postMessage('changed')
      channel.close()
    } else {
      localStorage.setItem(AUTH_PING_KEY, String(Date.now()))
    }
  } catch {
    // Storage blocked: the other tabs still catch up when they are shown again
  }
}

/**
 * Session state. Tokens are httpOnly cookies the page cannot read, so "signed in" is learned by asking the backend
 * (GET /api/auth/me, which transparently refreshes an expired access token). The answer is kept in step with the
 * cookies: checked again when the tab is shown again (at most every 30 s) and when another tab signs in or out.
 * Network errors and 5xx never count as "signed out"; the first check is retried until it gets an answer. Must be
 * rendered inside the router.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const userRef = useRef<User | null>(null)
  const lastCheck = useRef(0)

  const apply = useCallback((next: User | null) => {
    userRef.current = next
    setUser(next)
    setLoading(false)
  }, [])

  /** The user, null after a 401, or undefined when the answer is unknown (network error, 5xx, aborted). */
  const check = useCallback(
    async (signal?: AbortSignal): Promise<User | null | undefined> => {
      lastCheck.current = Date.now()
      try {
        const me = await api.me(signal)
        if (signal?.aborted) return undefined
        apply(me)
        return me
      } catch (err) {
        if (signal?.aborted) return undefined
        if (err instanceof ApiError && err.status === 401) {
          apply(null)
          return null
        }
        return undefined
      }
    },
    [apply],
  )

  const refresh = useCallback(async () => {
    const result = await check()
    return result === undefined ? userRef.current : result
  }, [check])

  // First check, retried while the answer is unknown
  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    const attempt = async (n: number) => {
      const result = await check(controller.signal)
      if (result === undefined && !controller.signal.aborted) {
        timer = window.setTimeout(() => void attempt(n + 1), RETRY_DELAYS_MS[Math.min(n, RETRY_DELAYS_MS.length - 1)])
      }
    }
    void attempt(0)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [check])

  // Back to this tab: the session may have changed meanwhile (another tab, expiry)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current >= REFOCUS_CHECK_MS) void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [check])

  // Another tab signed in or out
  useEffect(() => {
    const onPing = () => void check()
    let channel: BroadcastChannel | null = null
    try {
      if (typeof BroadcastChannel === 'function') {
        channel = new BroadcastChannel(AUTH_CHANNEL)
        channel.onmessage = onPing
      }
    } catch {
      channel = null
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_PING_KEY) onPing()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      channel?.close()
      window.removeEventListener('storage', onStorage)
    }
  }, [check])

  // When a request fails because the session can no longer be refreshed, go to login and come back afterwards.
  const locationRef = useRef(location)
  useEffect(() => {
    locationRef.current = location
  })
  useEffect(
    () =>
      onSessionExpired(() => {
        apply(null)
        const { pathname, search, hash } = locationRef.current
        navigate(loginUrl(pathname + search + hash), { replace: true })
      }),
    [navigate, apply],
  )

  const signedIn = useCallback(
    (next: User) => {
      apply(next)
      tellOtherTabs()
    },
    [apply],
  )

  const login = useCallback(async (input: LoginInput) => signedIn(await api.login(input)), [signedIn])

  const register = useCallback(async (input: RegisterInput) => signedIn(await api.register(input)), [signedIn])

  const loginWithGoogle = useCallback(
    async (credential: string) => signedIn(await api.loginWithGoogle(credential)),
    [signedIn],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      apply(null)
      tellOtherTabs()
      // Stop Google from silently signing the user back in on the next visit
      window.google?.accounts.id.disableAutoSelect()
    }
  }, [apply])

  const value = useMemo(
    () => ({ user, loading, login, register, loginWithGoogle, logout, signedIn, refresh }),
    [user, loading, login, register, loginWithGoogle, logout, signedIn, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
