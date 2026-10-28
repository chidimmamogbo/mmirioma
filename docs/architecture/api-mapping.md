# API mapping: backend data to the new design

How every linking adapter converts between the fork's backend
(`frontend/src/lib/api/`, contracts in `docs/api/`) and the new design's types
(`frontend/src/domain/`). Every lane converts with these rules, so one value
never shows two ways on two screens. Change this file only in its own small
PR (CLAUDE.md, "Team fork workflow").

**Status:** draft for #5, 2026-10-26. Decided rules are marked with their
source. Open questions name the issue that settles them; until then the
affected function stays on mocks.

## Where adapters live

```
frontend/src/features/<feature>/
├── <feature>Api.ts      # what screens call; picks mock or real (USE_MOCKS)
└── real/
    └── <area>.ts        # adapter: calls lib/api/*, converts with this file
```

- Screens and components never import `lib/api/*` directly; they keep
  calling `<feature>Api.ts`, which keeps its signatures.
- Conversion functions are pure (backend type in, design type out) and have
  their own unit tests; the adapter only fetches and converts.
- `VITE_USE_MOCKS=true` keeps serving the full mock demo.

## Writing an adapter

Three pieces per linked function. The working example of the conversion
piece is `frontend/src/features/customer/real/orderStage.ts` with its test;
the order shown below is the shape #9 builds once #21 adds the order fields.

**1. The conversion:** pure, in `real/`, one per backend type. It never
invents a value: a field the backend does not send becomes the screen's
empty state (`null`), and the PR lists it.

```ts
// features/customer/real/order.ts
import type { CustomerOrder } from '../../../domain/orders'
import type { OrderRead } from '../../../lib/api/orders'
import { customerStageFromStatus } from './orderStage'

/** Backend order to the design's order (docs/architecture/api-mapping.md). */
export function customerOrderFromRead(read: OrderRead): CustomerOrder {
  // ...map each field with the rules in this file
}
```

**2. The adapter:** fetches with the client from `lib/api/` and converts.
It takes the client as its last parameter, defaulting to the shared
`apiClient`, so tests can pass one with a fake `fetch`. Errors pass through
unchanged: the client already turns every failure into an `ApiError`, and
screens show it with `ErrorBlock` / `errorMessage()`.

```ts
// features/customer/real/order.ts
import { apiClient, type ApiClient } from '../../../lib/api/client'
import { getOrder as fetchOrder } from '../../../lib/api/orders'

export async function getOrder(reference: string, client: ApiClient = apiClient): Promise<CustomerOrder> {
  return customerOrderFromRead(await fetchOrder(reference, undefined, client))
}
```

**3. The switch:** one line in `<feature>Api.ts`, replacing
`notConnected(...)`. The signature screens call does not change.

```ts
// features/customer/customerApi.ts
import * as real from './real/order'

export const getOrder = (reference: string): Promise<CustomerOrder> =>
  USE_MOCKS ? mock.getOrder(reference) : real.getOrder(reference)
```

**Tests** (`real/<area>.test.ts`), following `lib/api/orders.test.ts`: a
`createApiClient` with a fake `fetch`, then one test per outcome.

```ts
import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from '../../../lib/api/client'
import { getOrder } from './order'

function clientReturning(body: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  return createApiClient({ baseUrl: 'http://api.test', fetch })
}

describe('getOrder (real)', () => {
  it('converts the backend order', async () => {
    const order = await getOrder('MO-7KQ2M9XH4T', clientReturning(SAMPLE_ORDER_READ))
    expect(order.stage).toBe('on_the_way')
  })

  it('passes a backend error through as an ApiError', async () => {
    const client = clientReturning({ error: { code: 'order_not_found', message: 'Order not found', details: null } }, 404)
    await expect(getOrder('MO-X', client)).rejects.toMatchObject({ code: 'order_not_found' } satisfies Partial<ApiError>)
  })
})
```

