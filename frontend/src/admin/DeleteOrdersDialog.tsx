import { useId, useState } from 'react'
import type { OrderStatus } from '../lib/api'
import { adminApi, type BulkDeleteResult } from '../lib/adminApi'
import { useAsync } from '../lib/useAsync'
import { CONFIRM_WORD, isConfirmWord } from './orderDeletion'
import { input } from './styles'
import { Dialog } from './ui'

/** Codes listed by name; the rest are counted */
const LISTED = 10

/**
 * Deleting closed orders for good (ADMIN): the codes, a warning, for completed orders a "put the goods back" box (off
 * by default, with the packs it would add per product), and the word XOÁ to type before the button turns on. One
 * order goes through DELETE (its error shows here), several through the bulk endpoint (skips come back in the result).
 */
export function DeleteOrdersDialog({
  orders,
  onClose,
  onDone,
}: {
  orders: { code: string; status: OrderStatus }[]
  onClose: () => void
  onDone: (result: BulkDeleteResult) => void
}) {
  const [restock, setRestock] = useState(false)
  const [word, setWord] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wordId = useId()
  const completed = orders.filter((o) => o.status === 'COMPLETED').map((o) => o.code)

  // What "put back" would add, per product: from the completed orders' lines
  const packs = useAsync(
    async (signal) => {
      const details = await Promise.all(completed.map((code) => adminApi.order(code, signal)))
      const byProduct = new Map<number, { name: string; quantity: number }>()
      for (const line of details.flatMap((d) => d.order.items)) {
        const row = byProduct.get(line.productId) ?? { name: line.productName, quantity: 0 }
        row.quantity += line.quantity
        byProduct.set(line.productId, row)
      }
      return [...byProduct.values()]
    },
    [completed.join(',')],
  )

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      if (orders.length === 1) {
        await adminApi.deleteOrder(orders[0].code, restock && completed.length > 0)
        onDone({ deleted: [orders[0].code], skipped: [] })
      } else {
        onDone(await adminApi.deleteOrders(orders.map((o) => o.code), restock && completed.length > 0))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPending(false)
    }
  }

  const listed = orders.slice(0, LISTED)
  return (
    <Dialog
      title={orders.length === 1 ? `Xoá đơn ${orders[0].code}?` : `Xoá ${orders.length} đơn hàng?`}
      tone="danger"
      submitLabel="Xoá vĩnh viễn"
      onSubmit={submit}
      submitDisabled={!isConfirmWord(word)}
      onClose={onClose}
      pending={pending}
      error={error}
    >
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">
        Xoá vĩnh viễn, không khôi phục được. Khách sẽ không tra cứu được {orders.length === 1 ? 'đơn này' : 'các đơn này'}{' '}
        nữa; doanh thu và số đơn ở Tổng quan sẽ không còn tính {orders.length === 1 ? 'đơn này' : 'các đơn này'}.
      </p>
      <div>
        <p className="text-sm font-medium text-stone-700">{orders.length === 1 ? 'Đơn sẽ xoá' : `${orders.length} đơn sẽ xoá`}</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {listed.map((o) => (
            <li key={o.code} className="rounded-md bg-stone-100 px-2 py-0.5 font-mono text-xs font-semibold text-stone-800">
              {o.code}
            </li>
          ))}
        </ul>
        {orders.length > LISTED && <p className="mt-1 text-sm text-stone-600">và {orders.length - LISTED} đơn khác</p>}
      </div>
      {completed.length > 0 && (
        <div className="rounded-xl border border-stone-200 p-3">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-stone-800">
            <input
              type="checkbox"
              checked={restock}
              onChange={(e) => setRestock(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-brand-600"
            />
            <span>
              Cộng lại hàng của các đơn đã giao vào kho (chỉ chọn nếu là đơn test, hàng chưa thực sự gửi đi)
            </span>
          </label>
          <div className="mt-2 pl-7 text-sm text-stone-600">
            {packs.data ? (
              <>
                <p>
                  {completed.length === orders.length ? 'Sẽ cộng lại:' : `Sẽ cộng lại (${completed.length} đơn đã giao):`}
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {packs.data.map((p) => (
                    <li key={p.name}>
                      {p.name}: <span className="font-semibold tabular-nums">+{p.quantity}</span> gói
                    </li>
                  ))}
                </ul>
              </>
            ) : packs.error ? (
              <p>Không tải được số lượng hàng của các đơn đã giao.</p>
            ) : (
              <p>Đang tính số hàng sẽ cộng lại...</p>
            )}
          </div>
        </div>
      )}
      <div>
        <label htmlFor={wordId} className="mb-1 block text-sm font-medium text-stone-700">
          Gõ <span className="font-bold text-danger">{CONFIRM_WORD}</span> để xác nhận
        </label>
        <input
          id={wordId}
          value={word}
          onChange={(e) => setWord(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={input}
        />
      </div>
    </Dialog>
  )
}
