// Minimal typings for the parts of Google Identity Services we use.
// https://developers.google.com/identity/gsi/web/reference/js-reference

interface GoogleCredentialResponse {
  credential: string
}

interface GoogleButtonOptions {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number
  locale?: string
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize(config: {
          client_id: string
          callback: (response: GoogleCredentialResponse) => void
          ux_mode?: 'popup' | 'redirect'
        }): void
        renderButton(parent: HTMLElement, options: GoogleButtonOptions): void
        disableAutoSelect(): void
      }
    }
  }
}
