import { Link } from 'react-router'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { adminApi } from '../lib/adminApi'
import { formatPrice } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { card, table } from './styles'
import { EmptyState, PageHeader } from './ui'

const dayLabel = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })

function Stat({ label, value, to, highlight = false }: { label: string; value: string; to?: string; highlight?: boolean }) {
  const body = (
    <>
      <p className="text-sm text-stone-600">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${highlight ? 'text-amber-800' : 'text-stone-900'}`}>{value}</p>
    </>
  )
  return to ? (
    <Link to={to} className={`${card} block p-5 hover:border-brand-300`}>
      {body}
    </Link>
  ) : (
    <div className={`${card} p-5`}>{body}</div>
  )
}

export default function DashboardPage() {
  const { data, error, reload } = useAsync((signal) => adminApi.dashboard(signal), [])

  if (error) return <ErrorMessage message={error.message} onRetry={reload} />
  if (!data) return <Spinner />

  const max = Math.max(1, ...data.revenueByDay.map((d) => d.revenue))
  return (
    <>
      <PageHeader title="Tổng quan" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Đơn hôm nay" value={String(data.ordersToday)} to="/admin/don-hang" />
        <Stat
          label="Đơn chờ xác nhận"
          value={String(data.pendingCount)}
          to="/admin/don-hang?status=PENDING"
          highlight={data.pendingCount > 0}
        />
        <Stat label="Doanh thu 7 ngày (đã giao)" value={formatPrice(data.revenue7Days)} />
      </div>

      <section className={`${card} mt-6 p-5`} aria-labelledby="revenue-title">
        <h2 id="revenue-title" className="font-semibold text-stone-900">
          Doanh thu theo ngày
        </h2>
        <p className="text-sm text-muted">Chỉ tính đơn đã giao thành công, theo ngày hoàn tất.</p>
        <ol className="mt-4 flex h-44 items-end gap-2" aria-label="Biểu đồ doanh thu 7 ngày">
          {data.revenueByDay.map((d) => (
            <li key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="sr-only">
                {dayLabel.format(new Date(d.date))}: {formatPrice(d.revenue)}, {d.orders} đơn
              </span>
              <div
                aria-hidden
                title={`${formatPrice(d.revenue)} · ${d.orders} đơn`}
                className="w-full max-w-12 rounded-t-lg bg-brand-500"
                style={{ height: `${Math.max(2, (d.revenue / max) * 100)}%` }}
              />
              <span aria-hidden className="text-xs whitespace-nowrap text-stone-600">
                {dayLabel.format(new Date(d.date)).replace(/,.*/, '')}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6" aria-labelledby="low-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="low-title" className="font-semibold text-stone-900">
            Sản phẩm sắp hết hàng
          </h2>
          <Link to="/admin/kho?low=1" className="text-sm font-semibold text-brand-700 hover:underline">
            Xem tồn kho →
          </Link>
        </div>
        {data.lowStock.length === 0 ? (
          <EmptyState title="Không có sản phẩm nào dưới ngưỡng tồn kho." />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>Sản phẩm</th>
                  <th className={`${table.th} text-right`}>Có thể bán</th>
                  <th className={`${table.th} text-right`}>Ngưỡng</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((p) => (
                  <tr key={p.id} className="bg-amber-50/60">
                    <td className={table.td}>{p.name}</td>
                    <td className={`${table.td} text-right font-semibold text-amber-900 tabular-nums`}>{p.available}</td>
                    <td className={`${table.td} text-right tabular-nums`}>{p.lowStockThreshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
