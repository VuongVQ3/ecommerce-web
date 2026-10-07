import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, onSessionExpired, type LoginInput, type RegisterInput, type User } from '../lib/api'
import { loginUrl } from '../lib/redirect'

interface AuthContextValue {
  user: User | null
  /** True until we know whether the visitor is signed in (initial /me check). */
  loading: boolean
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  /** `credential` is the ID token returned by Google Identity Services. */
  loginWithGoogle: (credential: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Session state. Tokens are httpOnly cookies the page cannot read, so "signed in" is learned by asking the backend
 * (GET /api/auth/me, which transparently refreshes an expired access token). Must be rendered inside the router.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    api
      .me(controller.signal)
      .then(setUser, () => {
        if (!controller.signal.aborted) setUser(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  // When a request fails because the session can no longer be refreshed, go to login and come back afterwards.
  const locationRef = useRef(location)
  useEffect(() => {
    locationRef.current = location
  })
  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null)
        const { pathname, search, hash } = locationRef.current
        navigate(loginUrl(pathname + search + hash), { replace: true })
      }),
    [navigate],
  )

  const login = useCallback(async (input: LoginInput) => setUser(await api.login(input)), [])

  const register = useCallback(async (input: RegisterInput) => setUser(await api.register(input)), [])

  const loginWithGoogle = useCallback(
    async (credential: string) => setUser(await api.loginWithGoogle(credential)),
    [],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
      // Stop Google from silently signing the user back in on the next visit
      window.google?.accounts.id.disableAutoSelect()
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, loginWithGoogle, logout }),
    [user, loading, login, register, loginWithGoogle, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
