import { Images, LayoutTemplate, Puzzle, type LucideIcon } from 'lucide-react'
import type { AuthorModuleKey } from './authorApi'

export interface AuthorModule {
  key: AuthorModuleKey
  label: string
  to: string
  icon: LucideIcon
  /** One sentence, on the overview card */
  summary: string
  /** What the module will do, on its own page */
  description: string
  /** Built already (no "Sắp có") */
  ready?: boolean
}

/** The three modules, in menu order (the overview cards, the menu and the placeholder pages read from here). */
export const AUTHOR_MODULES: AuthorModule[] = [
  {
    key: 'sites',
    label: 'Sites',
    to: '/author/sites',
    icon: LayoutTemplate,
    summary: 'Dựng trang cho website bằng các khối nội dung có sẵn.',
    description:
      'Tạo và sắp xếp trang từ các component (banner, khối chữ, lưới sản phẩm…), xem trước bản nháp qua link riêng rồi publish khi đã sẵn sàng.',
  },
  {
    key: 'assets',
    label: 'Assets',
    to: '/author/assets',
    icon: Images,
    summary: 'Kho ảnh và tài liệu PDF dùng chung cho mọi trang.',
    ready: true,
    description:
      'Tải lên, sắp xếp theo thư mục và gắn mô tả cho ảnh và PDF, để dùng lại ở Sites và Content Fragments mà không phải tải lại.',
  },
  {
    key: 'fragments',
    label: 'Content Fragments',
    to: '/author/fragments',
    icon: Puzzle,
    summary: 'Nội dung có cấu trúc theo mẫu, dùng lại ở nhiều nơi.',
    ready: true,
    description:
      'Soạn nội dung theo content model (ví dụ: câu hỏi thường gặp, cảm nhận khách hàng) để một nội dung hiển thị nhất quán ở nhiều trang.',
  },
]

export const authorModule = (key: AuthorModuleKey) => AUTHOR_MODULES.find((m) => m.key === key)!
