import { useCallback, useEffect, useState } from 'react'

interface AsyncState<T> {
  data?: T
  error?: Error
  loading: boolean
}

/**
 * Runs `load` whenever `deps` change and aborts the previous request.
 * Keeps the previous data while reloading so lists don't flash empty.
 */
export function useAsync<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ loading: true })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState((s) => ({ data: s.data, loading: true }))
    load(controller.signal).then(
      (data) => setState({ data, loading: false }),
      (error: Error) => {
        if (!controller.signal.aborted) setState({ error, loading: false })
      },
    )
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...state, reload }
}
