import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { FACEBOOK_PATH, MESSENGER_PATH, SHOPEE_PATH, TIKTOK_PATH, ZALO_PATH } from '../lib/brandIcons'
import { FINE_POINTER, useMediaQuery } from '../lib/media'
import { telHref, useSiteInfo, type SiteInfo } from '../lib/siteInfo'

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
  /** null: not configured yet, the icon leads to /lien-he */
  href: string | null
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
 * Facebook, Shopee, Zalo and TikTok are always shown (until a link is configured they lead to /lien-he);
 * Messenger and the hotline only when configured.
 */
function itemsOf(site: SiteInfo | null): Item[] {
  const social = site?.social
  const contact = site?.contact
  const network = (key: string, name: string, href: string | null | undefined, color: string, icon: ReactNode): Item => ({
    key,
    href: href ?? null,
    label: href ? name : `${name} – đang cập nhật`,
    ariaLabel: href ? `Hạt Lành trên ${name}` : `Hạt Lành trên ${name}: đang cập nhật, xem trang Liên hệ`,
    background: { backgroundColor: color },
    ring: color === '#000000' ? '#525252' : color,
    icon,
    external: Boolean(href),
  })
  const items: Item[] = [
    network('facebook', 'Facebook', social?.facebookUrl, '#0866ff', <BrandIcon path={FACEBOOK_PATH} className="size-5" />),
    network('shopee', 'Shopee', social?.shopeeUrl, '#ee4d2d', <BrandIcon path={SHOPEE_PATH} className="size-5" />),
    network('zalo', 'Zalo', social?.zaloUrl ?? contact?.zaloUrl, '#0068ff', <BrandIcon path={ZALO_PATH} className="size-7" />),
    network('tiktok', 'TikTok', social?.tiktokUrl, '#000000', <BrandIcon path={TIKTOK_PATH} className="size-5" />),
  ]
  if (contact?.messengerUrl) {
    items.push({
      key: 'messenger',
      href: contact.messengerUrl,
      label: 'Messenger',
      ariaLabel: 'Nhắn Messenger cho Hạt Lành',
      background: { backgroundImage: MESSENGER_GRADIENT },
      ring: '#a033ff',
      icon: <BrandIcon path={MESSENGER_PATH} className="size-5" />,
      external: true,
    })
  }
  if (contact?.hotline) {
    items.push({
      key: 'call',
      href: telHref(contact.hotline),
      label: `Gọi ${contact.hotline}`,
      ariaLabel: `Gọi Hạt Lành ${contact.hotline}`,
      background: { backgroundColor: 'var(--color-brand-600)' },
      ring: 'var(--color-brand-500)',
      icon: <PhoneIcon className="size-5" />,
      external: false,
    })
  }
  return items
}

/**
 * Column of round contact icons fixed in the bottom right corner of every storefront page (it stays put while the
 * shopper navigates). Not in the back office. Sits under modals and drawers (z-30). Its height is published as
 * --floating-contact-space so the end of the page and the toasts keep clear of it. Motion: CSS in index.css (.fc-*).
 */
export default function FloatingContact() {
  const site = useSiteInfo()
  const { pathname } = useLocation()
  const desktop = useMediaQuery(FINE_POINTER)
  const column = useRef<HTMLUListElement>(null)
  const visible = !pathname.startsWith('/admin')

  useEffect(() => {
    const el = column.current
    if (!visible || !el) return
    const root = document.documentElement
    const publish = () => root.style.setProperty('--floating-contact-space', `${Math.ceil(el.getBoundingClientRect().height) + 24}px`)
    publish()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null
    observer?.observe(el)
    return () => {
      observer?.disconnect()
      root.style.removeProperty('--floating-contact-space')
    }
  }, [visible])

  if (!visible) return null

  return (
    <nav aria-label="Liên hệ và mạng xã hội" className="fc pointer-events-none fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30">
      <ul ref={column} className="flex flex-col items-end gap-2 sm:gap-2.5">
        {itemsOf(site).map((item, i) => {
          const body = (
            <>
              <span className="fc-label pointer-events-none absolute right-full mr-3 rounded-full bg-white px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-stone-800 shadow-md">
                {item.label}
              </span>
              <span className="fc-dot relative flex size-10 items-center justify-center rounded-full text-white shadow-md sm:size-11" style={item.background}>
                {item.icon}
              </span>
            </>
          )
          const className =
            'fc-link pointer-events-auto relative flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700'
          return (
            <li
              key={item.key}
              className="fc-item"
              // Position among the shown icons (hidden channels take no turn): staggers the entrance and the idle hop
              style={{ '--fc-i': i, '--fc-ring': item.ring } as CSSProperties}
            >
              {item.href === null ? (
                <Link to="/lien-he" aria-label={item.ariaLabel} className={className}>
                  {body}
                </Link>
              ) : (
                <a
                  href={item.href}
                  aria-label={item.ariaLabel}
                  // Desktop: new tab; phones open the link directly so the app can take it
                  {...(item.external && desktop ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className={className}
                >
                  {body}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
