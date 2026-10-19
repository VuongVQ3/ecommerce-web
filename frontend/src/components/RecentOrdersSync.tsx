import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { readRecentOrders, removeRecentOrders } from '../lib/recentOrders'
import { useToast } from './Toast'

/**
 * Right after someone signs in in this tab (login, register, Google, account created from an order), the guest
 * orders remembered in this browser are offered to the account (the server only attaches those placed with its
 * verified email or phone). Not for a session that was already open or came from another tab, and never for staff:
 * opening a customer's link while signed in must not take the order. Renders nothing.
 */
export default function RecentOrdersSync() {
  const { user, lastSignInAt } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const pathRef = useRef(location.pathname)
  useEffect(() => {
    pathRef.current = location.pathname
  })
  const syncedFor = useRef<number | null>(null)

  useEffect(() => {
    if (!user || user.role !== 'CUSTOMER' || lastSignInAt === null || syncedFor.current === lastSignInAt) return
    syncedFor.current = lastSignInAt
    const recent = readRecentOrders()
    if (recent.length === 0) return
    api.claimOrders(recent.map(({ code, token }) => ({ code, token }))).then(
      ({ claimed }) => {
        if (claimed.length === 0) return
        removeRecentOrders(claimed)
        toast({ tone: 'success', message: `Đã lưu ${claimed.length} đơn hàng vào tài khoản` })
        // Standing on the tracking page of an order that just moved to the account: show it there instead
        const here = pathRef.current.match(/^\/don-hang\/([^/]+)$/)?.[1]
        if (here && claimed.includes(decodeURIComponent(here))) {
          navigate(`/tai-khoan/don-hang/${here}`, { replace: true })
        }
      },
      () => {
        // Not critical: the orders stay in the list and are retried at the next sign-in
        syncedFor.current = null
      },
    )
  }, [user, lastSignInAt, toast, navigate])

  return null
}
