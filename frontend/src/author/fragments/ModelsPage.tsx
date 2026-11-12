import { Plus } from 'lucide-react'
import { Link } from 'react-router'
import { btn, table } from '../../admin/styles'
import { Badge, EmptyState, PageHeader, TableFrame } from '../../admin/ui'
import { ErrorMessage, Spinner } from '../../components/Feedback'
import { formatAdminDateTime } from '../../lib/format'
import { useAsync } from '../../lib/useAsync'
import { useAuthorSession } from '../AuthorSessionContext'
import { cfApi, MODEL_STATUS_LABEL, type ModelStatus } from './cfApi'
import { FragmentsTabs } from './FragmentsTabs'

const STATUS_TONE: Record<ModelStatus, 'green' | 'gray' | 'amber'> = { ENABLED: 'green', DRAFT: 'amber', DISABLED: 'gray' }

/** Content Fragment Models: everyone sees them, only canManageModels creates or edits. */
export default function ModelsPage() {
  const session = useAuthorSession()
  const models = useAsync((signal) => cfApi.models(signal), [])
  return (
    <>
      <PageHeader title="Content Fragments">
        {session.canManageModels && (
          <Link to="/author/fragments/models/new" className={btn.primary}>
            <Plus aria-hidden className="size-4" />
            Model mới
          </Link>
        )}
      </PageHeader>
      <FragmentsTabs />
      {models.error && !models.data ? (
        <ErrorMessage message={models.error.message} onRetry={models.reload} />
      ) : !models.data ? (
        <Spinner />
      ) : models.data.length === 0 ? (
        <EmptyState title="Chưa có model nào" />
      ) : (
        <TableFrame>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col" className={table.th}>
                  Model
                </th>
                <th scope="col" className={table.th}>
                  Trạng thái
                </th>
                <th scope="col" className={table.th}>
                  Field
                </th>
                <th scope="col" className={table.th}>
                  Fragment
                </th>
                <th scope="col" className={table.th}>
                  Phiên bản
                </th>
                <th scope="col" className={table.th}>
                  Cập nhật
                </th>
              </tr>
            </thead>
            <tbody>
              {models.data.map((m) => (
                <tr key={m.id} className="hover:bg-stone-50">
                  <td className={table.td}>
                    <Link to={`/author/fragments/models/${m.id}`} className="font-medium text-stone-900 hover:text-indigo-700 hover:underline">
                      {m.name}
                    </Link>
                    <span className="block font-mono text-xs text-muted">{m.slug}</span>
                  </td>
                  <td className={table.td}>
                    <Badge tone={STATUS_TONE[m.status]}>{MODEL_STATUS_LABEL[m.status]}</Badge>
                  </td>
                  <td className={`${table.td} tabular-nums`}>{m.fieldCount}</td>
                  <td className={`${table.td} tabular-nums`}>{m.fragmentCount}</td>
                  <td className={`${table.td} tabular-nums`}>v{m.version}</td>
                  <td className={`${table.td} whitespace-nowrap`}>
                    {formatAdminDateTime(m.updatedAt)}
                    {m.updatedByName && <span className="block text-xs text-muted">{m.updatedByName}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}
    </>
  )
}
