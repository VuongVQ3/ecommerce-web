import { apiRequest, type Role } from '../lib/api'

/** Modules of the Author environment, as GET /api/author/session lists them. */
export type AuthorModuleKey = 'sites' | 'assets' | 'fragments'

/**
 * What the signed-in user may do in /author (rules in ContentPermissions on the backend). Show or hide actions from
 * these flags, never from the role.
 */
export interface AuthorSession {
  role: Role
  canPublish: boolean
  canDelete: boolean
  canManageModels: boolean
  modules: AuthorModuleKey[]
}

/** Author environment API (STAFF and ADMIN). Kept apart from api.ts so shoppers never download it. */
export const authorApi = {
  session: (signal?: AbortSignal) => apiRequest<AuthorSession>('/api/author/session', { signal }),
}
