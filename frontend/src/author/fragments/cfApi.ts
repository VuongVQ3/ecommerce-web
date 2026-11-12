import { apiRequest, type Page, type RequestOptions } from '../../lib/api'

/** Content Fragments API, /api/author/cf (models: canManageModels to write; publish: canPublish; delete: canDelete). */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'markdown'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'asset'
  | 'fragment'
  | 'product'
  | 'link'
  | 'list'

export interface FieldRules {
  maxLength?: number
  min?: number
  max?: number
  options?: string[]
  allowedKinds?: ('IMAGE' | 'PDF')[]
  allowedModels?: string[]
  itemType?: 'text' | 'number' | 'link' | 'date'
  maxItems?: number
}

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  required: boolean
  multiple: boolean
  help: string | null
  rules: FieldRules
}

export type ModelStatus = 'DRAFT' | 'ENABLED' | 'DISABLED'
export type FragmentStatus = 'DRAFT' | 'PUBLISHED' | 'MODIFIED'

export interface ModelRow {
  id: number
  name: string
  slug: string
  description: string | null
  status: ModelStatus
  version: number
  fieldCount: number
  fragmentCount: number
  updatedAt: string
  updatedByName: string | null
}

export interface ModelDetail {
  id: number
  name: string
  slug: string
  description: string | null
  status: ModelStatus
  version: number
  fields: FieldDef[]
  fragmentCount: number
  createdAt: string
  updatedAt: string
  updatedByName: string | null
}

export interface ModelInput {
  name: string
  slug?: string
  description: string | null
  status: ModelStatus
  fields: FieldDef[]
  dropFieldData?: boolean
}

export interface FragmentRow {
  id: string
  model: { id: number; slug: string; name: string }
  folderPath: string
  name: string
  title: string
  status: FragmentStatus
  publishedAt: string | null
  updatedAt: string
  updatedByName: string | null
}

export interface VersionRow {
  id: string
  versionNo: number
  title: string
  comment: string | null
  createdAt: string
  createdByName: string | null
  published: boolean
}

export interface UsageRow {
  sourceType: 'FRAGMENT' | 'PAGE'
  sourceId: string
  title: string | null
}

/** Name and thumbnail of a referenced asset, fragment or product, by id. */
export interface RefSummary {
  id: string
  type: 'ASSET' | 'FRAGMENT' | 'PRODUCT'
  title: string
  thumb: string | null
  status: string | null
}

export type FragmentData = Record<string, unknown>

export interface FragmentDetail {
  id: string
  model: ModelDetail
  folderPath: string
  name: string
  title: string
  data: FragmentData
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
  usages: UsageRow[]
  refs: Record<string, RefSummary>
}

export interface FragmentQuery {
  modelId?: number | null
  modelSlugs?: string[]
  folder?: string
  status?: FragmentStatus | null
  q?: string
  page?: number
  size?: number
}

export interface PendingReference {
  id: string
  title: string
  model: string
}

const BASE = '/api/author/cf'
const json = (method: string, body: unknown): RequestOptions => ({ method, body: JSON.stringify(body) })

function query(q: FragmentQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)))
    else params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export const cfApi = {
  models: (signal?: AbortSignal) => apiRequest<ModelRow[]>(`${BASE}/models`, { signal }),
  model: (id: number, signal?: AbortSignal) => apiRequest<ModelDetail>(`${BASE}/models/${id}`, { signal }),
  createModel: (input: ModelInput) => apiRequest<ModelDetail>(`${BASE}/models`, json('POST', input)),
  /** 409 MODEL_CHANGE_CONFLICT (affectedFragments, fields) unless dropFieldData */
  updateModel: (id: number, input: ModelInput) => apiRequest<ModelDetail>(`${BASE}/models/${id}`, json('PUT', input)),
  deleteModel: (id: number) => apiRequest<void>(`${BASE}/models/${id}`, { method: 'DELETE' }),

  fragments: (q: FragmentQuery, signal?: AbortSignal) => apiRequest<Page<FragmentRow>>(`${BASE}/fragments${query(q)}`, { signal }),
  folders: (signal?: AbortSignal) => apiRequest<string[]>(`${BASE}/folders`, { signal }),
  fragment: (id: string, signal?: AbortSignal) => apiRequest<FragmentDetail>(`${BASE}/fragments/${encodeURIComponent(id)}`, { signal }),
  create: (input: { modelId: number; folderPath: string; name?: string; title: string; data: FragmentData }) =>
    apiRequest<FragmentDetail>(`${BASE}/fragments`, json('POST', input)),
  save: (
    id: string,
    input: { title: string; data: FragmentData; comment?: string; publishAt: string | null; unpublishAt: string | null },
  ) => apiRequest<FragmentDetail>(`${BASE}/fragments/${encodeURIComponent(id)}`, json('PUT', input)),
  rollback: (id: string, versionId: string) =>
    apiRequest<FragmentDetail>(`${BASE}/fragments/${encodeURIComponent(id)}/rollback/${encodeURIComponent(versionId)}`, { method: 'POST' }),
  /** 409 UNPUBLISHED_REFERENCES (references) unless publishReferences */
  publish: (id: string, publishReferences = false) =>
    apiRequest<FragmentDetail>(`${BASE}/fragments/${encodeURIComponent(id)}/publish`, json('POST', { publishReferences })),
  unpublish: (id: string) => apiRequest<FragmentDetail>(`${BASE}/fragments/${encodeURIComponent(id)}/unpublish`, { method: 'POST' }),
  remove: (id: string) => apiRequest<void>(`${BASE}/fragments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  previewLink: (id: string) =>
    apiRequest<{ url: string; expiresAt: string }>(`${BASE}/fragments/${encodeURIComponent(id)}/preview-link`, { method: 'POST' }),

  /** The delivery API's Markdown rendering (allowed for STAFF, unlike the blog's) */
  markdownPreview: (content: string, signal?: AbortSignal) =>
    apiRequest<{ html: string; readingMinutes: number }>('/api/author/markdown/preview', { ...json('POST', { content }), signal }),
}

export const FRAGMENT_STATUS_LABEL: Record<FragmentStatus, string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đã publish',
  MODIFIED: 'Đã sửa sau publish',
}

export const MODEL_STATUS_LABEL: Record<ModelStatus, string> = { DRAFT: 'Nháp', ENABLED: 'Đang dùng', DISABLED: 'Đã tắt' }

/** Badge colour per fragment status */
export const STATUS_TONE: Record<FragmentStatus, 'gray' | 'green' | 'amber'> = { DRAFT: 'gray', PUBLISHED: 'green', MODIFIED: 'amber' }
