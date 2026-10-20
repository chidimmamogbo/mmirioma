import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { adminRoutes } from '../features/admin/routes'
import { RootRedirect } from '../features/auth/SessionRedirects'
import { customerRoutes } from '../features/customer/routes'
import { marketingRoutes } from '../features/marketing/routes'
import { partnerRoutes } from '../features/partner/routes'
import { LoadingScreen } from '../components/layout/StateScreens'
import { AppRoot } from './AppRoot'
import { RouteError } from './RouteError'
import { AdminGallery, FoundationPreview, Lazy, MenuGallery, MobileGallery } from './lazyPages'
import { NotFound } from './NotFound'

/*
 * Route table. Pages are code-split: each customer, partner and admin page
 * is a React Router `lazy` route with its own chunk, loaded the first time it
 * opens. The public landing pages stay in the main bundle so the shared link
 * opens at once; guards (CustomerArea, PartnerArea, AdminArea) stay too.
 * Public pages (`/`, `/faq`, `/terms`, `/privacy`) are in
 * features/marketing/routes.tsx, customer routes in features/customer, partner
 * routes (all under `/partner/`) in features/partner, staff routes (`/admin`,
 * each page its own chunk) in features/admin. `/app` is where the installed customer
 * app opens. The component gallery is lazy-loaded and only registered in
 * `npm run dev`.
 */

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      { path: '/dev/mobile', element: <Lazy><MobileGallery /></Lazy> },
      { path: '/dev/menu', element: <Lazy><MenuGallery /></Lazy> },
      { path: '/dev/admin', element: <Lazy><AdminGallery /></Lazy> },
      { path: '/dev/foundation', element: <Lazy><FoundationPreview /></Lazy> },
    ]
  : []

export const routes: RouteObject[] = [
  {
    element: <AppRoot />,
    // Shown while the first page's chunk loads (every app page is lazy; see below).
    hydrateFallbackElement: <LoadingScreen />,
    // Any error a page throws, including a chunk missing after a deploy.
    errorElement: <RouteError />,
    children: [
      ...marketingRoutes,
      { path: '/app', element: <RootRedirect /> },
      ...customerRoutes,
      ...partnerRoutes,
      ...adminRoutes,
      ...devRoutes,
      { path: '*', element: <NotFound /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
