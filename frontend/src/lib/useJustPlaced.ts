import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

/**
 * True on the page the checkout just navigated to ({ state: { justPlaced: true } }). Browsers keep navigation state
 * across a reload, so the flag is read once and then removed from history: a reload shows the page without the
 * "order placed" banner.
 */
export function useJustPlaced(): boolean {
  const location = useLocation()
  const navigate = useNavigate()
  const fromCheckout = (location.state as { justPlaced?: boolean } | null)?.justPlaced === true
  const [justPlaced] = useState(fromCheckout)

  useEffect(() => {
    if (fromCheckout) navigate(location.pathname + location.search + location.hash, { replace: true, state: null })
  }, [fromCheckout, navigate, location.pathname, location.search, location.hash])

  return justPlaced
}
