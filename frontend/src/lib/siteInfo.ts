import { useEffect, useState } from 'react'
import { apiRequest } from './api'

/** Business details from the server config (BUSINESS_* variables). Missing keys = not configured: hide them. */
export interface Business {
  ownerName?: string
  address?: string
  registrationNumber?: string
  hotline?: string
  email?: string
  /** Link to the shop's notification on online.gov.vn (Bộ Công Thương) */
  moitUrl?: string
}

/** Floating contact button links (ZALO_PHONE, MESSENGER_PAGE, BUSINESS_HOTLINE); null = not configured. */
export interface Contact {
  zaloUrl: string | null
  messengerUrl: string | null
  hotline: string | null
}

/** Footer icons (FACEBOOK_URL, SHOPEE_URL, ZALO_PHONE, TIKTOK_URL); null = not configured. */
export interface SocialLinks {
  facebookUrl: string | null
  shopeeUrl: string | null
  zaloUrl: string | null
  tiktokUrl: string | null
}

export interface SiteInfo {
  siteUrl: string
  business: Business
  /** Absent from servers older than the floating contact button */
  contact?: Contact
  /** Absent from servers older than the footer icons */
  social?: SocialLinks
  /**
   * Version of the policies consents are recorded against, "2026-11-03" (PolicyVersion.CURRENT, the only place it is
   * set): checkout asks an account that agreed to another version again. Not the pages' "Cập nhật lần cuối" date
   * (UPDATED in lib/policyDates.ts). Absent from older servers.
   */
  policyVersion?: string
}

/** "2026-11-03" → "03/11/2026"; null for anything else. */
export function formatPolicyVersion(version: string | undefined): string | null {
  const m = version?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

let cached: Promise<SiteInfo | null> | null = null

/** Loaded once per page load and shared (footer and contact page). Failures just hide the details. */
export function loadSiteInfo(): Promise<SiteInfo | null> {
  cached ??= apiRequest<SiteInfo>('/api/site', { redirectOnAuthFailure: false }).catch(() => {
    cached = null
    return null
  })
  return cached
}

export function useSiteInfo(): SiteInfo | null {
  const [info, setInfo] = useState<SiteInfo | null>(null)
  useEffect(() => {
    let alive = true
    loadSiteInfo().then((data) => alive && setInfo(data))
    return () => {
      alive = false
    }
  }, [])
  return info
}

/**
 * What the pages promise about shipping: free standard shipping on every order (owner's decision, 11/2026). Static
 * text, not from the API; the server setting cart.shipping-fee decides what is charged, so change both together (and
 * the Chính sách vận chuyển page).
 */
export const SHIPPING_PROMISE = {
  /** Under the hero, in the quick cart and the cart page */
  short: 'Miễn phí giao hàng toàn quốc',
  /** The statistics tile of the home page */
  stat: { value: 'Freeship', label: 'mọi đơn hàng toàn quốc' },
  /** The call to action at the end of the home page */
  cta: 'Miễn phí giao hàng toàn quốc cho mọi đơn. Đóng gói 500 g, giao tận nơi.',
  /** Under the checkout total, followed by a link to the shipping policy */
  checkout:
    'Miễn phí giao hàng tiêu chuẩn toàn quốc. Giao hỏa tốc nội thành TP.HCM tính theo cước thực tế; nhân viên sẽ gọi báo phí trước khi gửi',
} as const

/** "0912 345 678" → "tel:0912345678"; keeps a leading +. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
