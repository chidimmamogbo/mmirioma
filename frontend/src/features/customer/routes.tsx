import { Navigate, type RouteObject } from 'react-router-dom'
import { POINTS_ENABLED } from '../../lib/features'
import { SignedOutOnly } from '../auth/SessionRedirects'
import { CustomerArea } from './CustomerArea'

/**
 * Customer app routes. Handoff screen ids are noted for each; routes marked
 * "added" are built from existing patterns (docs/design/handoff-v1.md).
 * Each page is lazy (its own chunk), so the landing page and the partner app
 * do not download customer screens.
 */
export const customerRoutes: RouteObject[] = [
  { path: '/signin', lazy: () => import('./pages/SignIn').then((m) => ({ element: <SignedOutOnly><m.SignIn /></SignedOutOnly> })) }, // c-signin
  { path: '/signup', lazy: () => import('./pages/SignUp').then((m) => ({ element: <SignedOutOnly><m.SignUp /></SignedOutOnly> })) }, // c-signup
  { path: '/forgot-password', lazy: () => import('./pages/AccountPages').then((m) => ({ Component: m.ForgotPassword })) }, // added
  { path: '/support/contact', lazy: () => import('./pages/SupportContact').then((m) => ({ Component: m.SupportContact })) }, // added
  {
    element: <CustomerArea />,
    children: [
      { path: '/home', lazy: () => import('./pages/Home').then((m) => ({ Component: m.Home })) }, // c-home
      { path: '/menu', lazy: () => import('./pages/Menu').then((m) => ({ Component: m.Menu })) }, // c-menu
      { path: '/order', lazy: () => import('./pages/order/DeliveryType').then((m) => ({ Component: m.DeliveryType })) }, // c-type
      { path: '/order/keke', lazy: () => import('./pages/order/KekeOrder').then((m) => ({ Component: m.KekeOrder })) }, // c-keke
      { path: '/order/tanker', lazy: () => import('./pages/order/TankerOrder').then((m) => ({ Component: m.TankerOrder })) }, // c-tanker
      { path: '/order/details', lazy: () => import('./pages/order/DeliveryDetails').then((m) => ({ Component: m.DeliveryDetails })) }, // c-details
      { path: '/order/address', lazy: () => import('./pages/order/AddressPick').then((m) => ({ Component: m.AddressPick })) }, // c-address-pick
      { path: '/order/save-address', lazy: () => import('./pages/order/SaveAddress').then((m) => ({ Component: m.SaveAddress })) }, // c-save
      { path: '/order/review', lazy: () => import('./pages/order/Review').then((m) => ({ Component: m.Review })) }, // c-review
      { path: '/orders', lazy: () => import('./pages/Orders').then((m) => ({ Component: m.Orders })) }, // c-orders
      { path: '/orders/:reference', lazy: () => import('./pages/OrderDetail').then((m) => ({ Component: m.OrderDetail })) }, // c-order-detail
      { path: '/orders/:reference/placed', lazy: () => import('./pages/order/OrderPlaced').then((m) => ({ Component: m.OrderPlaced })) }, // c-confirmed
      { path: '/orders/:reference/track', lazy: () => import('./pages/order/Track').then((m) => ({ Component: m.Track })) }, // c-track
      { path: '/orders/:reference/delivered', lazy: () => import('./pages/order/Delivered').then((m) => ({ Component: m.Delivered })) }, // c-delivered
      { path: '/orders/:reference/receipt', lazy: () => import('./pages/Receipt').then((m) => ({ Component: m.Receipt })) }, // added
      // c-points; hidden for the pilot (POINTS_ENABLED), so old links go home.
      POINTS_ENABLED
        ? { path: '/points', lazy: () => import('./pages/Points').then((m) => ({ Component: m.Points })) }
        : { path: '/points', element: <Navigate to="/home" replace /> },
      { path: '/addresses', lazy: () => import('./pages/SavedAddresses').then((m) => ({ Component: m.SavedAddresses })) }, // c-saved
      { path: '/addresses/new', lazy: () => import('./pages/AddressForm').then((m) => ({ Component: m.AddressForm })) }, // added
      { path: '/addresses/:id/edit', lazy: () => import('./pages/AddressForm').then((m) => ({ Component: m.AddressForm })) }, // added
      { path: '/notifications', lazy: () => import('./pages/Notifications').then((m) => ({ Component: m.Notifications })) }, // c-notifications
      { path: '/support', lazy: () => import('./pages/Support').then((m) => ({ Component: m.Support })) }, // c-support
      { path: '/profile', lazy: () => import('./pages/Profile').then((m) => ({ Component: m.Profile })) }, // c-profile
      { path: '/profile/email', lazy: () => import('./pages/AccountPages').then((m) => ({ Component: m.EmailSettings })) }, // added
      { path: '/settings', lazy: () => import('./pages/Profile').then((m) => ({ Component: m.AccountSettings })) }, // added (#57)
      { path: '/profile/password', lazy: () => import('./pages/AccountPages').then((m) => ({ element: <m.ChangePassword back="/settings" /> })) }, // added
      { path: '/profile/phone', lazy: () => import('./pages/ChangePhone').then((m) => ({ Component: m.ChangePhone })) }, // P1-P3 (docs/design/phone-verification.md)
      { path: '/verify-phone', lazy: () => import('./pages/VerifyPhone').then((m) => ({ Component: m.VerifyPhone })) }, // V1-V3 (docs/design/phone-verification.md)
      { path: '/profile/delete', lazy: () => import('./pages/AccountPages').then((m) => ({ Component: m.DeleteAccount })) }, // added
    ],
  },
]
