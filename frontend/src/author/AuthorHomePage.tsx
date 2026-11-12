import { Link } from 'react-router'
import { Badge, PageHeader } from '../admin/ui'
import { AUTHOR_MODULES } from './authorModules'
import { permissionSentence } from './permissions'
import { useAuthorSession } from './AuthorSessionContext'

/** Overview of the Author environment: the three modules (coming soon) and what the user may do. */
export default function AuthorHomePage() {
  const session = useAuthorSession()
  return (
    <>
      <PageHeader title="Tổng quan nội dung" />
      <ul className="grid gap-4 md:grid-cols-3">
        {AUTHOR_MODULES.map((m) => (
          <li key={m.key}>
            <Link
              to={m.to}
              className="flex h-full flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <m.icon aria-hidden className="size-5" strokeWidth={1.75} />
                </span>
                <Badge tone="gray">Sắp có</Badge>
              </span>
              <span className="text-lg font-bold text-stone-900">{m.label}</span>
              <span className="text-sm text-stone-600">{m.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="author-permissions" className="mt-8 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
        <h2 id="author-permissions" className="text-sm font-semibold text-indigo-900">
          Quyền của bạn
        </h2>
        <p className="mt-1 text-sm text-stone-700">{permissionSentence(session)}</p>
      </section>
    </>
  )
}
