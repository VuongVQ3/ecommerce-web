import { apiRequest, type Page, type RequestOptions } from '../../lib/api'

/** Assets (DAM) API, /api/author/assets (STAFF and ADMIN; deleting: canDelete). */
export type AssetKind = 'IMAGE' | 'PDF'

export interface FolderNode {
  id: number
  /** null for the root (/hat-lanh) */
  parentId: number | null
  /** A slug, e.g. "tai-lieu" */
  name: string
  path: string
  /** Assets directly in this folder */
  assetCount: number
  children: FolderNode[]
}

/** Preset → Cloudinary URL. A PDF has thumb and card only (pictures of page 1). */
export interface AssetRenditions {
  thumb?: string
  card?: string
  hero?: string
  og?: string
}

export interface AssetRow {
  id: string
  folderId: number
  fileName: string
  kind: AssetKind
  mime: string
  sizeBytes: number
  width: number | null
  height: number | null
  pageCount: number | null
  url: string
  title: string
  alt: string | null
  tags: string[]
  updatedAt: string
  updatedByName: string | null
  renditions: AssetRenditions
  /** Relative link that keeps working when the file is replaced: /files/{id}/{name} */
  stableUrl: string
}

/** A page or content fragment that uses the asset. */
export interface AssetUsage {
  sourceType: 'FRAGMENT' | 'PAGE'
  sourceId: string
  since: string
}

export interface AssetDetail extends AssetRow {
  folderPath: string
  storageVersion: number | null
  description: string | null
  checksum: string
  createdAt: string
  createdByName: string | null
  usages: AssetUsage[]
}

export interface AssetQuery {
  folderId?: number | null
  includeSubfolders?: boolean
  q?: string
  kind?: AssetKind | null
  tag?: string
  page?: number
  size?: number
}

export interface MetadataInput {
  title: string
  alt: string | null
  description: string | null
  tags: string[]
}

const BASE = '/api/author/assets'

const json = (method: string, body: unknown): RequestOptions => ({ method, body: JSON.stringify(body) })

function query(q: AssetQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(q)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

function fileForm(file: File, fields: Record<string, string | number | undefined> = {}): FormData {
  const form = new FormData()
  form.append('file', file)
  for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== '') form.append(key, String(value))
  return form
}

export const damApi = {
  folders: (signal?: AbortSignal) => apiRequest<FolderNode[]>(`${BASE}/folders`, { signal }),
  createFolder: (parentId: number, name: string) => apiRequest<FolderNode>(`${BASE}/folders`, json('POST', { parentId, name })),
  renameFolder: (id: number, name: string) => apiRequest<{ id: number; path: string }>(`${BASE}/folders/${id}`, json('PATCH', { name })),
  deleteFolder: (id: number) => apiRequest<void>(`${BASE}/folders/${id}`, { method: 'DELETE' }),

  list: (q: AssetQuery, signal?: AbortSignal) => apiRequest<Page<AssetRow>>(`${BASE}${query(q)}`, { signal }),
  get: (id: string, signal?: AbortSignal) => apiRequest<AssetDetail>(`${BASE}/${encodeURIComponent(id)}`, { signal }),
  /** One file per request (at most 10MB). 409 DUPLICATE_ASSET carries the existing assetId. */
  upload: (file: File, folderId: number, extra: { title?: string; alt?: string } = {}) =>
    apiRequest<AssetDetail>(BASE, { method: 'POST', body: fileForm(file, { folderId, ...extra }) }),
  update: (id: string, input: MetadataInput) => apiRequest<AssetDetail>(`${BASE}/${encodeURIComponent(id)}`, json('PATCH', input)),
  move: (id: string, folderId: number) => apiRequest<AssetDetail>(`${BASE}/${encodeURIComponent(id)}/move`, json('POST', { folderId })),
  replace: (id: string, file: File) =>
    apiRequest<AssetDetail>(`${BASE}/${encodeURIComponent(id)}/replace`, { method: 'POST', body: fileForm(file) }),
  remove: (id: string) => apiRequest<void>(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

/** Every folder in tree order, with its depth (for selects and the mobile folder picker). */
export function flattenFolders(tree: FolderNode[], depth = 0): (FolderNode & { depth: number })[] {
  return tree.flatMap((f) => [{ ...f, depth }, ...flattenFolders(f.children, depth + 1)])
}
