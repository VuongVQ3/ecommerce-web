import { Badge, PageHeader } from '../admin/ui'
import type { AuthorModuleKey } from './authorApi'
import { authorModule } from './authorModules'

/** A module that is not built yet: its name, what it will do, and "Sắp có". No buttons that do nothing. */
export default function AuthorPlaceholderPage({ module }: { module: AuthorModuleKey }) {
  const m = authorModule(module)
  return (
    <>
      <PageHeader title={m.label} />
      <div className="max-w-2xl rounded-2xl border border-dashed border-stone-300 bg-white p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <m.icon aria-hidden className="size-5" strokeWidth={1.75} />
          </span>
          <Badge tone="gray">Sắp có</Badge>
        </div>
        <p className="mt-4 text-stone-700">{m.description}</p>
      </div>
    </>
  )
}
