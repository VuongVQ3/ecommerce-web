import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { FACEBOOK_PATH, MESSENGER_PATH, ZALO_PATH } from '../lib/brandIcons'
import { FINE_POINTER, useMediaQuery } from '../lib/media'
import { useFloatingHidden } from '../lib/overlay'
import { SHOP } from '../lib/shopContact'
import { useSiteInfo, type SiteInfo } from '../lib/siteInfo'
import BackToTop from './BackToTop'

/** Messenger's official gradient (brand resources). */
const MESSENGER_GRADIENT = 'radial-gradient(circle at 19% 99%, #0099ff 0%, #a033ff 61%, #ff5280 93%, #ff7061 100%)'

function BrandIcon({ path, className }: { path: string; className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d={path} />
    </svg>
  )
}

function PhoneIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
    </svg>
  )
}

interface Item {
  key: string
  /** External link or tel: */
  href: string
  label: string
  ariaLabel: string
  background: CSSProperties
  /** Colour of the idle pulse ring */
  ring: string
  icon: ReactNode
  /** Opens another site/app (new tab on desktop) */
  external: boolean
}

/**
 * Top to bottom: Facebook, Zalo, Messenger (only when MESSENGER_PAGE is set on the server), then the hotline. Facebook,
 * Zalo and the hotline are the published details (lib/shopContact), like the footer and the policy pages. No Shopee or
 * TikTok: the shop has none yet.
 */
function itemsOf(site: SiteInfo | null): Item[] {
  const items: Item[] = [
    {
      key: 'facebook',
      href: SHOP.fanpage,
      label: 'Facebook',
      ariaLabel: 'Hạt Lành trên Facebook',
      background: { backgroundColor: '#0866ff' },
      ring: '#0866ff',
      icon: <BrandIcon path={FACEBOOK_PATH} className="size-5" />,
      external: true,
    },
    {
      key: 'zalo',
      href: SHOP.zalo,
      label: 'Zalo',
      ariaLabel: 'Nhắn Zalo cho Hạt Lành',
      background: { backgroundColor: '#0068ff' },
      ring: '#0068ff',
      icon: <BrandIcon path={ZALO_PATH} className="size-7" />,
      external: true,
    },
  ]
  if (site?.contact?.messengerUrl) {
    items.push({
      key: 'messenger',
      href: site.contact.messengerUrl,
      label: 'Messenger',
      ariaLabel: 'Nhắn Messenger cho Hạt Lành',
      background: { backgroundImage: MESSENGER_GRADIENT },
      ring: '#a033ff',
      icon: <BrandIcon path={MESSENGER_PATH} className="size-5" />,
      external: true,
    })
  }
  items.push({
    key: 'call',
    href: SHOP.phoneHref,
    label: `Gọi ${SHOP.phone}`,
    ariaLabel: `Gọi Hạt Lành ${SHOP.phone}`,
    background: { backgroundColor: 'var(--color-brand-600)' },
    ring: 'var(--color-brand-500)',
    icon: <PhoneIcon className="size-5" />,
    external: false,
  })
  return items
}

function ChatIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z" strokeLinejoin="round" />
      <path d="M8.5 8.5h7M8.5 11.5h4.5" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={className}>
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Contact icons fixed in the bottom right corner of every storefront page (they stay put while the shopper
 * navigates): Facebook, Zalo, Messenger when configured, the hotline (see itemsOf). Not in the back office. Sits under modals and
 * drawers (z-30).
 * - From 1280px: a column of icons, always visible.
 * - Under 1280px (phones, tablets, small laptops: the column covered the product cards): one 48px chat button;
 *   tapping it opens the channels in a column above it, with their names (Esc or a tap outside closes).
 * The "Lên đầu trang" button (BackToTop) shares the corner: under the column, on phones right above the chat button;
 * it stays there even with no channel to show. The column only fits in the margin beside the content from 1280px.
 * Motion: CSS in index.css (.fc-*).
 */
export default function FloatingContact() {
  const site = useSiteInfo()
  const { pathname } = useLocation()
  const desktop = useMediaQuery(FINE_POINTER)
  const wide = useMediaQuery('(min-width: 1280px)')
  const listId = useId()
  const root = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const column = useRef<HTMLUListElement>(null)
  // Compact mode: open on the page where it was opened only (following a link closes it)
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = !wide && openOn === pathname
  // An open combobox list needs the corner: the whole stack hides (no clicks, no focus, not read) until it closes
  const hidden = useFloatingHidden()

  const items = itemsOf(site)
  const visible = !pathname.startsWith('/admin')
  const hasItems = items.length > 0

  const close = useCallback((returnFocus: boolean) => {
    setOpenOn(null)
    if (returnFocus) toggle.current?.focus()
  }, [])

  // Compact mode, list open: focus the first channel; Esc or a tap outside closes
  useEffect(() => {
    if (!open) return
    column.current?.querySelector<HTMLElement>('a')?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(true)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  if (!visible) return null

  return (
    <nav
      ref={root}
      aria-label="Liên hệ và mạng xã hội"
      data-compact={wide ? undefined : ''}
      data-open={open ? '' : undefined}
      data-hidden={hidden ? '' : undefined}
      aria-hidden={hidden || undefined}
      inert={hidden}
      className="fc pointer-events-none fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-end gap-3"
    >
      {hasItems && (
        <ul ref={column} id={listId} className="flex flex-col items-end gap-2 sm:gap-2.5" inert={!wide && !open}>
          {items.map((item, i) => (
            <li
              key={item.key}
              className="fc-item"
              // Position among the shown icons: staggers the entrance, the idle hop, and (phones) opening/closing
              style={
                {
                  '--fc-i': i,
                  '--fc-ring': item.ring,
                  '--fc-open-delay': `${(items.length - 1 - i) * 50}ms`,
                  '--fc-close-delay': `${i * 30}ms`,
                } as CSSProperties
              }
            >
              <a
                href={item.href}
                aria-label={item.ariaLabel}
                // Desktop: new tab; phones open the link directly so the app can take it
                {...(item.external && desktop ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                onClick={() => setOpenOn(null)}
                className="fc-link pointer-events-auto relative flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                <span className="fc-label pointer-events-none absolute right-full mr-3 rounded-full bg-white px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-stone-800 shadow-md">
                  {item.label}
                </span>
                <span className="fc-dot relative flex size-10 items-center justify-center rounded-full text-white shadow-md sm:size-11" style={item.background}>
                  {item.icon}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <BackToTop />
      {!wide && hasItems && (
        <button
          ref={toggle}
          type="button"
          onClick={() => (open ? close(true) : setOpenOn(pathname))}
          aria-label="Liên hệ Hạt Lành"
          aria-expanded={open}
          aria-controls={listId}
          className="fc-link fc-toggle pointer-events-auto relative flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          style={{ '--fc-i': 0, '--fc-ring': 'var(--color-brand-500)' } as CSSProperties}
        >
          <span className="fc-dot relative flex size-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg">
            <span className="fc-icon fc-icon-chat absolute inset-0 flex items-center justify-center">
              <ChatIcon className="size-6" />
            </span>
            <span className="fc-icon fc-icon-close absolute inset-0 flex items-center justify-center">
              <CloseIcon className="size-6" />
            </span>
          </span>
        </button>
      )}
    </nav>
  )
}
