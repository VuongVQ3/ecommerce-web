import { useSearchParams } from 'react-router'
import BlogCard from '../components/BlogCard'
import { ErrorMessage, Spinner } from '../components/Feedback'
import Pagination from '../components/Pagination'
import { blogApi } from '../lib/blogApi'
import { useAsync } from '../lib/useAsync'
import { BRAND, usePageMeta } from '../lib/usePageMeta'

const PAGE_SIZE = 12

/** Same description as the server-rendered page (PageMetaService.BLOG_DESCRIPTION) */
export const BLOG_DESCRIPTION = `Bài viết của ${BRAND} về các loại hạt: cách chọn, bảo quản, chế biến món ngon và ăn hạt mỗi ngày sao cho hợp lý.`

/** /blog?page=N: newest first, one column on phones, two on tablets, three on desktops. */
export default function BlogListPage() {
  const [params] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const { data, error, reload } = useAsync((signal) => blogApi.list(page - 1, PAGE_SIZE, signal), [page])
  usePageMeta(`Blog | ${BRAND}`, BLOG_DESCRIPTION)

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-stone-900 md:text-4xl">Blog</h1>
      <p className="mt-2 max-w-2xl text-stone-600">{BLOG_DESCRIPTION}</p>

      {error ? (
        <div className="mt-8">
          <ErrorMessage message={error.message} onRetry={reload} />
        </div>
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-stone-200 bg-white p-8 text-center text-stone-600">
          Chưa có bài viết nào. Bạn quay lại sau nhé!
        </p>
      ) : (
        <>
          <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((post) => (
              <li key={post.id} className="min-w-0">
                <BlogCard post={post} />
              </li>
            ))}
          </ul>
          {data.totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={data.totalPages}
              href={(n) => (n === 1 ? '/blog' : `/blog?page=${n}`)}
              onNavigate={() => window.scrollTo({ top: 0 })}
            />
          )}
        </>
      )}
    </div>
  )
}
