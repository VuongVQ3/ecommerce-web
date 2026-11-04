import { ExternalLink } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { ErrorMessage } from '../components/Feedback'
import { adminBlogApi, type AdminBlogRow } from '../lib/adminBlogApi'
import { formatAdminDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { Skeleton } from './Skeleton'
import { btn, card, table } from './styles'
import { Badge, EmptyState, FilterBar, PageHeader, Pagination, SearchFilter, TableFrame } from './ui'

function StatusBadge({ row }: { row: AdminBlogRow }) {
  return row.status === 'PUBLISHED' ? <Badge tone="green">Đã đăng</Badge> : <Badge tone="gray">Nháp</Badge>
}

function ViewLink({ row }: { row: AdminBlogRow }) {
  if (row.status !== 'PUBLISHED') return null
  return (
    <a href={`/blog/${row.slug}`} target="_blank" rel="noopener" className={`${btn.link} inline-flex items-center gap-1 whitespace-nowrap`}>
      Xem bài <ExternalLink aria-hidden className="size-3.5" />
    </a>
  )
}

/** /admin/blog: most recently edited first, search by title (without accents). Cards on phones, a table from 768px. */
export default function BlogPostsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const page = Math.max(0, Number(params.get('page')) || 0)
  const { data, error, reload } = useAsync((signal) => adminBlogApi.list(q, page, signal), [q, page])

  const go = (next: { q?: string; page?: number }) => {
    const p = new URLSearchParams()
    const query = next.q ?? q
    if (query) p.set('q', query)
    if (next.page) p.set('page', String(next.page))
    setParams(p)
  }

  return (
    <div>
      <PageHeader title="Blog">
        <Link to="/admin/blog/moi" className={btn.primary}>
          + Viết bài mới
        </Link>
      </PageHeader>
      <FilterBar>
        <SearchFilter key={q} initial={q} placeholder="Tìm theo tiêu đề..." label="Tìm bài viết" onSearch={(text) => go({ q: text, page: 0 })} />
      </FilterBar>

      {error ? (
        <ErrorMessage message={error.message} onRetry={reload} />
      ) : !data ? (
        <Skeleton variant="table" />
      ) : data.items.length === 0 ? (
        <EmptyState title={q ? 'Không có bài nào khớp' : 'Chưa có bài viết nào'}>
          {!q && (
            <Link to="/admin/blog/moi" className={btn.link}>
              Viết bài đầu tiên
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {data.items.map((row) => (
              <li key={row.id} className={`${card} relative p-4`}>
                <Link to={`/admin/blog/${row.id}`} className="font-semibold text-stone-900 after:absolute after:inset-0">
                  {row.title}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <StatusBadge row={row} />
                  {row.publishedAt && <span>Đăng {formatAdminDateTime(row.publishedAt)}</span>}
                  <span>Sửa {formatAdminDateTime(row.updatedAt)}</span>
                </div>
                <div className="relative mt-2">
                  <ViewLink row={row} />
                </div>
              </li>
            ))}
          </ul>
          <TableFrame className="hidden md:block">
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>Tiêu đề</th>
                  <th className={table.th}>Trạng thái</th>
                  <th className={table.th}>Ngày đăng</th>
                  <th className={table.th}>Sửa lần cuối</th>
                  <th className={table.th}>
                    <span className="sr-only">Xem</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} className="hover:bg-stone-50">
                    <td className={table.td}>
                      <Link to={`/admin/blog/${row.id}`} className="font-semibold text-stone-900 hover:text-brand-700 hover:underline">
                        {row.title}
                      </Link>
                      <p className="text-xs text-muted">/blog/{row.slug}</p>
                    </td>
                    <td className={table.td}>
                      <StatusBadge row={row} />
                    </td>
                    <td className={`${table.td} whitespace-nowrap`}>{row.publishedAt ? formatAdminDateTime(row.publishedAt) : '—'}</td>
                    <td className={`${table.td} whitespace-nowrap`}>{formatAdminDateTime(row.updatedAt)}</td>
                    <td className={table.td}>
                      <ViewLink row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
          <Pagination page={page} totalPages={data.totalPages} onChange={(p) => go({ page: p })} />
        </>
      )}
    </div>
  )
}
