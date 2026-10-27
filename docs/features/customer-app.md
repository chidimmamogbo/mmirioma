# Customer app (new design, fork)

Status: frontend built on mocks (Phase 3 of the new-design frontend). No
backend endpoints exist for most of it yet. Design source:
`design/MmiriOma-design-handoff` (customer screens `c-*`); decisions in
[docs/design/handoff-v1.md](../design/handoff-v1.md).

## 1. Overview and purpose

The mobile web app customers use to order water by Keke (jerrycans) or
Tanker, follow the delivery, give the delivery code, rate it, and manage
addresses, notifications, support and their profile. Points are built but
hidden for the pilot (see section 6).

## 2. Feature workflow

1. **Sign in / create account** (`/signin`, `/signup`): phone number and
   password only. New accounts go straight to home; the phone stays
   unverified until staff verify it manually (FR-003).
2. **Home** (`/home`): delivery address, order by Keke or Tanker, quick
   actions (Reorder, Addresses, My orders), latest order.
3. **Order** (`/order` → `/order/keke` or `/order/tanker`):
   - Keke: jerrycan size (25 or 50 L) and count (12, 24, 30, 60). No water source.
   - Tanker: tank type (ground, overhead), size (500, 750, 1,000 gallons or
     custom), approximate litres shown, water source (Ninth Mile or any
     borehole).
   - The summary shows the water price from the server. The delivery fee is
     added once the address is known.
4. **Address**: returning customers pick a saved address (`/order/address`);
   others enter details (`/order/details`), then choose how to keep a new
   address (`/order/save-address`).
5. **Review** (`/order/review`): price with the delivery fee, pay on
   delivery, place the order. A custom tank size sends a quote request to
   support instead.
6. **Order placed** (`/orders/:ref/placed`) → **Track** (`/orders/:ref/track`,
   refreshes every 20 s) → **Delivered** (`/orders/:ref/delivered`,
   rating, "did they pour it in").
7. **Account**: orders list and details (with receipt), saved
   addresses, notifications, support (report a problem, contact). **My
   profile** (`/profile`): name, stats, phone and its verification. **Account
   settings** (`/settings`, separate since #57, approved by @chidimmamogbo on
   2026-10-27): change password, change phone number, privacy notice, delete
   request, log out; the optional email and message switches show in mock
   mode only (out of the pilot, customer-account.md decisions 1 and 3).

## 3. Important files

