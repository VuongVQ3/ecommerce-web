/**
 * Data the server wrote into the page (HtmlPages: <script type="application/json" id="initial-data">), so the first
 * render needs no API call. Used once: after the page that matched has mounted, later visits load fresh data.
 */
interface InitialData {
  type: string
  slug: string
  data: unknown
}

let consumed = false

function read(): InitialData | null {
  if (consumed || typeof document === 'undefined') return null
  const el = document.getElementById('initial-data')
  if (!el?.textContent) return null
  try {
    return JSON.parse(el.textContent) as InitialData
  } catch {
    return null
  }
}

/**
 * The embedded data when it is of this type and for this slug (the address the visitor landed on); null otherwise.
 * Does not use it up (React may call a state initializer twice): call consumeInitialData() once mounted.
 */
export function peekInitialData<T>(type: string, slug: string): T | null {
  const found = read()
  return found && found.type === type && found.slug === slug ? (found.data as T) : null
}

export function consumeInitialData() {
  consumed = true
}

/** Tests only. */
export function resetInitialData() {
  consumed = false
}
