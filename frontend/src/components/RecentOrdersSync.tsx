import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { readRecentOrders, removeRecentOrders } from '../lib/recentOrders'
import { useToast } from './Toast'

/**
 * Once someone is signed in (login, register, Google, account created from an order), the guest orders remembered
 * in this browser are attached to the account. Renders nothing.
 */
export default function RecentOrdersSync() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const pathRef = useRef(location.pathname)
  useEffect(() => {
    pathRef.current = location.pathname
  })
  const syncedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!user || syncedFor.current === user.id) return
    syncedFor.current = user.id
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
  }, [user, toast, navigate])

  return null
}
