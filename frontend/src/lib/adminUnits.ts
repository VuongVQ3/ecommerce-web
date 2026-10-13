import { useEffect, useState } from 'react'

/** [wardCode, wardName] */
export type Ward = [number, string]

export interface Province {
  code: number
  name: string
  wards: Ward[]
}

/**
 * Vietnam's administrative units since the 2025-07-01 reform (34 provinces → wards; no districts), from the
 * static src/data/vn-admin-units.json. Loaded on demand (~90 KB) so only the checkout page pays for it.
 * The backend validates against an identical copy.
 */
let cache: Promise<Province[]> | null = null

export function loadProvinces(): Promise<Province[]> {
  cache ??= import('../data/vn-admin-units.json').then((m) => m.default.provinces as Province[])
  return cache
}

export function useProvinces(): Province[] | null {
  const [provinces, setProvinces] = useState<Province[] | null>(null)
  useEffect(() => {
    let active = true
    loadProvinces().then((p) => active && setProvinces(p))
    return () => {
      active = false
    }
  }, [])
  return provinces
}
