/**
 * Product features switched off for the pilot but kept in the code, so each
 * comes back with a one-line change once its requirement, contract and
 * backend exist.
 */

import { USE_MOCKS } from './api/mode'

/**
 * Loyalty points: points earned per delivery, the balance, rewards and the
 * "My points" page. Out of the MVP: neither the SRS nor the PRD defines them
 * and there is no backend (docs/api/customer-account.md, decision 12). The
 * owner decided on #107 (2026-10-27) to hide them rather than delete them, so
 * they can return after the MVP.
 *
 * While `false`, in mock and real mode alike: no screen shows points, the
 * points query never runs, points notifications are not listed, and `/points`
 * redirects to `/home`.
 */
export const POINTS_ENABLED = false

/**
 * Partner pay: rider and driver earnings, wallets and payouts. Out of the MVP:
 * no SRS requirement covers partner pay (docs/api/partners.md, decision 7).
 * Hidden rather than deleted, as points are (#156).
 *
 * While `false`: the admin menu offers no "Rider earnings" page,
 * `/admin/earnings` redirects to the dashboard, and the Payments page has no
 * "Rider payouts" link. `POINTS_ENABLED` does the same for the admin
 * "Loyalty points" page and its tab.
 */
export const PARTNER_PAY_ENABLED = false

/*
 * Mock-only admin actions (#221). The agreed contracts give these no endpoint
 * in the MVP, so with the real API they are hidden rather than left to answer
 * "not connected yet"; mock mode (`VITE_USE_MOCKS=true`) keeps the full demo.
 */

/**
 * The Payments page (`listPayments`, `confirmPayment`, `refundAsPoints`). The
 * Cash page replaces it: payment becomes paid when an administrator receives a
 * driver's handover (BR-07, docs/api/payments.md); transfers and refunds are
 * not in the pilot (admin-operations.md decisions 4 to 6; answer 1 on #221).
 *
 * While `false`: no "Payments" menu entry, no "Payment records" or "Go to
 * payments" link, and `/admin/payments` redirects to the dashboard.
 */
export const PAYMENTS_PAGE_ENABLED = USE_MOCKS

/**
 * Placing an order for a customer from the office (`createOrderForCustomer`,
 * `quoteForAdmin`, `createCustomer`). No admin endpoint, and neither the SRS
 * nor the PRD asks for it (admin-directory.md; answer 3 on #221).
 *
 * While `false`: no "+ Create order" or "Place order for ..." button, and
 * `/admin/orders/new` redirects to the dashboard.
 */
export const ORDER_FOR_CUSTOMER_ENABLED = USE_MOCKS

/**
 * Office edits to accounts the directory contract decided against
 * (admin-directory.md): marking a phone verified (`verifyCustomerPhone`; it is
 * verified by SMS code), adjusting points (`adjustPoints`) and adding a rider
 * (`addRider`; partners sign up themselves).
 *
 * While `false`: no "Mark phone verified", "Adjust points" or "+ Add rider"
 * button, and `/admin/riders/new` redirects to the dashboard.
 */
export const DIRECTORY_EDITS_ENABLED = USE_MOCKS

/**
 * Editing the customer profile (`updateProfile`): the photo, email and message
 * switches. customer-account.md has deliberately no `PATCH /me/profile` in the
 * pilot (answer 2 on #221). The real profile sends no email or switches, so
 * with the real API only the photo button needed hiding; the phone change
 * stays (`POST /auth/phone-change`).
 *
 * While `false`: My profile has no "Change photo" button.
 */
export const CUSTOMER_PROFILE_EDITS_ENABLED = USE_MOCKS

/**
 * Phone notifications (`getPushSettings`, `savePushSettings`): "not in the
 * MVP" (docs/api/push.md).
 *
 * While `false`: no "Phone notifications" row in the customer's Account
 * settings or the partner menu, and no "Turn on notifications" card on a home
 * screen ("Install the app" still shows).
 */
export const PUSH_ENABLED = USE_MOCKS

/**
 * Partner documents (`uploadDocument`): out of the MVP, the admin checks
 * papers in person (partners.md decision 6; answer 4 on #221). The real
 * profile sends no documents.
 *
 * While `false`: the vehicle page has no "Documents" section.
 */
export const PARTNER_DOCUMENTS_ENABLED = USE_MOCKS
