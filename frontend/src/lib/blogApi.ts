import { apiRequest, type Page, type ProductSummary } from './api'

export interface BlogCard {
  id: number
  title: string
  slug: string
  excerpt: string | null
  coverImageUrl: string | null
  coverImageAlt: string | null
  publishedAt: string
  readingMinutes: number
}

export interface BlogPostDetail extends BlogCard {
  /** Rendered on the server from Markdown (raw HTML escaped, links and images checked): safe to insert */
  contentHtml: string
  coverWidth: number | null
  coverHeight: number | null
  updatedAt: string
  /** Related products still on sale, with current prices */
  products: ProductSummary[]
  /** Up to 3 newest other posts */
  latest: BlogCard[]
  /** Set when the address used an old slug: the current one */
  redirectTo?: string
}

export const blogApi = {
  list: (page: number, size: number, signal?: AbortSignal) =>
    apiRequest<Page<BlogCard>>(`/api/blog?page=${page}&size=${size}`, { signal }),
  post: (slug: string, signal?: AbortSignal) => apiRequest<BlogPostDetail>(`/api/blog/${encodeURIComponent(slug)}`, { signal }),
}