| Path | Responsibility |
| --- | --- |
| `frontend/src/domain/orders.ts` | Order, quote, address, points, support and profile types; labels and display helpers |
| `frontend/src/features/customer/customerApi.ts` | Typed API functions: mocks in mock mode; in real-API mode the linked ones call `real/`, the rest fail with `not_connected` |
| `frontend/src/features/customer/real/order.ts` | Order adapters (#9): `createOrder`, `listOrders`, `getOrder` through `lib/api/orders.ts`, converted with `docs/architecture/api-mapping.md` |
| `frontend/src/features/customer/real/account.ts` | Account adapters (#88 part 1): `getProfile`, `listAddresses`, `setDefaultAddress`, `removeAddress` through `lib/api/customerAccount.ts` |
| `frontend/src/features/customer/real/orderStage.ts` | Backend order status to the customer stage |
| `frontend/src/features/customer/orderHelpers.ts` | Display helpers for fields the backend may not send (quantity, price, place, picture) |
| `frontend/src/features/customer/queries.ts` | TanStack Query hooks and cache refresh after changes |
| `frontend/src/features/customer/order/` | Order draft (sessionStorage), reorder and flow helpers |
| `frontend/src/features/customer/pages/` | One component per screen |
| `frontend/src/features/customer/routes.tsx` | Customer routes, with the handoff screen id per route |
| `frontend/src/features/auth/` | Session hooks, `RequireRole`, sign-in redirects, auth API switch |
| `frontend/src/mocks/` | Mock backend: store, seed data, pricing, auth and customer handlers |

## 4. Database models and relationships

None in this fork yet. The mock data follows the SRS entities (customers,
addresses, quotes, orders, order events, payments, feedback). Real models
need an agreed contract first.

## 5. API endpoints and request/response behavior

Uses the agreed auth contract ([docs/api/auth.md](../api/auth.md)) when the
real API is on, and, since #9, the orders endpoints: `POST /orders`,
`GET /orders` (every page) and `GET /orders/{reference}`
([orders.md](../api/orders.md),
[order-details-and-price.md](../api/order-details-and-price.md)).

- **Orders are quote requests for now.** Live prices (`POST /quotes`) and the
  service-zone picker are not linked yet, so `createOrder` sends the delivery
  details with no `quote_id` and the order starts in `quote_requested`. Review
  says the office calls to agree the price and delivery time, with no charge
  to cancel or redeliver (the agreed fallbacks F3 and F5), and the button is
  "Send request".
- **What the backend does not send is shown as missing**, never filled in:
  the price lines (total only), the saved address name, the payment status
  ("Pay on delivery" only), the rider, station, ETA, delivery code (sent by
  SMS), timeline events after "Order placed", points and feedback. A quote
  request shows "Preparing your price". An order sent before #21 has only its
  litres.
- **Unknown statuses** show the agreed neutral stage "Order update".

Since #88 part 1, also `GET /me/profile` and the saved addresses (list, set
the default, remove) from [customer-account.md](../api/customer-account.md):

- **The profile shows what the backend sends:** name, phone, verified,
  customer since, order and address counts. In real mode there is no email
  row, no message switches and no points stat (decisions 1, 3 and 12); the
  photo stays initials. Changing the photo still says "not connected".
- **Each saved address carries its area** (`zone`), kept for the live
  prices design (#79).
- **Adding or editing an address is not linked yet:** the backend needs an
  area, and the area picker waits for the #79 design, so these say "not
  connected" in real mode.

The other account screens (notifications, support, feedback, account
deletion) still use mocks until #82 builds them (#88 parts 2 and 3). Points
are out of the MVP and hidden in both modes (section 6). Where a screen still has no data
from the server, Home, the top bar, the menu and My profile take the name
and phone from the session (`GET /auth/me`). Change password
(`POST /auth/password`) and the support contact (`GET /public/contact`) are
linked (#57); the email row and message switches sit on Account settings
(`/settings`).

## 6. Important business rules

- Prices come only from the server (FR-022). The client never adds up
  prices; the mock server does it in `mocks/pricing.ts`. All amounts are
  SAMPLE and labelled.
- Delivery fee only once the address is known (decision 10).
- Water source for tanker orders only; Ninth Mile costs more (decision 10b).
- Custom tank sizes need a manual quote (FR-021).
- One order per checkout attempt: one idempotency key per draft, reused on
  every retry (FR-026).
- "Order placed" never claims the order is confirmed (FR-027). Unverified
  phones are called out: staff call before a rider is sent (FR-003).
- Payment is shown apart from delivery and is "paid" only after staff
  confirm it (FR-040, BR-07).
- ETA and "Near you" show only when an estimate exists (decision 14).
- No water-quality claims (decision 15).

- **Points are hidden for the pilot** (owner's decision on #107,
  2026-10-27): they are out of the MVP (`customer-account.md`, decision 12)
  but kept in the code to return after it. `POINTS_ENABLED` in
  `src/lib/features.ts` is `false`, so in mock and real mode alike the home
  tile and banner, the menu entry and balance, the delivered reward, the
  review estimate, order detail's points, the profile stat, the sign-in line
  and the deletion warning are not shown; `usePoints` never runs;
  `useNotifications` drops `points` messages; `/points` redirects to
  `/home`. Tested in `src/features/customer/pointsHidden.test.tsx`.

## 7. Authentication and authorization

All screens except sign-in, sign-up, forgot password, terms, privacy and
support contact need a signed-in **customer** (`RequireRole`). Other roles
are sent to their own home. The server (and the mock) enforce ownership:
another customer's order returns the same 404 as a missing one.

## 8. Error handling and edge cases

- Every data screen has loading, error (with "Try again") and empty states.
- Form errors show under the field with an icon and words; server
  `validation_error` details are mapped to fields.
- Sign-in: the same message for wrong phone or password; rate limit shows the
  wait; the phone number is kept (NFR-012).
- A lost connection keeps the order draft (sessionStorage); retrying "Place
  order" reuses the same idempotency key.
- In real-API mode, features without a backend show "… is not connected to
  the server yet." instead of pretending to work. Prices are the exception on
  Review: the order goes as a quote request instead (above).
- Order errors pass through unchanged: 403 `phone_not_verified` shows "Verify
  your phone number first"; 409 `idempotency_key_reused` and 422
  `validation_error` show their message; 404 `order_not_found` shows the
  order screen's error state.
- Feedback (#88 part 3, `PUT /orders/{reference}/feedback`, FR-051): one per
  order, sending again replaces it; rating before delivery is 409
  `order_not_delivered`. The screen sends its two answers; the optional ones
  stay unsent (customer-account.md, decision 7).

## 9. Testing instructions

```bash
cd frontend
npm test
```

- `src/mocks/mocks.test.ts`: pricing, auth, idempotency, ownership, points and
  feedback, address defaults.
- `src/features/customer/order/order.test.ts`: draft persistence, Keke has no
  source, flow, reorder.
- `src/features/customer/pages/SignIn.test.tsx`: sign-in screen behaviour.

Manual: `npm run dev`, open `http://127.0.0.1:5173/`, sign in with the demo
account in `src/mocks/seed.ts` (mock mode only), place a Keke order, use
"Demo: see delivered screen" on tracking.

## 10. Known limitations

- Mock data lives in this browser (localStorage) and survives closing the
  tab or the installed app. Nothing is sent to a server.
- Prices come from the admin's current price list; the delivery fee follows
  the admin's fee methods for the address's service area (see
  [admin.md](admin.md)). A new order fails with `no_station_open` (409) when
  no station is open with valid papers (FR-012).
- Maps are illustrations, not live maps; "Move pin" explains that pins are
  not available yet.
- Support phone, WhatsApp and hours are placeholders. Terms and privacy are
  the public pages ([public-pages.md](public-pages.md)) and need legal review.
- Points are hidden (`POINTS_ENABLED = false` in `src/lib/features.ts`).
  Turning them back on needs SRS rules, a contract and a backend first;
  redeeming points at checkout was never built.
- Password reset is via support only (no reset endpoint).
- The JS bundle is one 599 kB chunk (179 kB gzipped) until per-app code
  splitting is added.
- Support and account deletion (#88 part 4) are linked: "Report a problem"
  sends `POST /me/support-requests`, and the list also shows the open
  deletion request (`GET /me/deletion-request`). The screen gives no
  idempotency key, so the adapter keeps one per report until the server
  answers: a retry after a lost connection files it once. Asking to delete
  the account deletes nothing; staff verify it first (privacy notice §9).
