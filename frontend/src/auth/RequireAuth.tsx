import { Navigate, Outlet, useLocation } from 'react-router'
import { Spinner } from '../components/Feedback'
import type { Role } from '../lib/api'
import { loginUrl } from '../lib/redirect'
import ForbiddenPage from '../pages/ForbiddenPage'
import { useAuth } from './AuthContext'

/**
 * Route guard for nested routes. Signed-out visitors go to the login page (and come back afterwards); signed-in
 * users without one of `roles` see a 403 page.
 *
 * This only shapes the UI: the backend enforces the same rules on every API call.
 */
export default function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner label="Đang kiểm tra đăng nhập..." />
  if (!user) return <Navigate to={loginUrl(location.pathname + location.search + location.hash)} replace />
  if (roles && !roles.includes(user.role)) return <ForbiddenPage />
  return <Outlet />
}
