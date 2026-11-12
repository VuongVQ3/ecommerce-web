import type { AuthorSession } from './authorApi'

type Flags = Pick<AuthorSession, 'canPublish' | 'canDelete' | 'canManageModels'>

const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} và ${items[items.length - 1]}` : items[0])

/** "Bạn có thể …; chỉ ADMIN được …", built from the session flags (never from the role). */
export function permissionSentence(session: Flags): string {
  const may = ['soạn nháp', 'tải lên', 'xem trước']
  const mayNot: string[] = []
  const add = (allowed: boolean, what: string) => (allowed ? may : mayNot).push(what)
  add(session.canPublish, 'publish')
  add(session.canDelete, 'xoá nội dung')
  add(session.canManageModels, 'sửa content model')
  const sentence = `Bạn có thể ${list(may)}`
  return mayNot.length ? `${sentence}; chỉ ADMIN được ${list(mayNot)}.` : `${sentence}.`
}
