import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { applyManifest } from '../features/pwa/manifest'
import { OfflineBanner } from '../features/pwa/OfflineBanner'
import { RouteProgress } from './RouteProgress'

/**
 * Root layout for every route. Points the page's manifest at the right
 * installable app as the path changes (customer or partner, see
 * features/pwa/manifest.ts), shows the page-loading bar and the offline
 * notice.
 */
export function AppRoot() {
  const { pathname } = useLocation()

  // Client-side navigation does not reload index.html, so the manifest link
  // is switched here whenever the path moves between the two apps.
  useEffect(() => applyManifest(pathname), [pathname])

  return (
    <>
      <RouteProgress />
      <Outlet />
      <OfflineBanner />
    </>
  )
}
