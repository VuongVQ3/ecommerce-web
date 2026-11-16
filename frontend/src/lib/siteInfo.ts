import { useEffect, useState } from 'react'
import { apiRequest } from './api'
import { formatPrice } from './format'

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
  /** Standard shipping fee and free-shipping threshold. Absent from servers older than 16/11/2026 */
  shipping?: Shipping
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

/** Standard shipping as the server charges it (cart.shipping-fee / cart.free-shipping-threshold), in VND. */
export interface Shipping {
  /** Below the threshold; 0 = free on every order */
  fee: number
  /** Subtotal from which shipping is free; 0 = no threshold */
  freeThreshold: number
}

export interface ShippingPromise {
  /** Under the hero */
  short: string
  /** The statistics tile of the home page (`short`: its label under 640px) */
  stat: { value: string; label: string; short: string }
  /** The call to action at the end of the home page */
  cta: string
}

/**
 * What the pages promise about shipping, worded from the numbers the server charges (never written in the code), so
 * the promise always matches the cart. The Chính sách vận chuyển page states the rule in its own words.
 */
export function shippingPromise({ fee, freeThreshold }: Shipping): ShippingPromise {
  if (fee === 0) {
    return {
      short: 'Miễn phí giao hàng toàn quốc',
      stat: { value: 'Freeship', label: 'mọi đơn hàng toàn quốc', short: 'toàn quốc' },
      cta: 'Miễn phí giao hàng toàn quốc cho mọi đơn. Đóng gói 500 g, giao tận nơi.',
    }
  }
  if (freeThreshold > 0) {
    const from = formatPrice(freeThreshold)
    return {
      short: `Miễn phí giao hàng cho đơn từ ${from}`,
      stat: { value: 'Freeship', label: `cho đơn từ ${from}`, short: `đơn từ ${from}` },
      cta: `Miễn phí giao hàng cho đơn từ ${from}. Đóng gói 500 g, giao tận nơi toàn quốc.`,
    }
  }
  return {
    short: `Giao hàng toàn quốc, phí ${formatPrice(fee)}`,
    stat: { value: 'Toàn quốc', label: 'giao hàng tận nơi', short: 'giao tận nơi' },
    cta: 'Đóng gói 500 g, giao tận nơi toàn quốc.',
  }
}

/** The shipping promise once /api/site has answered; null before (or from an older server): say nothing yet. */
export function useShippingPromise(): ShippingPromise | null {
  const shipping = useSiteInfo()?.shipping
  return shipping ? shippingPromise(shipping) : null
}

/** In the carts when no order pays a fee (cart view freeShippingForAll) */
export const FREE_FOR_ALL_SHORT = 'Miễn phí giao hàng toàn quốc'

/** Under the checkout total when no order pays a fee */
export const FREE_FOR_ALL_CHECKOUT_NOTE =
  'Miễn phí giao hàng tiêu chuẩn toàn quốc. Giao hỏa tốc nội thành TP.HCM tính theo cước thực tế; nhân viên sẽ gọi báo phí trước khi gửi'

/** "0912 345 678" → "tel:0912345678"; keeps a leading +. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
