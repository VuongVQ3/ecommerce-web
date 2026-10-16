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

/** "0912 345 678" → "tel:0912345678"; keeps a leading +. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
