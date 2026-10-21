// Minimal typings for Cloudflare Turnstile's explicit rendering API.
// https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/

interface TurnstileRenderOptions {
  sitekey: string
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: (code: string) => void
  /** "always": visible all the time; "interaction-only": invisible unless Cloudflare needs the visitor to click. */
  appearance?: 'always' | 'execute' | 'interaction-only'
  /** normal: 300 × 65 px; compact: 150 × 140 px; flexible: full width, at least 300 px */
  size?: 'normal' | 'compact' | 'flexible'
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
