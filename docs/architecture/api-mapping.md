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
- **Tanker capacity:** the gallons a driver types at sign-up × 4 =
  `safe_payload_litres`, so assignment compares litres with litres (FR-013).
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
driver accepts it (FR-032).

| Backend `status` | Design stage | Label |
| --- | --- | --- |
| `quote_requested`, `awaiting_confirmation`, `confirmed`, `awaiting_payment` | `waiting_rider` | Waiting for rider |
| `assigned` | `waiting_rider` | Waiting for rider (FR-032: not accepted yet) |
| `accepted`, `departed` | `rider_assigned` | Rider assigned |
| `collected` | `picked_up` | Picked up |
| `en_route`, `arrived`, `unloading` | `on_the_way` | On the way |
| `delivered` | `delivered` | Delivered |
| `cancelled` | `cancelled` | Cancelled |
| `failed` | `failed` (new) | Delivery failed |
| `disputed` | `under_review` (new) | Under review |
| any value not listed | see open question 3 | |

Adapters must never fail on an unknown `status` (docs/api/orders.md).

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
| order `failed`, `disputed` | see open question 4 |

## Admin order status

Backend `status` to the design's `AdminOrderStatus` (`domain/admin.ts`).

| Backend `status` | Design status |
| --- | --- |
| `quote_requested`, `awaiting_confirmation`, `confirmed`, `awaiting_payment` | `awaiting_rider` |
| `assigned`, `accepted` | `assigned` |
| `departed` | `loading` |
| `collected`, `en_route`, `arrived`, `unloading` | `on_the_way` |
| `delivered` | `delivered` |
| `cancelled` | `cancelled` |
| `failed`, `disputed` | see open question 5 |

## Open questions

| # | Question | Settled in |
| --- | --- | --- |
| 1 | The design's water sources (Ninth Mile, borehole) against the SRS water categories (Potable, Utility) and supplier activation (FR-012, FR-014) | #10 |
| 2 | ~~Keke 25 L × 12 cans is 300 L, below the 600 L minimum~~ Decided: removed (decision 4) | done |
| 3 | A customer stage for a status the app does not know: the contract asks for a neutral "Order update" fallback, which the design has no stage for | #9 |
| 4 | Partner stages for `failed` and `disputed` | #13 |
| 5 | Admin statuses for `failed` and `disputed`. Staff may need the backend's own staff labels (docs/api/orders.md) rather than six design statuses, for example to confirm orders before dispatch | #15 |
| 6 | The design's "available" job pool, which any eligible partner may accept, has no backend endpoint: the backend offers each job to one driver (docs/api/deliveries.md) | #12 |
