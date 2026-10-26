# Order details and price contract

Requirements: FR-010, FR-011, FR-012, FR-013, FR-014, FR-020, FR-021, FR-022,
FR-023, FR-024, FR-026, BR-01, BR-02, BR-05, NFR-002 · Acceptance tests: T-01,
T-02, T-03, T-09, T-17, T-18 · Issue: #10 · Built in: #21

**Status: proposed** on 2026-10-26 by @Daveoski (+ Claude Code), for review by
@nnamdi-security (backend, contract owner) and @chidimmamogbo (frontend). Not
agreed, not built. It becomes `Status: agreed` when both have approved it
(CLAUDE.md, "Team fork workflow").

**Revised 2026-10-26** after @chidimmamogbo's review of PR #28: open questions
1, 2 and 6 decided (FR-022 only, one fixed pilot category, customers see the
total only), and five requested changes applied. See [Changes](#changes).

Decision behind it (2026-10-26, @chidimmamogbo,
[api-mapping.md](../architecture/api-mapping.md#decisions-2026-10-26-chidimmamogbo)):
the fork's backend is extended to match the new design. Orders gain a delivery
type, the jerrycan or tank details, a water source and a price.

## What this changes

Everything here is **additive** to the agreed [orders contract](orders.md):

1. A new endpoint, `POST /quotes`, that prices a choice on the server (FR-022,
   SRS §6).
2. `POST /orders` accepts the delivery details and an optional `quote_id`.
3. `OrderRead` (and `AdminOrderRead`) return the delivery details and the
   quote the order was placed with.

A client that sends today's `OrderCreate` (quantity only) gets the same
behavior as before.

## Where this comes from

| Source | What it gives |
| --- | --- |
| `frontend/src/domain/orders.ts` | `WaterChoice` (delivery type, can size and count, tank type and size, water source), `Quote` |
| `frontend/src/mocks/pricing.ts` | The quote screen's behavior: a water line, a delivery line once the address is known, a total, a validity time, "manual quote" for custom sizes |
| `frontend/src/mocks/customerMock.ts` | `getQuote(choice, address)`, `createOrder` input, the refusals `manual_quote_required` and `no_station_open` |
| [handoff-v1.md](../design/handoff-v1.md) | Decisions 10, 10a, 10b: price per can or per tank size, a delivery fee once the address is known, a water source for Tanker only, Ninth Mile costs more |
| SRS v0.3 | Every business rule below; it is normative where it differs from the mocks |

### Where the mock and the SRS differ

The mock prices water as a flat amount **per jerrycan** (Keke) or **per tank
size and source** (Tanker), and the delivery fee as a flat, per-area or
per-km amount. FR-022 prices water as **the supplier's cost per litre × litres**
and the total as **water + delivery (base fee + OSRM road distance charge +
additional-trip charges) + handling + margin**, rounded **up** to whole naira.

This contract follows **FR-022** (the SRS is normative). The mock's amounts
remain samples (`is_sample: true`); the server never returns them.
**Decided** (open question 1, @chidimmamogbo, 2026-10-26): FR-022 only, no
flat per-can or per-tank prices. Knock-on: the fork's admin Pricing screen
(flat prices) is redesigned around FR-022 rates in #18.

## Delivery details

Two delivery types (design decision 9; `DeliveryType` in
`frontend/src/domain/orders.ts`).

| Field | Type | Rule |
| --- | --- | --- |
| `delivery_type` | `"keke"` \| `"tanker"` | Required in the new shape. Keke carries jerrycans; Tanker fills a tank |
| `keke` | object \| null | Required when `delivery_type` is `keke`, otherwise `null` or absent |
| `keke.can_size_litres` | `25` \| `50` | The jerrycan size (design `c-keke`) |
| `keke.can_count` | integer | At least 1. `can_size_litres × can_count` must be at least 600 (FR-021). Whether only the design's counts (12, 24, 30, 60) are accepted is [open question 4](#open-questions) |
| `tanker` | object \| null | Required when `delivery_type` is `tanker`, otherwise `null` or absent |
| `tanker.tank_type` | `"ground"` \| `"overhead"` | The customer's tank (design `c-tanker`). Recorded for the driver; whether it affects price or vehicle is [open question 5](#open-questions) |
| `tanker.quantity_local_gallons` | integer | 150–25000, as in [orders.md](orders.md#order-object). The design's standard sizes 500, 750 and 1,000 gallons are FR-021 presets (2,000, 3,000 and 4,000 L); a custom size is any other value |
| `water_source` | `"ninth_mile"` \| `"borehole"` \| null | Tanker only (decision 10, changed 2026-10-16: Keke has no source choice). Required for Tanker, `null` for Keke. A **preference**, not a source assignment; see [Water source and category](#water-source-and-category) |

### Quantity (FR-021)

The server stores whole litres and converts exactly; the client never sends
litres for the new shape:

- **Keke:** `quantity_litres = can_size_litres × can_count`.
- **Tanker:** `quantity_litres = quantity_local_gallons × 4`.
- The result must be at least **600 litres** (FR-021, T-17), else 422
  `validation_error` on the field that set it (`keke.can_count` or
  `tanker.quantity_local_gallons`).
- Sending `quantity_litres` or a top-level `quantity_local_gallons`
  together with `delivery_type` is 422 `validation_error`: the details are the
  single source of the quantity.

`quantity_litres` stays in every response, always in litres
([orders.md](orders.md#order-object)).

A custom tank size is **not** automatically a manual quote. The mock returns
`manual_quote_required` for every custom size; under FR-021 a quantity becomes
a manual quote only when no configured vehicle and trip plan can carry it
(FR-013, T-03). The server decides.

## Water source and category

The design asks Tanker customers for a **source** ("Ninth Mile water" or "Any
Bore hole water"). The SRS has **categories**, Potable Water and Utility Water
(FR-014), and **sources** that are activated per category after laboratory
verification (FR-011, FR-012). These are different things:

- `ninth_mile` and `borehole` describe **where** the water is collected. They
  are a kind of `water_sources` row, not a category.
- A category is what FR-022 prices by (cost per litre per supplier and
  category, FR-011) and what FR-023 requires the customer to see before
  confirming.

Proposed:

1. `water_source` is the customer's **source preference**, stored on the order.
   It narrows which sources may serve the order; the dispatcher still picks the
   actual source at confirmation, through the existing FR-012 eligibility check
   ([water-sources.md](../features/water-sources.md)). It is never a quality
   claim (FR-014): the labels stay "Ninth Mile water" and "Any Bore hole water".
2. `water_sources` gains a `kind` (`ninth_mile` or `borehole`) so the server can
   match a preference to sources (schema change, migration in #21).
3. Every quote and order carries a **water category**, as FR-022 (price by
   category) and FR-023 (the customer sees it before confirming) require.
   **Decided** (open question 2, @chidimmamogbo, 2026-10-26): **one fixed
   category for every pilot order**, with no customer choice and no screen
   change:
   - The client sends **no** category. The server prices and stores every
     quote and order with the configured pilot category, read through
     `get_settings()` (CLAUDE.md) by its code, `potable` or `utility`.
   - Which category it is gets named by the technical lead in the pilot plan
     (the fork has no copy of the pilot plan yet). It may be `potable` only
     while a source is activated for Potable Water after laboratory
     verification (FR-012, FR-014).
   - If the configured category is inactive or has no activated source, the
     quote answers `manual_quote_required` / `category_unavailable`.
   - The response names the category (`water_category`), so the customer
     sees it before ordering (FR-023).
4. Which source's cost per litre prices a quote when several eligible sources
   match is [open question 3](#open-questions).

Decision 10b ("Ninth Mile costs more") then follows from FR-022 without a
separate rule: Ninth Mile sources have a higher cost per litre.

## `POST /quotes`

Prices a choice on the server (FR-022, SRS §6). Customer only. Rate-limited
(NFR-002).

### Request (`QuoteCreate`)

```json
{
  "delivery_type": "tanker",
  "keke": null,
  "tanker": { "tank_type": "ground", "quantity_local_gallons": 750 },
  "water_source": "borehole",
  "delivery_address": "12 Sample Close, Independence Layout, Enugu"
}
```

| Field | Rule |
| --- | --- |
| `delivery_type`, `keke`, `tanker`, `water_source` | As in [Delivery details](#delivery-details) |
| `delivery_address` | Optional, as `OrderCreate.delivery_address` (5–500 characters). Without it, the response prices the water only (design decision 10: the delivery fee is shown once the address is known) |

No category field: the server uses the pilot category
([Water source and category](#water-source-and-category), point 3). Unknown
fields, including a `water_category_id`, are 422 `validation_error`, as in
`OrderCreate` today (`extra="forbid"`), so a client cannot believe it chose a
category.

Example: [quote-create-request.json](examples/quote-create-request.json).

### Response (200 `QuoteRead`)

Two shapes, told apart by `status` (SRS §6). A manual quote is a successful
answer, not an error ("If no price is reliable, use a structured
`manual_quote_required` response instead of fake numbers", SRS §6).

**`quote_available`**
([quote-available.json](examples/quote-available.json)):

```json
{
  "status": "quote_available",
  "quote_id": "c7e1b9a2-4d3f-4a6b-8e05-9f2d1c0b3a74",
  "currency": "NGN",
  "quantity_litres": 3000,
  "water_category": { "label": "Utility Water", "supported_uses": null },
  "includes_delivery": true,
  "total_minor_units": 2000000,
  "price_valid_until": "2026-10-26T13:30:00Z"
}
```

| Field | Rule |
| --- | --- |
| `quote_id` | UUID. `null` when `delivery_address` was not sent: a water-only price cannot be ordered |
| `quantity_litres` | The server's conversion (FR-021). The client shows this value, not its own |
| `water_category` | The pilot category's label and supported uses, as on `OrderRead` (FR-023) |
| `includes_delivery` | `true` when an address was sent and `total_minor_units` is the full payable amount; `false` for a water-only price |
| `total_minor_units` | With an address: the payable amount in kobo (water + delivery + handling + margin, FR-022), a whole number of naira (rounded up). Without one: the water cost only (cost per litre × litres), which the client labels as excluding delivery |
| `price_valid_until` | UTC. After it, the quote cannot be ordered (SRS §8). The length is [open question 7](#open-questions) |

**Customers see the total only** (open question 6, decided by
@chidimmamogbo, 2026-10-26, as the agreed `orders.md` already says: "never a
breakdown"). The components (water, delivery, handling, margin, rounding),
the cost per litre, rates, road distance, vehicle, trips and margin type are
**never** sent to a customer: they go into the server's snapshot (FR-024) and
the admin views. Integer kobo throughout (BR-01, SRS §5). The points estimate and `is_sample` in the mock's
`Quote` type are not part of this contract (points are not in the SRS; they
belong to #11).

**`manual_quote_required`**
([quote-manual.json](examples/quote-manual.json)):

```json
{
  "status": "manual_quote_required",
  "quote_id": null,
  "quantity_litres": 6000,
  "reason": "no_vehicle_plan"
}
```

| `reason` | When | Source |
| --- | --- | --- |
| `outside_service_zone` | The address is in no active service zone | FR-010, T-02 |
| `no_eligible_source` | No source of the preferred kind is eligible for the category today | FR-012, BR-02, T-04 |
| `category_unavailable` | No source is activated for the category | FR-014 |
| `no_vehicle_plan` | No configured vehicle can carry the quantity in at most two trips | FR-013, FR-021, T-03 |
| `delivery_cost_unavailable` | No road distance and no zone rate | FR-022, T-18 |

The client shows its own wording per `reason` (clients branch on codes, not
messages, [README](README.md#errors)). An unknown `reason` gets the generic
manual-quote wording. The order can still be sent without a `quote_id` as a
quote request (`quote_requested`), as today.

**Pilot note:** the backend has no service zones and no OSRM yet (SRS §12.1:
OSRM hosting is open). Until zones and their fixed delivery rates exist
(**#30**, a dependency of #21), every quote with an address answers
`manual_quote_required` with `delivery_cost_unavailable`, never an estimated
delivery fee ("No fabricated route estimates", FR-022). With #30, an in-zone
address is priced from the zone rate and an out-of-zone one answers
`outside_service_zone` (FR-010, T-02).

### Errors

| Status | `code` | When |
| --- | --- | --- |
| 422 | `validation_error` | Invalid body; below 600 litres; both or neither of `keke` and `tanker`; a `water_source` on a Keke choice or missing on a Tanker choice |
| 429 | `too_many_attempts` | Rate limit (NFR-002); `Retry-After` header, as in [auth.md](auth.md) |

Plus the shared 401, 403 (`forbidden` for staff and drivers, `csrf_failed`)
and 503 from the [README](README.md#errors). Phone verification is **not**
required to ask for a price; it is required to order (FR-003, unchanged).

## `POST /orders` changes

`OrderCreate` gains the [delivery details](#delivery-details) and an optional
`quote_id`. Like `POST /quotes`, it has no category field
([order-create-with-quote-request.json](examples/order-create-with-quote-request.json)):

```json
{
  "idempotency_key": "5b0e2c3a-7d1f-4e8a-b6c9-0a1b2c3d4e5f",
  "quote_id": "c7e1b9a2-4d3f-4a6b-8e05-9f2d1c0b3a74",
  "delivery_type": "tanker",
  "keke": null,
  "tanker": { "tank_type": "ground", "quantity_local_gallons": 750 },
  "water_source": "borehole",
  "contact_name": "Sample Customer",
  "contact_phone": "08000000001",
  "delivery_address": "12 Sample Close, Independence Layout, Enugu",
  "landmark": "Opposite the blue gate",
  "delivery_instructions": "Tank is behind the house",
  "preferred_delivery_date": "2026-10-27"
}
```

### Rules

- **The client never sends a price** (FR-022, SRS §6). The order's price is the
  quote's, looked up by `quote_id`.
- **Idempotency first** (FR-026, NFR-011, T-06). The server looks up the
  `idempotency_key` before any quote check:
  - same key, same body: 200 with the **original** order, even if its quote
    has expired since or a source stopped being eligible. A retry never
    turns into `quote_expired`;
  - same key, different body: 409 `idempotency_key_reused`, as today. The
    body comparison includes the new fields and `quote_id`.
- **With a `quote_id`**, on a new key, the server checks the quote in this
  order: it exists and belongs to this customer (else 404 `quote_not_found`);
  it is unexpired (else 409 `quote_expired`); it matches the order (else 422
  `quote_mismatch`); a source of the preferred kind is still eligible (else
  409 `no_eligible_source`). Then it freezes the quote on the order (FR-024,
  BR-01).
- **Without a `quote_id`:** the order is a quote request in `quote_requested`,
  as today (FR-021, FR-022 manual fallback).

### When a quote matches the order

Every field below must be equal, after normalizing as shown. Anything else
on the order (contact, landmark, instructions, date) may differ from the
quote request.

| Field | Comparison |
| --- | --- |
| `delivery_type`, `keke.can_size_litres`, `keke.can_count`, `tanker.tank_type`, `tanker.quantity_local_gallons`, `water_source` | Exact |
| `delivery_address` | Normalized on both sides: trimmed, every run of whitespace (spaces, tabs, line breaks) collapsed to one space, compared case-insensitively (Unicode case folding). `"12 Sample Close,  Enugu "` matches `"12 sample close, enugu"`. Nothing else is rewritten: a changed comma or word is a mismatch, because the delivery cost was priced for that address |

The category is not compared: the quote carries the pilot category, and the
order keeps the quote's category even if the configured pilot category
changes between quote and order (FR-024).

### Status at creation

The state machine already has the transition: row 3 in
[deliveries.md](deliveries.md#transitions), `quote_requested` →
`awaiting_confirmation` by the customer, "accepts a valid quote, pay on
delivery, a check needs a dispatcher". Every pilot order is pay on delivery
(F4) and needs a dispatcher to confirm the source and window (row 7), so:

- an order **with** a valid `quote_id` is created by row 1 and moved by row 3
  in **one transaction**: two `order_events` rows, and the order is returned
  in `awaiting_confirmation`. No new state is added. Rows 2 (prepaid) and 4
  (straight to `confirmed`, needs slots, FR-025) stay unused in the pilot;
- an order **without** one is created by row 1 alone, in `quote_requested`.

This PR updates row 3's "Built in" column in `deliveries.md` to point here, so
both documents are agreed together. Open question 8 is settled by this.

### Errors

New errors (in addition to those in [orders.md](orders.md#endpoints-sprint-1)):

| Status | `code` | When |
| --- | --- | --- |
| 404 | `quote_not_found` | Unknown `quote_id`, or another customer's (not probeable, as `order_not_found`) |
| 409 | `quote_expired` | `price_valid_until` has passed (SRS §8: "customer must requote"). Never on an idempotent replay |
| 422 | `quote_mismatch` | A field in [When a quote matches the order](#when-a-quote-matches-the-order) differs; `details` names the fields (`[{"loc": ["body", "delivery_address"], ...}]`) |
| 409 | `no_eligible_source` | Between quote and order, no source of the preferred kind is eligible any more (FR-012, BR-02) |

Examples: [error-quote-expired.json](examples/error-quote-expired.json).
The mock's 409 `no_station_open` is replaced by `no_eligible_source` (the
FR-012 gate is per source and category, not per station).

## `OrderRead` changes

Every endpoint that returns `OrderRead` gains
([order-with-details.json](examples/order-with-details.json)):

```json
{
  "delivery_type": "tanker",
  "keke": null,
  "tanker": { "tank_type": "ground", "quantity_local_gallons": 750 },
  "water_source": "borehole",
  "quote": {
    "currency": "NGN",
    "total_minor_units": 2000000,
    "water_category": { "label": "Utility Water", "supported_uses": null }
  }
}
```

| Field | Rule |
| --- | --- |
| `delivery_type`, `keke`, `tanker`, `water_source` | As sent. `null` on orders created in the old shape (before #21) |
| `tanker.quantity_local_gallons` | As sent; `quantity_litres` remains the stored value |
| `quote` | The quote frozen at creation (FR-024), or `null` for a quote request. A later change to the pricing rules never changes it (T-09). **Total only** for customers (open question 6) |
| `quote.water_category` | What the customer accepted (FR-023): `label` frozen with the quote, so a later label change does not alter the order (FR-014, FR-024); `supported_uses` read live, as decided for `water_category` in [orders.md](orders.md#decided-questions) (question 2) |

`price` (agreed in [orders.md](orders.md#customer-pilot-changes-99)) stays
the **confirmed** price. With a quote it equals `quote.total_minor_units`,
unless the dispatcher repriced with documented customer agreement (BR-05,
FR-023). The top-level `water_category` keeps its agreed meaning (the
category frozen at confirmation, `null` until then); `quote.water_category`
is the one accepted at checkout.

`AdminOrderRead` gains the same fields. The admin views of the full FR-024
snapshot (water, delivery, handling, margin, rates, distance, vehicle, trips,
margin type, rounding) are for #21 and the admin pricing contract (#18).

## Driver cash label

The driver's Cash card shows how the amount due was priced
(`cash.amount_due_label`, [payments.md](payments.md)). The agreed value is
`manual_quote` ("Manual quote"); payments.md amendment 3 (proposed in #123)
adds **`quote`** for a server quote. For an order created with a `quote_id`
and confirmed without repricing, `amount_due_label` is `quote`. If the
dispatcher repriced it as a manual quote, it stays `manual_quote`.

The wording the card shows for `quote` is a design decision for the driver
cash design ([driver-cash.md](../design/driver-cash.md), open questions;
@chidimmamogbo). It must not read "Manual quote", which would misstate how
the price was set.

## Mapping to the design types

For #9 (adapters) and `docs/architecture/api-mapping.md`:

| Backend | Design (`domain/orders.ts`) |
| --- | --- |
| `delivery_type` + `keke` | `WaterChoice` `{ delivery_type: 'keke', can_size_litres, can_count }` |
| `delivery_type` + `tanker` + `water_source` | `{ delivery_type: 'tanker', tank_type, tank_size_gallons, source }`: `tank_size_gallons` is `quantity_local_gallons` when it is 500, 750 or 1000, else `null` (custom) |
| `QuoteRead` `quote_available` | `Quote` `quote_available`: `total_minor_units` and `price_valid_until` only. The design's `water` and `delivery` lines have no source (total only, open question 6), so the Keke and Tanker summaries lose those lines in #9. `points_estimate` and `is_sample` have no source either ([open question 9](#open-questions)) |
| `QuoteRead` `manual_quote_required` | `Quote` `manual_quote_required`: `reason` text chosen by the client from the code |

## Open questions

Numbering is kept so review comments still match. Decided questions say who
decided and when; the rest need an answer before this contract is agreed.
Recommendations are proposals, not decisions.

1. ~~Flat prices per can or per tank, or FR-022 only?~~ **Decided**
   (@chidimmamogbo, 2026-10-26): FR-022 only. The admin Pricing screen is
   redesigned around FR-022 rates in #18.
2. ~~How is the water category chosen?~~ **Decided** (@chidimmamogbo,
   2026-10-26): one fixed category for every pilot order, set on the server,
   with no customer choice and no screen change
   ([Water source and category](#water-source-and-category), point 3).
   **Still open:** which category. The technical lead names it in the pilot
   plan, which the fork does not have yet. Potable only with laboratory
   verification (FR-014).
3. **Which source's cost per litre prices the quote** when several eligible
   sources match the preference? FR-022 says "the supplier's cost", but the
   supplier is picked later, at confirmation. **Recommended:** the highest
   cost per litre among eligible sources of that kind, so the confirmed
   source never costs more than the quote. For @nnamdi-security.
4. **Which can counts are allowed?** The design offers 12, 24, 30 and 60
   (filtered to reach 600 L). **Recommended**, and supported by
   @chidimmamogbo: the server accepts any count that reaches 600 L, as it
   does for custom litres (FR-021); the client keeps the presets.
5. **Does `tank_type` (ground or overhead) affect the price or the vehicle?**
   FR-013 mentions "whether the operator can handle a given transfer method";
   the SRS has no overhead-tank charge. **Recommended**, and supported by
   @chidimmamogbo: record it only, no effect, until the business says
   otherwise.
6. ~~Does the customer see a breakdown?~~ **Decided** (@chidimmamogbo,
   2026-10-26): **total only**, as `orders.md` already says. The components
   stay in the server snapshot and the admin views. Knock-on for #9: the
   Keke and Tanker summaries lose their water and delivery lines.
7. **How long is a quote valid?** The SRS requires a validity (FR-023, §8)
   but no length; the mock uses 1 hour. **Recommended**, and supported by
   @chidimmamogbo: admin-configured, 1 hour by default, pending a business
   decision.
8. ~~Status of an order placed with a quote~~ **Settled** by the existing
   row 3 of [deliveries.md](deliveries.md#transitions); see
   [Status at creation](#status-at-creation). No new transition; this PR
   updates the row's "Built in" column. For @nnamdi-security to confirm.
9. **Points.** The mock's `points_estimate` has no SRS basis.
   **Recommended**, and supported by @chidimmamogbo: leave it out; the
   adapter shows no estimate until #11 settles loyalty points.
10. **Service zones and OSRM.** Neither exists in the backend; OSRM hosting
    is open (SRS §12.1). **#30** (service zones and fixed delivery rates,
    FR-010, @nnamdi-security) now gives the pilot a delivery cost from zone
    rates and is a dependency of #21. Until #30 merges, the
    [Pilot note](#response-200-quoteread) applies. For @nnamdi-security.
11. **Snapshot storage.** The agreed `order_price_snapshots` table holds the
    confirmed (manual) price. **Recommended:** #21 stores the creation-time
    quote in a separate `quotes` table (SRS §5) with the FR-024 components
    and the frozen category label, and the confirmation snapshot keeps its
    meaning. For @nnamdi-security.

## Changes

| Date | Change | Agreed by |
| --- | --- | --- |
| 2026-10-26 | Revised after review (PR #28): FR-022 only; one fixed pilot category set by the server (no category field in requests); customers see the total only (breakdown fields removed, `includes_delivery` added); `quote.water_category` on `OrderRead`; idempotent replay before quote checks; address normalization for `quote_mismatch`; driver cash label `quote`; creation status through existing row 3 | Not yet |
| 2026-10-26 | Proposed: delivery details, `POST /quotes`, `quote_id` on `POST /orders`, details and quote on `OrderRead` | Superseded by the revision above |
