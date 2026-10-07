export const LOGIN_PATH = '/dang-nhap'
export const REGISTER_PATH = '/dang-ky'
export const FORGOT_PASSWORD_PATH = '/quen-mat-khau'
export const RESET_PASSWORD_PATH = '/dat-lai-mat-khau'

/** Sending the user back to these after login would loop or make no sense. */
const AUTH_PAGES = new Set([LOGIN_PATH, REGISTER_PATH, FORGOT_PASSWORD_PATH, RESET_PASSWORD_PATH])

/**
 * Validates a `?next=` value so it can only point inside this site (prevents open redirects such as
 * `?next=//evil.com` or `?next=https://evil.com`). Anything suspicious falls back to the home page.
 */
export function safeNextPath(raw: string | null | undefined, origin: string = window.location.origin): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  try {
    // The URL parser also normalizes tricks like "/\t/evil.com" before we compare origins.
    const url = new URL(raw, origin)
    if (url.origin !== origin || AUTH_PAGES.has(url.pathname)) return '/'
    return url.pathname + url.search + url.hash
  } catch {
    return '/'
  }
}

/** Login URL that brings the user back to `path` afterwards. */
export function loginUrl(path: string): string {
  return path === '/' ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(path)}`
}

/** Keeps the `?next=` target when switching between the login and register pages. */
export function withNext(page: string, next: string): string {
  return next === '/' ? page : `${page}?next=${encodeURIComponent(next)}`
}
