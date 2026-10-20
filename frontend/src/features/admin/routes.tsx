import type { ComponentType } from 'react'
import { Outlet, type RouteObject } from 'react-router-dom'
import { RequireRole } from '../auth/RequireRole'
import { SignedOutOnly } from '../auth/SessionRedirects'
import { AdminArea } from './AdminParts'

/** A route whose page is in its own chunk, loaded when first opened (admin is a desktop tool; phones never download it). */
function page(load: () => Promise<{ Component: ComponentType }>): Pick<RouteObject, 'lazy'> {
  return { lazy: load }
}

/**
 * Admin routes: the 8 designed pages (`a-*`), the 6 nav items without a
 * design (decision 17: every sidebar item has a page), notifications,
 * account, the full map and staff sign-in (decision 8).
 */
export const adminRoutes: RouteObject[] = [
  {
    path: '/admin/login',
    element: (
      <SignedOutOnly>
        <Outlet />
      </SignedOutOnly>
    ),
    children: [{ index: true, ...page(() => import('./pages/AdminLogin').then((m) => ({ Component: m.AdminLogin }))) }],
  },
  {
    path: '/admin/password',
    lazy: () => import('../customer/pages/AccountPages').then((m) => ({ element: <RequireRole role="admin"><m.ChangePassword back="/admin/account" /></RequireRole> })),
  }, // added
  {
    path: '/admin',
    element: <AdminArea />,
    children: [
      { index: true, ...page(() => import('./pages/Dashboard').then((m) => ({ Component: m.Dashboard }))) }, // a-dashboard
      { path: 'map', ...page(() => import('./pages/AccountPages').then((m) => ({ Component: m.LiveMapPage }))) }, // added
      { path: 'orders', ...page(() => import('./pages/Orders').then((m) => ({ Component: m.Orders }))) }, // a-orders
      { path: 'orders/new', ...page(() => import('./pages/CreateOrder').then((m) => ({ Component: m.CreateOrder }))) }, // a-create
      { path: 'customers', ...page(() => import('./pages/Customers').then((m) => ({ Component: m.Customers }))) }, // a-customers
      { path: 'riders', ...page(() => import('./pages/Riders').then((m) => ({ Component: m.Riders }))) }, // a-riders
      { path: 'riders/new', ...page(() => import('./pages/Riders').then((m) => ({ Component: m.NewRider }))) }, // added
      { path: 'stations', ...page(() => import('./pages/Stations').then((m) => ({ Component: m.Stations }))) }, // a-stations
      { path: 'areas', ...page(() => import('./pages/Areas').then((m) => ({ Component: m.Areas }))) }, // added
      { path: 'pricing', ...page(() => import('./pages/Pricing').then((m) => ({ Component: m.Pricing }))) }, // a-pricing
      { path: 'loyalty', ...page(() => import('./pages/Loyalty').then((m) => ({ Component: m.Loyalty }))) }, // added (a-pricing tab)
      { path: 'payments', ...page(() => import('./pages/Payments').then((m) => ({ Component: m.Payments }))) }, // added (a-pricing tab)
      { path: 'earnings', ...page(() => import('./pages/Earnings').then((m) => ({ Component: m.Earnings }))) }, // added
      { path: 'reports', ...page(() => import('./pages/Reports').then((m) => ({ Component: m.Reports }))) }, // added
      { path: 'support', ...page(() => import('./pages/Support').then((m) => ({ Component: m.Support }))) }, // a-support
      { path: 'settings', ...page(() => import('./pages/AccountPages').then((m) => ({ Component: m.Settings }))) }, // added
      { path: 'notifications', ...page(() => import('./pages/AccountPages').then((m) => ({ Component: m.AdminNotifications }))) }, // added
      { path: 'account', ...page(() => import('./pages/AccountPages').then((m) => ({ Component: m.AdminAccount }))) }, // added
    ],
  },
]
