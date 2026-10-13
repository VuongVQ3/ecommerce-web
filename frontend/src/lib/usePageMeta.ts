import { useEffect } from 'react'

export const BRAND = 'Hạt Lành'

/**
 * Keeps the tab title (and meta description) in step with client-side navigation. The server already wrote the
 * right values for the first load; this covers moving between pages without a reload.
 */
export function usePageMeta(title: string | null | undefined, description?: string | null) {
  useEffect(() => {
    if (!title) return
    document.title = title
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description)
  }, [title, description])
}
