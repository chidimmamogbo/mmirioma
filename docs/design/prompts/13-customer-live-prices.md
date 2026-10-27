# Prompt 13: live prices for customers (zone picker and quote states)

Issue: [#79](https://github.com/chidimmamogbo/mmirioma/issues/79) ·
Requirements: FR-010, FR-012, FR-014, FR-020, FR-021, FR-022, FR-023, FR-024,
FR-026, FR-027, NFR-002, NFR-012, NFR-020, NFR-021, NFR-022 · Acceptance
tests: T-01, T-02, T-03, T-17, T-18 · Contracts (all agreed, G3):
[order-details-and-price.md](../../api/order-details-and-price.md) (`POST
/quotes`, `quote_id` on `POST /orders`),
[admin-directory.md](../../api/admin-directory.md#get-service-zones) (`GET
/service-zones`), [customer-account.md](../../api/customer-account.md#saved-addresses)
(the zone on a saved address) · Backend: built in #21 and #30.

**Why this prompt:** since #9 (PR #76) a real customer order is always a
quote request: the office calls with the price. A server price needs two
things the screens do not have, and both change what the customer sees, so
they need design approval (G2) before they are built:

1. **An area (service zone) on the address step.** `POST /quotes` prices an
   address only with the `service_zone_id` the customer picked (FR-020). With
   no zone the answer is `manual_quote_required` / `outside_service_zone`
   (FR-010, T-02). The server never works the zone out from the address text
   ([admin-directory.md](../../api/admin-directory.md#which-zone-an-address-is-in)).
2. **No price on the quantity screens.** `c-keke` and `c-tanker` show a
   water-only price today. The agreed contract forbids it (#42): there is no
   price without the address, because a water-only price would let a customer
   work out the supplier's cost per litre, and it is not the "final total
   price" FR-023 requires.

**Before using:** this fork's visual system is the **design handoff v1**
([handoff-v1.md](../handoff-v1.md); the pack is kept locally under `design/`,
git-ignored). It replaces [00-design-system.md](00-design-system.md) here.
Extend the existing customer screens (`c-keke`, `c-tanker`, `c-details`,
`c-address-pick`, `c-save`, `c-review`, `c-confirmed`, `c-order-detail`) with
their components (option tiles, key-value rows, notices, chips, the summary
total); add a component only when a screen truly needs one, and say so.

Paste everything inside the block into Claude Design (or use it as the spec
for a clickable preview, as for [driver-cash.md](../driver-cash.md)).

```text
Using the MmiriOma customer app design already in this project (design
handoff v1: its colours, Plus Jakarta Sans, cards, option tiles, key-value
rows, notices and chips), redesign the CUSTOMER ordering screens below so
customers see a real server price. Mobile first at 360px wide; also show a
1280px desktop version (a centred single column is fine). Do not create new
colours, fonts or components unless a screen truly needs one; if so, say so.

CONTEXT
Customers order water deliveries in Enugu, Nigeria, on entry-level Android
phones with slow, expensive data. Today every order is a request and the
office phones back with the price. Now the server can give a price at
checkout, once it knows the delivery address and the customer's area.
Payment is cash on delivery after unloading, for every order.

PRODUCT HONESTY RULES (every screen)
- Never invent a price. Every naira amount comes from the server. In mockups,
  label sample amounts "Sample". Show the TOTAL ONLY: never a water, delivery,
  handling or margin line (the server does not send them).
- No price before the address. The quantity screens show quantity, not money.
- No false promises. Placing an order is not a confirmed delivery: the office
  still confirms the order and agrees the delivery time by phone. Never show a
  booked time slot. Never say "driver assigned" before a driver accepts.
- No water-quality claims. Show the water category exactly as the server
  sends its label (for example "Utility Water") and its supported-uses text if
  any; never "safe", "clean", "purified", "drinking" or "potable" on your own.
- No live tracking, no ETA without real data.
- Keep what the customer typed after any error (NFR-012).

SCREENS AND STATES

1. QUANTITY: Keke (c-keke) and Tanker (c-tanker)
   - Remove the price and total from both screens and their footers.
   - Show the quantity in litres and local gallons as today.
   - One quiet line where the price was, telling the customer the price comes
     after the delivery address. Propose the wording.
   - Custom tank size: keep the existing custom size field.

2. DELIVERY DETAILS, new address (c-details)
   - Add a required "Area" choice under the address: the list of areas we
     serve, names only, alphabetical (from GET /service-zones).
   - Last option: "My area is not listed". Choosing it shows a short notice:
     we cannot price this address in the app, the customer can still send a
     request and the office will call with a price.
   - States: list loading; list failed to load (retry, keep typed details);
     empty list (no areas served right now: only "My area is not listed").
   - Long area names wrap; the list must work with 1 area and with 30.

3. SAVED ADDRESS PICK (c-address-pick)
   - Each saved address shows its area name under the address.
   - An address whose area is no longer served (the server marks the zone
     inactive) stays in the list, marked so; picking it means the order goes
     as a request (no price). Propose how it looks.

4. SAVE ADDRESS (c-save)
   - Saving needs an area: an address with "My area is not listed" cannot be
     saved. Show why, and still let the customer continue without saving.

5. REVIEW (c-review): the price card and the main button
   a. Getting the price: loading state on the price card; button disabled.
   b. PRICE AVAILABLE:
      - Total in naira (whole naira), large.
      - Water category label, and its supported-uses text when there is one.
      - "Price valid until <time>" in Lagos time (prices last 1 hour).
      - Payment: "Pay on delivery" (cash after unloading).
      - The office calls to agree the delivery time.
      - No charge to cancel or redeliver.
      - Button: "Place order · <total>".
   c. PRICE EXPIRED while on the screen (the valid-until time passes):
      the price card says the price has expired; the button becomes
      "Get a new price". Never place an order on an expired price.
   d. NO PRICE IN THE APP (manual quote): the server gives a reason code.
      Design one message per code, plus a general one for any unknown code:
        outside_service_zone       area not served / "not listed"
        category_unavailable       the water category is not offered right now
        no_eligible_source         no water source can serve this order today
        no_vehicle_plan            too much water for one vehicle in two trips
        delivery_cost_unavailable  delivery cost not set for this area
        no_price_rule              no price set for this area and quantity
      Do not show the codes themselves. The button is "Send request": the order
      goes without a price and the office calls with one (as today).
   e. ERRORS when placing the order (keep every typed detail):
        409 quote_expired          price expired: get a new price, show it, ask
                                   the customer to place again
        422 quote_mismatch         details changed since the price: get a new
                                   price
        409 no_eligible_source     water no longer available for this order:
                                   offer "Send request"
        404 service_zone_not_found area no longer exists: pick the area again
        429 too_many_attempts      too many price checks: show the wait
        403 phone_not_verified     the existing "Verify your phone" banner
                                   and disabled buttons (design E3, unchanged)
        network failure            "Check your connection"; retry sends the
                                   same request again, never a second order
   f. Placing: button loading, no double submit.

6. ORDER PLACED (c-confirmed) and ORDER DETAIL (c-order-detail, receipt)
   - Priced order: the total and the water category the customer accepted.
   - Request without a price: "Preparing your price" (as built in #9).
   - Neither says the delivery is confirmed.

BUILD NOW: every screen and state above. DESIGN AHEAD: none.

OUTPUT
For each screen: the 360px and 1280px frames, every state listed, and the
exact copy. Name components as in the handoff so developers can map them to
the existing React and Tailwind v4 components.
```

## Field rules (from the agreed contracts)

| Item | Rule | Source |
| --- | --- | --- |
| Area list | `GET /service-zones`: `{items: [{id, name}]}`, active zones only, by name, no fees | [admin-directory.md](../../api/admin-directory.md#get-service-zones) |
| Quote request | `POST /quotes` with the delivery details, `delivery_address` (required) and `service_zone_id` (or none) | [order-details-and-price.md](../../api/order-details-and-price.md#post-quotes) |
| Price shown | `total_minor_units` (kobo, whole naira), `water_category.label`, `supported_uses`, `price_valid_until` (UTC, shown in Lagos time); never a breakdown | same, decision 6 |
| Validity | 1 hour by default (server setting) | same, question 7 |
| Payment, window, charges | Fixed "Pay on delivery"; window agreed by phone (F3); no cancellation or redelivery charge (F5) | same, FR-023 table |
| Placing | `POST /orders` with `quote_id` and the same details and zone; idempotency key reused on retry | same, `POST /orders` changes |
| Saved address zone | Required to save; an inactive zone stays saved and its quote answers `outside_service_zone` | [customer-account.md](../../api/customer-account.md#saved-addresses) |

## After generating

1. Check every screen and state exists and the honesty rules hold.
2. Record the result in `docs/design/customer-live-prices.md` from the
   [template](../_template.md), with the screen-to-endpoint table (every row
   points to the contracts above) and a clickable preview link.
3. Anything the design needs that the contracts lack becomes an open
   question, not a new field.
4. After approval (G2), open the link issue: `getQuote` with the zone,
   the zone picker, and `quote_id` and `service_zone_id` on `createOrder`.

## Open questions for the reviewer (@chidimmamogbo)

1. **Customer wording per manual-quote reason** (5d) and for each error
   (5e): the contract gives codes, not customer text.
2. **A saved address in an area no longer served** (3): show it as normal
   and explain at Review, or mark it in the list? The contract keeps it
   saved and prices it as `outside_service_zone`.
3. **The stage label after a priced order.** A priced order starts in
   `awaiting_confirmation`; the fork shows it as "Waiting for rider" today
   (api-mapping.md). The agreed customer label in `orders.md` is "Awaiting
   confirmation". Keep the design label, or show "Awaiting confirmation" so
   the price is not read as a confirmed delivery (FR-027)?
4. **When the price expires** (5c): ask for a new price automatically when
   the screen is open, or only on the button? Each quote counts toward the
   rate limit (30 per customer per 10 minutes).
5. **Supported-uses text missing** (`null`): show the category label alone?
