/** A CMS page as the public API delivers it (GET /api/content/pages?path=…), references resolved. */
export interface DeliveredAsset {
  id: string
  kind: 'IMAGE' | 'PDF'
  title: string
  url: string
  alt: string | null
  width: number | null
  height: number | null
  pageCount: number | null
  renditions: { thumb?: string; card?: string; hero?: string; og?: string }
  stableUrl: string
}

export interface DeliveredMarkdown {
  markdown: string
  html: string
}

export interface ProductCardData {
  id: number
  slug: string
  name: string
  price: number
  image: string | null
}

/** A fragment as the delivery API renders it (data values resolved, markdown as {markdown, html}). */
export interface DeliveredFragment {
  id: string
  model: string
  title: string
  data?: Record<string, unknown>
}

export interface DeliveredBlock {
  id: string
  type: string
  props: Record<string, unknown>
  children?: DeliveredBlock[]
}

export interface DeliveredPage {
  id: string
  path: string
  template: string
  title: string
  version: number | null
  publishedAt: string | null
  preview?: boolean
  properties: {
    seoTitle?: string | null
    seoDescription?: string | null
    ogImage?: DeliveredAsset | null
    noindex?: boolean | null
    showInMenu?: boolean | null
  }
  regions: { main: DeliveredBlock[] }
}
