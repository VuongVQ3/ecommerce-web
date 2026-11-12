import { NavLink } from 'react-router'

const tab = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`

/** Fragments / Models switch at the top of both lists. */
export function FragmentsTabs() {
  return (
    <nav aria-label="Content Fragments" className="mb-4 inline-flex rounded-xl bg-stone-100 p-1">
      <NavLink to="/author/fragments" end className={tab}>
        Fragments
      </NavLink>
      <NavLink to="/author/fragments/models" className={tab}>
        Models
      </NavLink>
    </nav>
  )
}
