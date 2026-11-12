import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { ApiError } from '../lib/api'
import ForbiddenPage from '../pages/ForbiddenPage'
import { authorApi, type AuthorSession } from './authorApi'

const AuthorSessionContext = createContext<AuthorSession | null>(null)

type State = { status: 'loading' } | { status: 'ready'; session: AuthorSession } | { status: 'forbidden' } | { status: 'error'; message: string }

/**
 * Asks the backend once, on entering /author, what the user may do there, and gives it to every page below. A 403
 * shows the forbidden page; any other failure (network, server) a message with a retry button.
 */
export function AuthorSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    authorApi
      .session(controller.signal)
      .then((session) => setState({ status: 'ready', session }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (err instanceof ApiError && err.status === 403) setState({ status: 'forbidden' })
        else
          setState({
            status: 'error',
            message: err instanceof ApiError ? err.message : 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.',
          })
      })
    return () => controller.abort()
  }, [attempt])

  if (state.status === 'loading') return <Spinner label="Đang mở môi trường soạn thảo..." />
  if (state.status === 'forbidden') return <ForbiddenPage />
  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <ErrorMessage message={state.message} onRetry={retry} />
      </div>
    )
  }
  return <AuthorSessionContext.Provider value={state.session}>{children}</AuthorSessionContext.Provider>
}

/** The Author permissions of the signed-in user (only inside AuthorSessionProvider). */
// eslint-disable-next-line react/only-export-components
export function useAuthorSession(): AuthorSession {
  const session = useContext(AuthorSessionContext)
  if (!session) throw new Error('useAuthorSession must be used inside AuthorSessionProvider')
  return session
}
