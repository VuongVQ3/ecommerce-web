/**
 * One request per key for a short while: components (or React's StrictMode double effects, or a remount after the
 * session refresh) asking for the same data at the same time share a single fetch. Failures are not kept.
 * Requests are not aborted when one caller goes away, since others may still be waiting for them.
 */
const entries = new Map<string, { promise: Promise<unknown>; at: number }>()

export function sharedRequest<T>(key: string, load: () => Promise<T>, ttlMs = 30_000): Promise<T> {
  const hit = entries.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T>
  const promise = load()
  entries.set(key, { promise, at: Date.now() })
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key)
  })
  return promise
}

/** Tests: start from an empty cache. */
export function clearSharedRequests() {
  entries.clear()
}
