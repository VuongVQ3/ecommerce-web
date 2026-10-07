// Minimal typings for Cloudflare Turnstile's explicit rendering API.
// https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/

interface TurnstileRenderOptions {
  sitekey: string
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: (code: string) => void
  /** "interaction-only": stays invisible unless Cloudflare needs the visitor to click. */
  appearance?: 'always' | 'execute' | 'interaction-only'
  language?: string
  action?: string
}

interface Window {
  turnstile?: {
    render(container: HTMLElement, options: TurnstileRenderOptions): string
    reset(widgetId: string): void
    remove(widgetId: string): void
  }
}
