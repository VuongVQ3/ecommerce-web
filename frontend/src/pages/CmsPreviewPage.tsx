import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { DeliveredPage } from '../cms/pageTypes'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { apiRequest } from '../lib/api'
import { CmsPageView } from './CmsPage'

/**
 * /author/preview?token=…: the working copy of a CMS page for whoever holds the link (no sign-in), rendered exactly
 * like the live page with a "preview" ribbon. The server marks the page noindex and lets only the editor frame it.
 */
export default function CmsPreviewPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [page, setPage] = useState<DeliveredPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<DeliveredPage>(`/api/content/preview/pages?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
      redirectOnAuthFailure: false,
    }).then(
      (p) => {
        setPage(p)
        setError(null)
      },
      () => !controller.signal.aborted && setError('Link xem trước không hợp lệ hoặc đã hết hạn.'),
    )
    return () => controller.abort()
  }, [token])

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <ErrorMessage message={error} />
      </div>
    )
  }
  if (!page) return <Spinner label="Đang tải bản xem trước..." />
  return (
    <>
      <p className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900" role="status">
        Bản xem trước (chưa publish) · {page.path}
      </p>
      <CmsPageView page={page} />
    </>
  )
}
