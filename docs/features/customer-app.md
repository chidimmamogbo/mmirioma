# Customer app (new design, fork)

Status: frontend built on mocks (Phase 3 of the new-design frontend). No
backend endpoints exist for most of it yet. Design source:
`design/MmiriOma-design-handoff` (customer screens `c-*`); decisions in
[docs/design/handoff-v1.md](../design/handoff-v1.md).

## 1. Overview and purpose

The mobile web app customers use to order water by Keke (jerrycans) or
Tanker, follow the delivery, give the delivery code, rate it, and manage
addresses, points, notifications, support and their profile.

## 2. Feature workflow

1. **Sign in / create account** (`/signin`, `/signup`): phone number and
   password only. New accounts go straight to home; the phone stays
   unverified until staff verify it manually (FR-003).
2. **Home** (`/home`): delivery address, order by Keke or Tanker, quick
   actions (Reorder, Addresses, Points, My orders), latest order.
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
   refreshes every 20 s) → **Delivered** (`/orders/:ref/delivered`, points,
   rating, "did they pour it in").
7. **Account**: orders list and details (with receipt), points, saved
   addresses, notifications, support (report a problem, contact), profile
   (optional email, update preferences, change password, delete request).

## 3. Important files

| Path | Responsibility |
| --- | --- |
| `frontend/src/domain/orders.ts` | Order, quote, address, points, support and profile types; labels and display helpers |
| `frontend/src/features/customer/customerApi.ts` | Typed API functions: mocks in mock mode, `not_connected` error in real-API mode |
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
real API is on. Everything else has no agreed contract yet; the shapes are
in `domain/orders.ts` and follow the API conventions (snake_case, integer kobo
in `*_minor_units`, UTC timestamps). Contracts needed before integration:
quotes, orders (delivery type, jerrycans, tanks, source, stages, delivery
code), addresses, notifications, points, support tickets, profile and
preferences, feedback, password change, account deletion request.

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
  the server yet." instead of pretending to work.

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
- "Use points on my next order" starts an order; redeeming points at checkout
  is not built (no agreed rules).
- Password reset is via support only (no reset endpoint).
- The JS bundle is one 599 kB chunk (179 kB gzipped) until per-app code
  splitting is added.
