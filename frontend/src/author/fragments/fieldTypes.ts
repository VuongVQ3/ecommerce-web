import type { FieldDef, FieldType } from './cfApi'

/** Field types in the order the model editor offers them. */
export const FIELD_TYPES: { type: FieldType; label: string }[] = [
  { type: 'text', label: 'Chữ (một dòng)' },
  { type: 'textarea', label: 'Đoạn văn' },
  { type: 'markdown', label: 'Markdown' },
  { type: 'number', label: 'Số' },
  { type: 'boolean', label: 'Có / không' },
  { type: 'date', label: 'Ngày' },
  { type: 'datetime', label: 'Ngày giờ' },
  { type: 'enum', label: 'Chọn một trong danh sách' },
  { type: 'asset', label: 'Asset (ảnh, PDF)' },
  { type: 'fragment', label: 'Fragment khác' },
  { type: 'product', label: 'Sản phẩm' },
  { type: 'link', label: 'Đường dẫn' },
  { type: 'list', label: 'Danh sách giá trị' },
]

export const typeLabel = (type: FieldType) => FIELD_TYPES.find((t) => t.type === type)?.label ?? type

/** Types that can hold several values (a list is a list already, yes/no stays single). */
export const canBeMultiple = (type: FieldType) => type !== 'boolean' && type !== 'list'

/** Same rule as the server: camelCase, starts with a lowercase letter, up to 40 characters. */
export const FIELD_NAME = /^[a-z][a-zA-Z0-9]{0,39}$/

/** "Chữ trên nút" → "chuTrenNut" (suggested name while typing the label of a new field). */
export function camelName(label: string): string {
  const words = label
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const name = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('')
  const valid = /^[a-z]/.test(name) ? name : name ? `f${name}` : ''
  return valid.slice(0, 40)
}

export const emptyField = (): FieldDef => ({ name: '', label: '', type: 'text', required: false, multiple: false, help: null, rules: {} })

/** Rules that make sense for the type (others are dropped when the type changes). */
export function rulesFor(field: FieldDef): FieldDef['rules'] {
  const r = field.rules
  const valueType = field.type === 'list' ? (r.itemType ?? 'text') : field.type
  const keep: FieldDef['rules'] = {}
  if (['text', 'textarea', 'markdown', 'link'].includes(valueType) && r.maxLength) keep.maxLength = r.maxLength
  if (valueType === 'number') {
    if (r.min !== undefined) keep.min = r.min
    if (r.max !== undefined) keep.max = r.max
  }
  if (field.type === 'enum') keep.options = r.options ?? []
  if (field.type === 'asset' && r.allowedKinds?.length) keep.allowedKinds = r.allowedKinds
  if (field.type === 'fragment' && r.allowedModels?.length) keep.allowedModels = r.allowedModels
  if (field.type === 'list') keep.itemType = r.itemType ?? 'text'
  if ((field.multiple || field.type === 'list') && r.maxItems) keep.maxItems = r.maxItems
  return keep
}
