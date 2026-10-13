import { Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import type { Role } from '../lib/api'
import ForbiddenPage from '../pages/ForbiddenPage'

/** Nested guard inside the admin area (the parent RequireAuth already handled signed-out visitors). */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth()
  return user && roles.includes(user.role) ? <Outlet /> : <ForbiddenPage />
}
