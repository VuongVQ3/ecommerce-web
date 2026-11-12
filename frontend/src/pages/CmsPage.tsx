import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import BlockRenderer from '../cms/BlockRenderer'
import type { DeliveredPage } from '../cms/pageTypes'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { ApiError, apiRequest } from '../lib/api'
import { consumeInitialData, peekInitialData } from '../lib/initialData'
import { BRAND, usePageMeta } from '../lib/usePageMeta'
import NotFoundPage from './NotFoundPage'

/** What was loaded, for which path (anything for another path means "loading"). */
type Result = { path: string; attempt: number } & ({ status: 'ready'; page: DeliveredPage } | { status: 'missing' } | { status: 'error'; message: string })

const normalize = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path)

/** A rendered CMS page: its title for screen readers and its blocks. Also used by the preview. */
export function CmsPageView({ page }: { page: DeliveredPage }) {
  usePageMeta(`${page.properties.seoTitle || page.title} | ${BRAND}`, page.properties.seoDescription)
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="sr-only">{page.title}</h1>
      <BlockRenderer blocks={page.regions.main} />
    </div>
  )
}

/**
 * Every address no other route takes: a published CMS page (the server sends its content along on the first load),
 * otherwise the "page not found" screen.
 */
export default function CmsPage() {
  const path = normalize(useLocation().pathname)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result | null>(() => {
    const initial = peekInitialData<DeliveredPage>('cmsPage', path)
    return initial ? { path, attempt: 0, status: 'ready', page: initial } : null
  })
  const current = result && result.path === path && result.attempt === attempt ? result : null

  useEffect(() => {
    consumeInitialData()
  }, [])

  useEffect(() => {
    if (current) return
    const controller = new AbortController()
    apiRequest<DeliveredPage>(`/api/content/pages?path=${encodeURIComponent(path)}`, { signal: controller.signal, redirectOnAuthFailure: false }).then(
      (page) => setResult({ path, attempt, status: 'ready', page }),
      (err: Error) => {
        if (controller.signal.aborted) return
        if (err instanceof ApiError && err.status === 404) setResult({ path, attempt, status: 'missing' })
        else setResult({ path, attempt, status: 'error', message: err.message })
      },
    )
    return () => controller.abort()
  }, [current, path, attempt])

  if (!current) return <Spinner />
  if (current.status === 'missing') return <NotFoundPage />
  if (current.status === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <ErrorMessage message={current.message} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    )
  }
  return <CmsPageView page={current.page} />
}