Take sample bodies from `docs/api/examples/`, so tests and contract agree.

## Decisions (2026-10-26, @chidimmamogbo)

1. **The fork's backend follows the new design.** Orders gain a delivery
   type, the jerrycan or tank details, a water source and a price. Contract:
   #10. Build: #21. Customer order adapters (#9) wait for #21.
2. **Quantities are litres on the server, converted exactly.** See
   [Quantities](#quantities).
3. **Two new customer stages:** `failed` shows "Delivery failed" and
   `disputed` shows "Under review". See [Customer order stage](#customer-order-stage).
4. **No order below 600 litres.** Keke 12 × 25 L (300 L) is no longer
   offered; 12 cans stays for 50 L cans (`canCountsFor` in
   `frontend/src/domain/orders.ts`).

## Names

| Backend | New design | Rule |
| --- | --- | --- |
| role `driver` | "rider" (Keke) or "driver" (Tanker), together "partner" | One server role; the partner's vehicle type picks the word and the app (design decision 9) |
| role `admin` | "admin", "staff" | Same role |
| role `customer` | "customer" | Same role |
| `reference` (`MO-…`) | `reference` | Same value; `shortReference()` only shortens it for display |
| `contact_name`, `contact_phone` | `receiver_name`, `receiver_phone` | Same meaning: the person receiving the delivery |
| `delivery_address`, `landmark`, `delivery_instructions` | `address`, `landmark`, `instructions` | Same meaning |

## Quantities

Source: SRS v0.3 FR-021 and `backend/app/modules/orders/quantities.py`.

- The server stores whole **litres**. **1 local gallon = 4 litres, exactly**,
  so conversion never estimates.
- **Keke:** litres = can size × can count (`kekeTotalLitres`), sent as
  `quantity_litres`.
- **Tanker:** sent as `quantity_local_gallons`; the server stores gallons × 4
  (500 gal = 2,000 L, 750 gal = 3,000 L, 1,000 gal = 4,000 L).
- **Tanker capacity:** the gallons a driver types at sign-up × 4 is a
  *declared* capacity in litres, never `safe_payload_litres`. An
  administrator verifies it and records the vehicle's safe payload in litres
  (FR-013); assignment compares that verified value, litres with litres.
- **Minimum order: 600 litres.** The server rejects less (`validation_error`).
- **Display:** both units together, exactly, with the gallon value to at most
  two decimal places (601 L = 150.25 gal). Client-side conversion is display
  only; the server's value wins (FR-021). Screens change in #25.

## Money

- Integer **kobo** on both sides (SRS §5, BR-01). The design names amounts
  `*_minor_units`; keep the backend's field names in the adapter and rename
  only at the edge.
- Never compute a price in the client (FR-022). A missing price is shown as
  missing, never filled in.

## Phones, dates and times

- **Phones:** the server returns E.164 (`+2348012345678`); send whatever the
  user typed and let the server normalize it. Format for display with
  `frontend/src/lib/format/phone.ts`.
- **Timestamps:** UTC ISO strings on both sides; format for display in
  Africa/Lagos with `frontend/src/lib/format/datetime.ts`.
- **`preferred_delivery_date`:** a Lagos calendar date (`YYYY-MM-DD`), a
  preference, never a booked slot.

## Customer order stage

Backend `status` (docs/api/orders.md, "Order statuses") to the design's
`DeliveryStage`. The customer must not learn of an assignment before the
driver accepts it (FR-032). Before confirmation the order never reads as
waiting for a rider (FR-027): a quote request is "Request received" and a
priced order "Awaiting confirmation", the agreed label in
[orders.md](../api/orders.md) (decided by @chidimmamogbo on #79,
[customer-live-prices.md](../design/customer-live-prices.md), decision 3;
built in #121).

| Backend `status` | Design stage | Label |
| --- | --- | --- |
| `quote_requested` | `request_received` (new) | Request received ("We're preparing your price.") |
| `awaiting_confirmation` | `awaiting_confirmation` (new) | Awaiting confirmation |
| `confirmed`, `awaiting_payment` | `waiting_rider` | Waiting for rider |
| `assigned` | `waiting_rider` | Waiting for rider (FR-032: not accepted yet) |
| `accepted`, `departed` | `rider_assigned` | Rider assigned |
| `collected` | `picked_up` | Picked up |
| `en_route`, `arrived`, `unloading` | `on_the_way` | On the way |
| `delivered` | `delivered` | Delivered |
| `cancelled` | `cancelled` | Cancelled |
| `failed` | `failed` (new) | Delivery failed |
| `disputed` | `under_review` (new) | Under review |
| any value not listed | `order_update` | Order update (the agreed neutral wording, docs/api/orders.md, #82) |

Adapters must never fail on an unknown `status` (docs/api/orders.md).

The order timeline (`GET /orders/{reference}/history`, #155) uses this table:
"Order placed", then one step each time the stage changes, so `assigned`
adds nothing before the driver accepts.

## Partner job stage

Backend driver job (`lib/api/driverJobs.ts`: `status` plus the order
`status`) to the design's `JobStage`.

| Backend | Design stage |
| --- | --- |
| job `offered` | `assigned` (offered to this partner, may accept or decline) |
| order `accepted`, `departed` | `accepted` |
| order `collected`, `en_route`, `arrived`, `unloading` | `collected` |
| order `delivered` | `delivered` |
| order `cancelled` | `cancelled` |
| order `failed` | `failed` ("Delivery failed") |
| order `disputed` | `under_review` ("Under review") |

Decided by @chidimmamogbo on #12 (2026-10-26), following decision 3 for
customers: history shows failed and disputed jobs; it never hides them.

### Partner job fields the backend does not send

Decided by @chidimmamogbo on #12 (2026-10-26). The design's `PartnerJob`
(`domain/partner.ts`) allows `null` for these, and the screens leave them
out rather than fill them in:

| Design field | Rule |
| --- | --- |
| `choice` | `null` until #21 adds the cans or tank. The screens show `quantity_litres` (always sent) in litres and gallons, and take Keke or tanker from the partner's own app |
| `station.distance_km`, `station.minutes`, `customer.distance_km`, `customer.minutes` | `null`: no road distance without OSRM (SRS §12.1). Hidden |
| `earning_minor_units` | `null`: partner pay is out of the MVP (docs/api/partners.md, decision 7). The earning line is hidden, not shown as "not known yet" |
| `assigned_by` | `null`: the job does not name the dispatcher |
| payment status | Not in `PartnerJob`: partners never see an order's payment status (FR-040, BR-13; docs/design/driver-cash.md, decision 3). The K1 Cash card (#20) takes its place |

Also decided by @chidimmamogbo on #12 (2026-10-27), for fields missing on
whole groups of jobs:

| Design field | Rule |
| --- | --- |
| `customer.contact_name`, `customer.phone` | `null` on an offer (FR-032: no receiver before the driver accepts) and after the job ends (`DriverJobDetail.receiver`). Screens name the area only, leave out the "Customer" / "Delivered to" row, and show no call or message button |
| `station.address`, `customer.address` | `null` when the job carries only summary fields (history, ended jobs) or no delivery address yet (offers). Screens show the area instead |
| `code_tries_left` | `null` before the delivery code is issued (`delivery_code: null`). The code screen shows "Waiting for the delivery code", never "locked" |
| ended jobs | `GET /driver/jobs/{reference}` answers 404 once a job is completed, so the adapter takes it from the `done` list of `GET /driver/jobs`, with the summary fields only |

Mock mode keeps every value (`StoredJob` in `mocks/seed.ts`).

How the #12 adapter (`features/partner/real/jobs.ts`) fills the rest,
decided by @Bonvee120 for #12 (2026-10-27):

| Design field | From the backend job |
| --- | --- |
| `station.name`, `station.area` | `source.name` or `source_name`; "Station not set yet" while the dispatcher has not picked a source |
| `station.address` | `source.approximate_location` (detail only), else `null` |
| `customer.name`, `customer.area` | `delivery_area` (the address's first line). No neighbourhood is invented; "Address not known yet" if the job has none |
| `customer.address`, `customer.landmark`, `instructions` | `delivery_address`, `landmark`, `delivery_instructions` (detail only), else `null` |
| `collected_at` | `pickup.picked_up_at` |
| `delivered_at` | `ended_at` when the order is `delivered` |
| `code_tries_left` | `delivery_code.attempts_left` |
| `code_sms_status` | `delivery_code.sms_status`: `accepted`, `failed`, or `null` before a code exists. When it is `failed` the code was recorded but not sent, so the code screen never says "Code sent" (FR-050; #138). The mock sets it with `simulateCodeProblem(reference, 'sms_failed')` |
| `tank_note`, `accepted_at`, `code_resend_at`, `pickup`, `remaining` | `null`: the job does not carry them |

### Available orders and declining

Decided by @chidimmamogbo on #12 (2026-10-26):

- **No job pool in the MVP.** In real mode `listAvailableJobs` returns `[]`
  and the screen shows its normal empty state. Offers reach the partner
  through `GET /driver/jobs` (`offers`) as stage `assigned` (FR-031,
  FR-032).
- **Decline reasons.** The design's reasons map to the backend's agreed
  ones (docs/api/deliveries.md):

  | Design `DeclineReason` | Backend `reason` | `note` sent |
  | --- | --- | --- |
  | `not_available` | `not_available` | the driver's note |
  | `too_large` | `vehicle_cannot_carry` | the driver's note |
  | `outside_area` | `too_far` | the driver's note |
  | `vehicle_problem` | `other` | the design's label, then the driver's note |
  | `station_unavailable` | `other` | the design's label, then the driver's note |

  For `other`, the label comes first and the driver's note is cut so the
  whole text fits in 300 characters (`DECLINE_NOTE_MAX_LENGTH`). The adapter
  never sends `unsafe_access`, which has no design reason.

### Trip steps and problem reports

Decided by @Bonvee120 for #13 (2026-10-27). The fork's trip has fewer steps
than the backend (docs/api/deliveries.md, part 2 "Job flow"), so one partner
step sends several backend steps. Each is sent only if the job has not made
it yet, so a retry carries on where the last attempt stopped.

| Partner function (screen) | Backend steps |
| --- | --- |
| `confirmPickup` (pickup, loading) | `transition` `departed` (Start job; the customer's "dispatched" SMS goes out now), `pickup`, `transition` `en_route` |
| `completeUnloading` ("Unloading done, send the code") | `arrive` with no location (`location_consent: false`), `transition` `unloading`, `unloading-complete` (sends the code) |
| `verifyCode` (code) | `proof` with the code |
| `resendCode` (code) | `delivery-code` |
| `reportIssue` (report a problem) | `incidents`; with no order, `not_connected` (no driver endpoint) |

| Field sent | Value |
| --- | --- |
| pickup `source` | `{ "assigned": true }`: the fork has no "another source" choice |
| pickup `volume_collected_litres` | Tanker: the gallon count × 4 (FR-021). Keke: the ordered litres; the screen only lets the rider leave with every can loaded |
| pickup `source_reference`, `safety_concern`, `safety_note` | `null`, `false`, `null`: the receipt is a tick, not a number, and the screen has no safety question. The tick and the photo are not sent |
| proof `delivered_litres` | `pickup.volume_collected_litres`, the litres recorded at pickup. Never the ordered amount |
| proof `unloading_confirmed`, `location`, `location_consent` | `true`, `null`, `false`: the code screen tells the partner to unload first, and asks for no location |

Wrong codes are renamed to what the code screen reads:
`delivery_code_invalid` becomes `invalid_code` with
`details.tries_left` (from `attempts_remaining`), or `code_locked` when
`attempts_remaining` is 0. `delivery_code_expired`, `rate_limited`,
`delivery_code_still_valid` and the rest pass through.

| Design `PartnerIssueType` | Backend incident `type` | `note` sent |
| --- | --- | --- |
| `unsafe_pour` | `unsafe_transfer` (the server stops the job, hold `unsafe_stop`) | the partner's note |
| `station_problem` | `source_concern` | the partner's note |
| `vehicle_breakdown` | `vehicle_problem` | the partner's note |
| `bad_address`, `code_not_working`, `customer_unreachable` | `other` | the design's label, then the partner's note |

For `other`, the note is cut to 500 characters (`INCIDENT_NOTE_MAX_LENGTH`).
`running_late` and `volume_issue` have no design type and are never sent.

## Admin order status

Backend `status` to the design's `AdminOrderStatus` (`domain/admin.ts`).

| Backend `status` | Design status |
| --- | --- |
| `quote_requested`, `awaiting_confirmation` | `awaiting_confirmation` ("Awaiting confirmation"; [admin-confirm-order.md](../design/admin-confirm-order.md), decision 3, built in #136) |
| `confirmed`, `awaiting_payment` | `awaiting_rider` |
| `assigned`, `accepted` | `assigned` |
| `departed` | `loading` |
| `collected`, `en_route`, `arrived`, `unloading` | `on_the_way` |
| `delivered` | `delivered` |
| `cancelled` | `cancelled` |
| `failed` | `failed` ("Delivery failed") |
| `disputed` | `disputed` ("Disputed") |

`AdminOrder.backend_status` (optional) carries the backend `status` as sent,
for the places that must tell apart statuses the design groups. Today that is
the order panel: `awaiting_rider` covers `confirmed` and `awaiting_payment`,
but only a `confirmed` order can be assigned, so an `awaiting_payment` order
shows "Waiting for the customer's payment to be verified" instead of the
assign panel (#144). Mock orders send none and stay assignable.

`failed` and `disputed` are admin statuses of their own (open question 5,
decided in #15), with the agreed staff labels from docs/api/orders.md. The
order's payment status maps only where the design has an exact equivalent
(`unpaid`, `awaiting_verification`, `paid`, `refunded`), plus
`pending_collection` shown as "Cash to collect" (@chidimmamogbo on PR #92)
and `partially_paid` shown as "Part paid" (the approved cash design,
docs/design/cash-remittance.md); for the others the order shows no payment chip, and the cash pages show them
in full (#19).

## Open questions

| # | Question | Settled in |
| --- | --- | --- |
| 1 | The design's water sources (Ninth Mile, borehole) against the SRS water categories (Potable, Utility) and supplier activation (FR-012, FR-014) | #10 |
| 2 | ~~Keke 25 L × 12 cans is 300 L, below the 600 L minimum~~ Decided: removed (decision 4) | done |
| 3 | ~~A customer stage for a status the app does not know~~ Decided in #9: a new stage `order_update`, labelled "Order update" as the contract asks ([Customer order stage](#customer-order-stage)) | done |
| 4 | ~~Partner stages for `failed` and `disputed`~~ Decided: `failed` and `under_review` ([Partner job stage](#partner-job-stage)) | done |
| 5 | ~~Admin statuses for `failed` and `disputed`~~ Decided in #15: their own admin statuses, "Delivery failed" and "Disputed" ([Admin order status](#admin-order-status)). Staff confirm orders before dispatch under "Awaiting confirmation" (#72, built in #136) | done |
| 6 | ~~The design's "available" job pool has no backend endpoint~~ Decided: no pool in the MVP; `listAvailableJobs` returns `[]` ([Available orders and declining](#available-orders-and-declining)) | done |
