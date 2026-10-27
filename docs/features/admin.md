# Admin dashboard

Status: built on mocks (Phase 6, 2026-10-20). Design source:
`design/MmiriOma-design-handoff` (`a-*` screens); decisions in
[docs/design/handoff-v1.md](../design/handoff-v1.md).

## 1. Overview and purpose

The staff tool for running deliveries: see the day at a glance, assign
riders, create orders for customers who call, approve or suspend riders,
open and close refill stations, set prices, points and delivery fees,
confirm payments and payouts, resolve delivery problems, and look back
through reports and the audit log.

## 2. Feature workflow

1. **Sign in** at `/admin/login` (staff accounts only; no sign-up). In mock
   mode a "Use demo staff account" button fills in the demo admin.
2. **Dashboard** (`/admin`): today's numbers, the drawn live map, orders by
   status and type, recent activity, recent orders, stations.
3. **Orders** (`/admin/orders`): filter, search, select an order. Before the
   water is collected, assign or reassign an eligible rider (approved, right
   vehicle and tank size, not declined before); the rider gets it on their
   dashboard and must start it or decline with a reason. Cancel with a reason.
4. **Create order** (`/admin/orders/new`): pick or add a customer, delivery
   type, details, address (or add one), payment method; the price comes from
   the current price list. Then leave it in the pool or assign a rider.
5. **Customers**: profile, manual phone verification (FR-003), point
   adjustments, links to their support history and payment records.
6. **Riders**: approve (pending), suspend (reason; goes offline, assigned
   orders back to the pool), reactivate; add a rider from the office.
7. **Refill stations**: open or close (partners are told), edit, add (starts
   closed), upload water-source papers with an expiry date, loading log.
   Closed stations and expired or missing papers are never used for new
   orders (FR-012).
8. **Service areas**: which areas take orders, the serving station, the road
   distance and an optional fixed delivery fee.
9. **Pricing / Loyalty points / Payouts and payments**: edit the price list
   (Keke can prices, delivery and rider pay; tanker water by source, delivery
   and driver pay; delivery fee methods; points rules). Each save is a new
   version; placed orders keep their price (FR-024). Confirm payments
   (FR-040) and pay refunds as points (Terms §7).
10. **Rider earnings**: wallets and payout requests; mark a payout sent.
11. **Reports**: orders, deliveries and sample revenue by area, rider and
    station for today, 7 or 30 days; CSV download.
12. **Support**: issues from customers, riders and drivers. Resolve with one
    action and a reason: confirm the delivery without the code, put the order
    back in the pool, add goodwill points, cancel, or call both and close.
13. **Settings**: operations values still marked as placeholders, staff list,
    full audit log. The support number and WhatsApp are not set here: they
    come from the backend's settings (FR-055, docs/api/public-site.md; the
    "Company WhatsApp" field was removed in #57).
    "Reset sample data" (mock only) asks for confirmation first. **Notifications**, **My account** (change password, log
    out) and the **full map** complete the header links.

## 3. Important files

| Path | Responsibility |
| --- | --- |
| `frontend/src/features/admin/routes.tsx` | Admin routes; each page is its own chunk (`lazy`) |
| `frontend/src/features/admin/adminApi.ts` | Typed API functions (mock or `not_connected`) |
| `frontend/src/features/admin/queries.ts` | Query hooks; every admin mutation refreshes all admin, partner and customer queries |
| `frontend/src/features/admin/AdminParts.tsx` | Admin area guard, page frame with live badge counts, headings, chips, link tabs, naira input |
| `frontend/src/features/admin/AdminMap.tsx` | The drawn live map (positions by area, not GPS) |
| `frontend/src/features/admin/adminFormat.ts` | Status labels and colours, time-ago, money tabs |
| `frontend/src/features/admin/pages/` | The pages |
| `frontend/src/domain/admin.ts` | Admin types |
| `frontend/src/mocks/adminMock.ts` | Mock admin server and its rules |
| `frontend/src/mocks/adminState.ts` | Current price list, station choice (FR-012), activity, audit and notification helpers shared by all mocks |
| `frontend/src/mocks/adminSeed.ts` | Stations, areas, price versions, issues, activity, staff (design samples) |
| `frontend/src/mocks/pricing.ts` | Quote rules over a price list, including the delivery fee methods |

## 4. Database models and relationships

