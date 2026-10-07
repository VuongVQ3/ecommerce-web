import { useSearchParams } from 'react-router'
import { safeNextPath } from '../lib/redirect'

/** Where to go after signing in: the validated ?next= target, or the home page. */
export function useNextPath(): string {
  const [params] = useSearchParams()
  return safeNextPath(params.get('next'))
}
