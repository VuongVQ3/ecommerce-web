import { apiRequest, type RequestOptions } from '../../lib/api'
import type { PageContent, Template } from '../../cms/registry'
import type { FragmentStatus, RefSummary, VersionRow } from '../fragments/cfApi'

/** CMS pages API, /api/author/pages (publish: canPublish; delete: canDelete). */
export interface TreeNode {
  id: string
  parentId: string | null
  name: string
  path: string
  title: string
  template: Template
  status: FragmentStatus
  sortOrder: number
  updatedAt: string
  children: TreeNode[]
}

export type PageProperties = Record<string, unknown>

export interface PageDetail {
  id: string
  parentId: string | null
  name: string
  path: string
  template: Template
  title: string
  content: PageContent
  properties: PageProperties
  status: FragmentStatus
  publishedVersionId: string | null
  publishedAt: string | null
  publishAt: string | null
  unpublishAt: string | null
  createdAt: string
  createdByName: string | null
  updatedAt: string
  updatedByName: string | null
  versions: VersionRow[]
  refs: Record<string, RefSummary>
  /** Earlier paths that now redirect here */
  oldPaths: string[]
}

const BASE = '/api/author/pages'
const json = (method: string, body: unknown): RequestOptions => ({ method, body: JSON.stringify(body) })
const at = (id: string) => `${BASE}/${encodeURIComponent(id)}`

export const sitesApi = {
  tree: (signal?: AbortSignal) => apiRequest<TreeNode[]>(`${BASE}/tree`, { signal }),
  page: (id: string, signal?: AbortSignal) => apiRequest<PageDetail>(at(id), { signal }),
  create: (input: { parentId: string | null; name?: string; title: string; template: Template }) =>
    apiRequest<PageDetail>(BASE, json('POST', input)),
  save: (
    id: string,
    input: { title: string; content: PageContent; properties: PageProperties; comment?: string; publishAt: string | null; unpublishAt: string | null },
  ) => apiRequest<PageDetail>(at(id), json('PUT', input)),
  /** parentId null = top level; position = index among the new siblings */
  move: (id: string, parentId: string | null, position?: number) => apiRequest<PageDetail>(`${at(id)}/move`, json('POST', { parentId, position })),
  rename: (id: string, name: string) => apiRequest<PageDetail>(`${at(id)}/rename`, json('POST', { name })),
  rollback: (id: string, versionId: string) => apiRequest<PageDetail>(`${at(id)}/rollback/${encodeURIComponent(versionId)}`, { method: 'POST' }),
  /** 409 UNPUBLISHED_REFERENCES (references) unless publishReferences */
  publish: (id: string, publishReferences = false) => apiRequest<PageDetail>(`${at(id)}/publish`, json('POST', { publishReferences })),
  unpublish: (id: string) => apiRequest<PageDetail>(`${at(id)}/unpublish`, { method: 'POST' }),
  /** 409 PAGE_HAS_CHILDREN (childCount) unless includeChildren */
  remove: (id: string, includeChildren = false) =>
    apiRequest<void>(`${at(id)}?includeChildren=${includeChildren}`, { method: 'DELETE' }),
  previewLink: (id: string) => apiRequest<{ url: string; expiresAt: string }>(`${at(id)}/preview-link`, { method: 'POST' }),
}

/** Every page in tree order with its depth (for parent pickers). */
export function flattenTree(tree: TreeNode[], depth = 0): (TreeNode & { depth: number })[] {
  return tree.flatMap((n) => [{ ...n, depth }, ...flattenTree(n.children, depth + 1)])
}