None in this fork. The mock follows the SRS entities: price list versions
(pricing rules), stations with source papers, service zones, assignments,
payments, support incidents with resolutions, and an audit log. Admin orders
join the customer order (owner, payment) and the dispatch job (rider, stage)
by reference.

## 5. API endpoints and request/response behavior

Only the Sprint 1 admin order list and detail exist in
[docs/api/orders.md](../api/orders.md), in a different shape (litres, no
delivery type, price or rider). Everything else needs contracts: assignment
(eligible riders, assign, reassign), cancel with reason, staff-created orders
and customers, phone verification, point adjustment, partner approval, station
open/close/edit/papers, service areas, versioned price lists, payment
confirmation and refunds as points, payouts, reports, support resolution,
audit log, admin notifications, settings. Error codes used by the mock:
`forbidden` (403), `order_not_found`, `customer_not_found`, `rider_not_found`,
`station_not_found`, `issue_not_found` (404), `already_collected`,
`already_assigned`, `order_closed`, `no_station_open`, `papers_not_valid`,
`invalid_approval_change`, `invalid_payment_change`, `already_resolved`,
`already_paid`, `no_changes`, `phone_already_registered`, `area_exists` (409),
`rider_not_eligible`, `manual_quote_required`, `insufficient_points`,
`validation_error` (422).

## 6. Important business rules

- Staff only (FR-001). Sensitive actions need a reason and are audited.
- One rider per order; admin may assign or reassign until the water is
  collected; after that, problems go through Support (decision 13).
- Stations: only open stations with valid papers serve new orders (FR-012).
- Prices: every change is a version; placed orders keep their quote
  (FR-024). Ninth Mile tanker water has its own price (decision 10b).
- Delivery fee (decision 10a): with both methods off, the flat fee in the
  price list; "fixed fee per area" wins where the area has a fee; otherwise
  "rate per km" × the area's road distance, rounded to whole naira.
- Payments are confirmed by staff and shown apart from delivery (FR-040,
  BR-07). Refunds are paid as points, never cash (Terms §7); sample rate
  1 point = ₦1.
- Phone verification is manual (FR-003); unverified customers show a warning.
- All money, points, pay and loading counts are SAMPLES (decision 10, 16).

## 7. Authentication and authorization

`/admin/*` needs a signed-in `admin` (RequireRole); others are sent to their
own home, signed-out visitors to `/admin/login`. The mock checks the role on
every call (403 `forbidden`). There are no separate staff permissions yet
(super admin, dispatcher, support all see everything); see Known limitations.

## 8. Error handling and edge cases

- Every page has loading, error and empty states; errors show next to the
  action that caused them.
- Assigning a collected order, opening a station without valid papers, saving
  an unchanged price list, and resolving an issue twice give clear messages.
- Orders and support refresh every 30 seconds; the panel stays on the order
  you acted on.
- Every admin page works on desktop (the main use), tablet and phone. From
  1024 px the sidebar and detail panels sit beside the content; below that
  the sidebar is a drawer and details stack under the list, and picking an
  item scrolls its details into view. Tables become one card per row below
  768 px; the service area and price editors become labelled cards. Checked
  at 390, 768, 1024 and 1440 px with no sideways page scroll.

## 9. Testing instructions

```bash
cd frontend
npm test
```

`src/mocks/admin.test.ts`: staff-only access, dashboard numbers, eligible
riders, assign and reassign, cancel and refunds, staff-created orders, FR-012
station rules, versioned prices reaching customer quotes, the area fee,
suspension, phone verification, support resolutions.
`src/features/admin/admin.test.tsx`: sign-in redirect, dashboard, assigning
from the orders panel. Manual (mock mode): sign in at `/admin/login` with the
demo admin in `src/mocks/adminSeed.ts`; assign MO-6RTA to Chinedu, then sign
in as the demo rider and see the "New order for you" sheet.

## 10. Known limitations

- No staff roles or permissions beyond "admin"; staff accounts come from the
  command-line tool.
- The live map is a drawing; there is no rider location (decision 14).
- Settings values (support hours, code time limit, safe load) are stored but
  the apps still show the placeholders until they are agreed and connected.
- Confirmation dialogs (`ConfirmDialog`) guard: Mark paid / Confirm transfer,
  approve / suspend / reactivate a rider, log out, reset sample data. Cancel
  order already had its own reason panel.
- Papers uploads keep only the file name in mock mode.
- Delivery distances are entered per area by admin, not measured.
- Report revenue uses sample prices and only delivered orders.
