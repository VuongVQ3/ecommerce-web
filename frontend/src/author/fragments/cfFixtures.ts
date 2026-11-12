import type { FieldDef, FragmentDetail, ModelDetail } from './cfApi'

/** Test data for the Content Fragment pages (imported by tests only). */
const field = (over: Partial<FieldDef> & Pick<FieldDef, 'name' | 'type'>): FieldDef => ({
  label: over.name,
  required: false,
  multiple: false,
  help: null,
  rules: {},
  ...over,
})

export const FAQ_MODEL: ModelDetail = {
  id: 1,
  name: 'Câu hỏi thường gặp',
  slug: 'faq',
  description: null,
  status: 'ENABLED',
  version: 1,
  fields: [
    field({ name: 'question', label: 'Câu hỏi', type: 'text', required: true, rules: { maxLength: 200 } }),
    field({ name: 'answer', label: 'Câu trả lời', type: 'markdown', required: true }),
    field({ name: 'order', label: 'Thứ tự', type: 'number', rules: { min: 0 } }),
  ],
  fragmentCount: 1,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  updatedByName: null,
}

/** One of every kind of control. */
export const MIXED_MODEL: ModelDetail = {
  ...FAQ_MODEL,
  id: 2,
  name: 'Đủ loại',
  slug: 'du-loai',
  fields: [
    field({ name: 'headline', label: 'Tiêu đề', type: 'text' }),
    field({ name: 'subline', label: 'Dòng phụ', type: 'textarea' }),
    field({ name: 'featured', label: 'Nổi bật', type: 'boolean' }),
    field({ name: 'size', label: 'Cỡ', type: 'enum', rules: { options: ['Nhỏ', 'Lớn'] } }),
    field({ name: 'startsAt', label: 'Bắt đầu', type: 'datetime' }),
    field({ name: 'day', label: 'Ngày', type: 'date' }),
    field({ name: 'image', label: 'Ảnh', type: 'asset', rules: { allowedKinds: ['IMAGE'] } }),
    field({ name: 'related', label: 'Liên quan', type: 'fragment', rules: { allowedModels: ['faq'] } }),
    field({ name: 'product', label: 'Sản phẩm', type: 'product' }),
    field({ name: 'ctaLink', label: 'Link', type: 'link' }),
    field({ name: 'tags', label: 'Tag', type: 'list', rules: { itemType: 'text' } }),
  ],
}

export function fragmentDetail(over: Partial<FragmentDetail> = {}): FragmentDetail {
  return {
    id: 'f1',
    model: FAQ_MODEL,
    folderPath: '/faq',
    name: 'giao-hang',
    title: 'Giao hàng',
    data: { question: 'Bao lâu?', answer: '2-3 ngày', order: 1 },
    status: 'DRAFT',
    publishedVersionId: null,
    publishedAt: null,
    publishAt: null,
    unpublishAt: null,
    createdAt: '2026-11-10T00:00:00Z',
    createdByName: 'Nhân Viên',
    updatedAt: '2026-11-11T00:00:00Z',
    updatedByName: 'Nhân Viên',
    versions: [
      { id: 'v2', versionNo: 2, title: 'Giao hàng', comment: null, createdAt: '2026-11-11T00:00:00Z', createdByName: 'Nhân Viên', published: false },
      { id: 'v1', versionNo: 1, title: 'Giao hàng', comment: 'Tạo mới', createdAt: '2026-11-10T00:00:00Z', createdByName: 'Nhân Viên', published: false },
    ],
    usages: [],
    refs: {},
    ...over,
  }
}
