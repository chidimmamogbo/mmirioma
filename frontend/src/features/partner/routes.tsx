import type { RouteObject } from 'react-router-dom'
import { RequireRole } from '../auth/RequireRole'
import { SignedOutOnly } from '../auth/SessionRedirects'
import { PARTNER_PAY_ENABLED } from '../../lib/features'
import { PartnerArea, PartnerHomeRedirect } from './PartnerArea'

/**
 * Partner routes, all under `/partner/` so the installed partner app owns
 * them (its manifest scope). `/partner/login`, `/signup` and friends are
 * shared sign-in and account plumbing; `/partner/rider/*` is the Keke rider
 * app (`r-*` screens) and `/partner/driver/*` the tanker driver app (`t-*`
 * screens; the screens the tanker menu borrows from the rider app are
 * shared). "Added" routes are built from existing patterns. Each page is
 * lazy (its own chunk), so customers never download partner screens.
 */
export const partnerRoutes: RouteObject[] = [
  { path: '/partner/login', lazy: () => import('./pages/PartnerLogin').then((m) => ({ element: <SignedOutOnly><m.PartnerLogin /></SignedOutOnly> })) }, // r-login
  { path: '/partner/signup', lazy: () => import('./pages/PartnerSignup').then((m) => ({ Component: m.PartnerSignupPage })) }, // added; handles a signed-in customer itself
  { path: '/partner/forgot-password', lazy: () => import('../customer/pages/AccountPages').then((m) => ({ element: <m.ForgotPassword back="/partner/login" contact="/partner/contact" /> })) }, // added
  { path: '/partner/contact', lazy: () => import('../customer/pages/SupportContact').then((m) => ({ element: <m.SupportContact back={-1} /> })) }, // added
  { path: '/partner/password', lazy: () => import('../customer/pages/AccountPages').then((m) => ({ element: <RequireRole role="driver"><m.ChangePassword back="/partner" /></RequireRole> })) }, // added
  { path: '/partner', element: <PartnerHomeRedirect /> },
  {
    path: '/partner/rider',
    element: <PartnerArea vehicle="keke" />,
    children: [
      { index: true, lazy: () => import('./pages/RiderHome').then((m) => ({ Component: m.RiderHome })) }, // r-home
      { path: 'assigned/:reference', lazy: () => import('./pages/RiderHome').then((m) => ({ Component: m.RiderHome })) }, // r-assigned (sheet over home)
      { path: 'menu', lazy: () => import('./pages/PartnerAccount').then((m) => ({ Component: m.PartnerMenu })) }, // r-menu
      { path: 'orders', lazy: () => import('./pages/AvailableOrders').then((m) => ({ Component: m.AvailableOrders })) }, // r-available
      { path: 'orders/:reference', lazy: () => import('./pages/JobDetail').then((m) => ({ Component: m.JobDetail })) }, // r-order
      { path: 'jobs/:reference/refill', lazy: () => import('./pages/RiderTrip').then((m) => ({ Component: m.RefillStep })) }, // r-refill
      { path: 'jobs/:reference/pickup', lazy: () => import('./pages/RiderTrip').then((m) => ({ Component: m.PickupStep })) }, // r-pickup
      { path: 'jobs/:reference/customer', lazy: () => import('./pages/RiderTrip').then((m) => ({ Component: m.CustomerStep })) }, // r-customer
      { path: 'jobs/:reference/code', lazy: () => import('./pages/CodeStep').then((m) => ({ Component: m.CodeStep })) }, // r-otp, r-otp-error
      { path: 'jobs/:reference/done', lazy: () => import('./pages/RiderDone').then((m) => ({ Component: m.RiderDone })) }, // r-done
      // Driver cash (K1, K2; docs/design/driver-cash.md, #20).
      { path: 'jobs/:reference/cash', lazy: () => import('./cash/CashPages').then((m) => ({ Component: m.RecordCash })) }, // K1 Record cash
      { path: 'cash', lazy: () => import('./cash/CashPages').then((m) => ({ Component: m.MyCash })) }, // K2 My cash
      { path: 'cash/handover', lazy: () => import('./cash/CashPages').then((m) => ({ Component: m.HandOverCash })) }, // K2 Hand over cash
      { path: 'jobs/:reference/decline', lazy: () => import('./pages/PartnerShared').then((m) => ({ Component: m.DeclineJob })) }, // added
      // r-earnings; partner pay is out of the MVP (#157), so old links go home.
      ...(PARTNER_PAY_ENABLED
        ? [
            { path: 'earnings', lazy: () => import('./pages/RiderEarnings').then((m) => ({ Component: m.RiderEarnings })) },
            { path: 'earnings/withdraw', lazy: () => import('./pages/RiderEarnings').then((m) => ({ Component: m.WithdrawRequest })) }, // added
          ]
        : [
            { path: 'earnings', element: <PartnerHomeRedirect /> },
            { path: 'earnings/withdraw', element: <PartnerHomeRedirect /> },
          ]),
      { path: 'history', lazy: () => import('./pages/PartnerShared').then((m) => ({ Component: m.PartnerHistory })) }, // r-history
      { path: 'notifications', lazy: () => import('./pages/PartnerShared').then((m) => ({ Component: m.PartnerNotifications })) }, // r-notifications
      { path: 'vehicle', lazy: () => import('./pages/PartnerShared').then((m) => ({ Component: m.PartnerVehicle })) }, // r-vehicle
      { path: 'issue', lazy: () => import('./pages/PartnerShared').then((m) => ({ Component: m.PartnerIssue })) }, // r-issue
      { path: 'profile', lazy: () => import('./pages/PartnerAccount').then((m) => ({ Component: m.PartnerProfilePage })) }, // added
      { path: 'settings', lazy: () => import('./pages/PartnerAccount').then((m) => ({ Component: m.PartnerSettings })) }, // added
    ],
  },
  {
    path: '/partner/driver',
    element: <PartnerArea vehicle="tanker" />,
    children: [
      { index: true, lazy: () => import('./pages/DriverHome').then((m) => ({ Component: m.DriverHome })) }, // t-home
      { path: 'assigned/:reference', lazy: () => import('./pages/DriverHome').then((m) => ({ Component: m.DriverHome })) }, // r-assigned pattern (sheet over home)
      { path: 'menu', lazy: () => import('./pages/PartnerAccount').then((m) => ({ Component: m.PartnerMenu })) }, // t-menu
      { path: 'orders', lazy: () => import('./pages/DriverOrders').then((m) => ({ Component: m.DriverOrders })) }, // t-available
      { path: 'orders/:reference', lazy: () => import('./pages/JobDetail').then((m) => ({ Component: m.JobDetail })) }, // t-order
      { path: 'jobs/:reference/refill', lazy: () => import('./pages/DriverTrip').then((m) => ({ Component: m.DriverRefill })) }, // t-refill
      { path: 'jobs/:reference/loading', lazy: () => import('./pages/DriverTrip').then((m) => ({ Component: m.DriverLoading })) }, // t-loading
      { path: 'jobs/:reference/pickup', lazy: () => import('./pages/RiderTrip').then((m) => ({ Component: m.PickupStep })) }, // redirects to loading
      { path: 'jobs/:reference/customer', lazy: () => import('./pages/DriverTrip').then((m) => ({ Component: m.DriverCustomer })) }, // t-customer
      { path: 'jobs/:reference/code', lazy: () => import('./pages/CodeStep').then((m) => ({ Component: m.CodeStep })) }, // t-otp
      { path: 'jobs/:reference/done', lazy: () => import('./pages/DriverDone').then((m) => ({ Component: m.DriverDone })) }, // t-done
      // Driver cash (K1, K2; docs/design/driver-cash.md, #20).
      { path: 'jobs/:reference/cash', lazy: () => import('./cash/CashPages').then((m) => ({ Component: m.RecordCash })) }, // K1 Record cash
      { path: 'cash', lazy: () => import('./cash/CashPages').then((m) => ({ Component: m.MyCash })) }, // K2 My cash
      { path: 'cash/handover', lazy: () => import('./cash/CashPages').then((m) => ({ Component: m.HandOverCash })) }, // K2 Hand over cash
      { path: 'jobs/:reference/decline', lazy: () => import('./pages/PartnerShared').then((m) => ({ Component: m.DeclineJob })) }, // added
      // t-earnings; hidden while partner pay is out of the MVP (#157).
      ...(PARTNER_PAY_ENABLED
        ? [
            { path: 'earnings', lazy: () => import('./pages/DriverEarnings').then((m) => ({ Component: m.DriverEarnings })) },
            { path: 'earnings/withdraw', lazy: () => import('./pages/RiderEarnings').then((m) => ({ Component: m.WithdrawRequest })) }, // added (Request payout)
          ]
        : [
            { path: 'earnings', element: <PartnerHomeRedirect /> },
            { path: 'earnings/withdraw', element: <PartnerHomeRedirect /> },
          ]),
      { path: 'history', lazy: () => import('./pages/PartnerShared').then((m) => ({ Component: m.PartnerHistory })) }, // r-history, tanker words
      { path: 'notifications', lazy: () => import('./pages/PartnerShared').then((m) => ({ Component: m.PartnerNotifications })) }, // r-notifications
      { path: 'vehicle', lazy: () => import('./pages/PartnerShared').then((m) => ({ Component: m.PartnerVehicle })) }, // r-vehicle, "Tanker and papers"
      { path: 'issue', lazy: () => import('./pages/PartnerShared').then((m) => ({ Component: m.PartnerIssue })) }, // r-issue
      { path: 'profile', lazy: () => import('./pages/PartnerAccount').then((m) => ({ Component: m.PartnerProfilePage })) }, // added
      { path: 'settings', lazy: () => import('./pages/PartnerAccount').then((m) => ({ Component: m.PartnerSettings })) }, // added
    ],
  },
]
