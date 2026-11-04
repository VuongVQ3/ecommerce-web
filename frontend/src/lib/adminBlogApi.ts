import { apiRequest, post, type Page } from './api'

/** Back office side of the blog (ADMIN only). Kept apart from blogApi so shoppers never download it. */
export type BlogStatus = 'DRAFT' | 'PUBLISHED'

export interface AdminBlogRow {
  id: number
  title: string
  slug: string
  status: BlogStatus
  publishedAt: string | null
  updatedAt: string
}

export interface AdminBlogImage {
  id: string
  url: string
  width: number | null
  height: number | null
  alt: string | null
}

export interface AdminRelatedProduct {
  id: number
  name: string
  slug: string
  imageUrl: string | null
  /** False when hidden or without a price: not shown on the post */
  active: boolean
}

export interface AdminBlogPost {
  id: number
  title: string
  slug: string
  excerpt: string | null
  /** Markdown as typed */
  content: string
  coverImageUrl: string | null
  coverImageAlt: string | null
  status: BlogStatus
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  images: AdminBlogImage[]
  products: AdminRelatedProduct[]
}

export interface BlogPostInput {
  title: string
  /** Empty = from the title; the server adds -2, -3… when taken */
  slug: string
  excerpt: string
  content: string
  coverImageAlt: string
  productIds: number[]
}

export const BLOG_CONTENT_MAX = 100_000

const BASE = '/api/admin/blog'
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) })

export const adminBlogApi = {
  list: (q: string, page: number, signal?: AbortSignal) =>
    apiRequest<Page<AdminBlogRow>>(`${BASE}?page=${page}&size=20${q ? `&q=${encodeURIComponent(q)}` : ''}`, { signal }),
  get: (id: number, signal?: AbortSignal) => apiRequest<AdminBlogPost>(`${BASE}/${id}`, { signal }),
  create: (input: BlogPostInput) => apiRequest<AdminBlogPost>(BASE, post(input)),
  update: (id: number, input: BlogPostInput) => apiRequest<AdminBlogPost>(`${BASE}/${id}`, json('PUT', input)),
  setStatus: (id: number, status: BlogStatus) => apiRequest<AdminBlogPost>(`${BASE}/${id}/status`, json('PATCH', { status })),
  remove: (id: number) => apiRequest<void>(`${BASE}/${id}`, { method: 'DELETE' }),
  uploadImage: (id: number, file: File, alt?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (alt) form.append('alt', alt)
    return apiRequest<AdminBlogImage>(`${BASE}/${id}/images`, { method: 'POST', body: form })
  },
  deleteImage: (id: number, imageId: string) => apiRequest<AdminBlogPost>(`${BASE}/${id}/images/${imageId}`, { method: 'DELETE' }),
  setCover: (id: number, imageId: string | null, alt: string) =>
    apiRequest<AdminBlogPost>(`${BASE}/${id}/cover`, json('PUT', { imageId, alt })),
  preview: (content: string, signal?: AbortSignal) =>
    apiRequest<{ html: string; readingMinutes: number }>(`${BASE}/preview`, { ...post({ content }), signal }),
}
