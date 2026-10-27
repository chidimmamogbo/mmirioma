# Prompt 14: confirming an order in the admin app (server price or manual price)

Issue: [#72](https://github.com/chidimmamogbo/mmirioma/issues/72) ·
Requirements: FR-012, FR-014, FR-022, FR-023, FR-024, FR-027, FR-030,
FR-033 (rows 26 and 7), FR-036, FR-050, BR-02, BR-05, NFR-004, NFR-012,
NFR-020, NFR-021, NFR-022 · Acceptance tests: T-04, T-09, T-14 · Contracts:
[deliveries.md](../../api/deliveries.md#order-confirmation-endpoints)
("Confirmation rules", extended in #21; agreed G3) and its [proposed
amendment (#72)](../../api/deliveries.md#proposed-amendment-72-the-quotes-category-id-and-the-source-kind)
(the quote's category id, the source kind),
[order-details-and-price.md](../../api/order-details-and-price.md)
(question 14) · Backend: built in #113 and #21 · Build: a link issue opened
after G2 (confirmation stays with #72; #17 was closed and re-scoped, see
#130).

**Why this prompt:** the fork's admin screens (design handoff v1) have **no
way to confirm any order**: `a-orders` only offers "Assign a rider". Since
#121 (PR #126) customers place orders with a server price, which arrive in
`awaiting_confirmation`; orders with no price in the app arrive as quote
requests in `quote_requested`. In the pilot many orders are requests (any
area with no delivery fee). Without this design neither kind can reach
`confirmed`, so no driver can ever be assigned.

**What already exists:** the upstream repo approved the manual-quote confirm
sheet C1 and its states (`docs/design/admin-order-confirmation.md` in
mmiri-oma/mmirioma, #87, G2 2026-10-22) and listed "C4: confirming with a
server quote" as design ahead. This prompt designs **both cases in one
sheet**, in the **fork's look**, reusing C1's structure, wording and states:
only section 3 (price) and section 4 (category) differ.

**Before using:** this fork's visual system is the **design handoff v1**
([handoff-v1.md](../handoff-v1.md); the pack is kept locally under `design/`,
git-ignored), admin patterns `a-*` (sidebar shell, tables, the `a-orders`
side panel, cards, key-value rows, chips, notices, `MiniButton`). It replaces
[00-design-system.md](00-design-system.md) here. Add a component only when a
screen truly needs one, and say so.

Paste everything inside the block into Claude Design (or use it as the spec
for a clickable preview, as for [customer-live-prices.md](../customer-live-prices.md)).

```text
Using the MmiriOma admin design already in this project (design handoff v1:
the sidebar shell, the Orders page with its table and right-hand panel,
cards, key-value rows, chips, notices; Plus Jakarta Sans), design how a
DISPATCHER CONFIRMS AN ORDER. Two kinds of order use the same sheet:
  A. PRICED ORDER: the customer saw a server price in the app and placed the
     order at it ("Server price").
  B. PRICE REQUEST: the app had no price, so the customer sent a request; the
     dispatcher agrees a total on the call ("Manual price").
Desktop first at 1280px; also show 360px (dispatchers sometimes use a phone).

CONTEXT
Customers in Enugu order water deliveries. Before a driver is sent, a
dispatcher phones the customer, agrees a delivery window (and, for a price
request, the total), and picks the water source the driver collects from.
Then the order is Confirmed, the customer gets an SMS, and a driver can be
assigned. Payment is cash on delivery after unloading, for every order.
There is no cancellation or redelivery charge.

PRODUCT HONESTY RULES (every screen)
- A priced order's total is the customer's accepted server price: read-only.
  A changed price is a repricing, which needs the customer's documented
  agreement and is NOT on this screen.
- A price request's total is what the customer agreed on the call: typed by
  the dispatcher, whole naira, fixed once confirmed.
- A priced order's water category is the one the customer accepted with the
  price: shown, not chosen. Show category labels exactly as sent; never
  "safe", "clean", "purified", "drinking" or "potable" on your own.
- Never show a source's cost per litre (supplier cost, never shown).
- Never imply a driver is assigned or the order is confirmed before it is.
- Label every sample name, phone, amount and source "SAMPLE DATA"; phones look
  like 0800 000 0001.
- Keep everything typed after any error (NFR-012).

SCREENS AND STATES

Q0. ORDERS PAGE (a-orders)
  - Both kinds read "Awaiting confirmation" in the table, the status pill and
    the panel, never "Awaiting rider" (no rider can be assigned yet). A
    confirmed order keeps "Awaiting rider" until a rider is assigned.
  - Panel card "Confirm this order", with the line "Agree the delivery window
    with the customer, then choose a water source." Button "Confirm order".
      A (priced): chip "Server price", the total, the water category.
      B (request): chip "Price request", "No price yet: agree the total on
        the call."
  - Phone not verified: button disabled, "Phone not verified" and "The
    customer must verify their phone before the order can be confirmed."
  - No "Assign a rider" on an unconfirmed order.

Q1. CONFIRM ORDER sheet (side sheet at 1280, full screen at 360; buttons fixed
    at the bottom). Sections in order:
  1 Order: reference, quantity (litres and local gallons; Keke cans or Tanker
    size), address, area, landmark, customer name, phone as a call link,
    preferred date ("No preferred date" when none).
  2 Checks: Phone verified (Done / Not met); "Pay on delivery" with "Cash
    after unloading" as a fixed line.
  3 Price:
      A: read-only, chip "Server price": the total in naira, and "The price
         the customer accepted in the app. It is fixed for this order."
      B: money field, chip "Manual price": ₦ prefix, whole naira, the
         formatted total under it ("₦45,000.00"), and "Whole naira only. The
         customer pays this in cash after unloading."
  4 Water category:
      A: read-only, the accepted category's label.
      B: radio cards, one per category; a category with no usable source is
         disabled with "No source available"; one is preselected.
  5 Water source: rows for the category. "Can be used for <category> (n)"
    first and selectable: name, approximate location, "Lab report LR-0001 ·
    Approved until <date>", a "Simulated" tag for a demo source. Then "Cannot
    be used for <category> (n)", disabled, one line per reason (ban icon +
    words: "Not activated for this category", "Suspended after a safety
    concern", "Laboratory approval expired", "Activation revoked").
      A, Tanker: only sources of the kind the customer chose, and say which
         ("Customer chose: Ninth Mile water" or "Any borehole water").
      B, Tanker: the customer's preference shown as a hint, not a filter.
  6 Delivery window: date, from, to, in Lagos time. "Agree the window with
    the customer before you confirm." The preferred date is a hint, never a
    default.
  7 Customer agreement: how (Phone call with the customer / Customer agreed
    in person to staff / Other (add a note)), when (date and time), and the
    required tick box: "I told the customer the total, the water category,
    the delivery window, that they pay cash after unloading, and that there
    is no cancellation or redelivery charge."
  8 Note: optional, 500 characters with a counter ("Other" requires it).
  "Confirm order" is enabled once every section is complete.
  States (both kinds unless marked):
  - loading;
  - no sources set up: "No water sources set up yet." / "Ask the technical
    lead to add water sources." (only Cancel);
  - none usable for the category: "No water source can be used for
    <category> right now." with Check again (A: of the customer's kind);
  - B, no category has a usable source: "This order cannot be confirmed
    yet." / "No water source can be used for any water category. Ask the
    technical lead to activate a source.";
  - phone not verified (read-only);
  - field errors: summary at the top plus under each field (B: the price
    must be whole naira, at least ₦1).

Q2. CONFIRM DIALOG: "Confirm this order?" with a summary (order, category,
    source, window, price with its chip, payment), then
      A: "<ref> becomes Confirmed and the customer is sent a confirmation SMS."
      B: the same, plus "The manual price is then fixed for this order."
    Cancel first. Confirming: locked, spinner.

Q3. ERRORS after sending (everything kept):
  - 409 transition_requirements_unmet: "This order cannot be confirmed yet."
    with one line per missing item ("The customer's phone is not verified",
    "The chosen water source can no longer be used for this category", "The
    delivery window is not set"); for the source, "The source list has been
    refreshed and your choice cleared. Choose another source."
  - 409 invalid_order_transition: "This order has changed." (another
    dispatcher confirmed it, or the customer cancelled) with Refresh.
  - 422: the message under its section (category, source, window, price).
  - 403 security check failed: "Reload page". No connection: message, kept.

Q4. CONFIRMED: toast "<ref> confirmed for <window>." The panel summary lists
    category, source (location, report reference), window, the price
    ("Server price ₦<total>" or "Manual price ₦<total>"), "Pay on delivery:
    cash after unloading", confirmed by and when, how and when the customer
    agreed, the note. Then "Assign a rider". Warnings: "The confirmation SMS
    could not be sent." / "Call the customer to tell them. The order is still
    confirmed."; "<source> can no longer be used for <category>." with the
    reason and "This order was confirmed with it. Check with the technical
    lead before a driver collects from it." (no action).

Q5. HISTORY:
    A: one entry "Confirmed" with "category · source · window · Server price
       ₦<total>" and the note (a priced order skips the manual step).
    B: two entries: "Awaiting confirmation" with the reason "Manual price
       agreed with the customer", then "Confirmed" with "category · source ·
       window · Manual price ₦<total>" and the note.

BUILD NOW: Q0 to Q5, both kinds. DESIGN AHEAD: none.

OUTPUT
The 1280px and 360px frames for every screen and state, with the exact copy.
Name components as in the handoff so developers can map them to the existing
React and Tailwind v4 components.
```

## Field rules (from the contracts)

| Item | Rule | Source |
| --- | --- | --- |
| Which orders | A: `awaiting_confirmation` with a `quote`. B: `quote_requested` (no `quote`) | [deliveries.md](../../api/deliveries.md#confirmation-rules) |
| Admin label | Both read "Awaiting confirmation"; `confirmed` stays "Awaiting rider" (decision 3; `api-mapping.md` changes with the build) | decision 3 |
| Options | `GET /admin/orders/{reference}/confirmation-options`: every active category with every source, eligible first, `reasons[]`, and (amendment) `kind`; never the cost per litre | deliveries.md, "Objects" and the #72 amendment |
| Confirm, A | `POST /admin/orders/{reference}/transition`: `to: confirmed`, `expected_status: awaiting_confirmation`, `water_category_id` = `quote.water_category.id` (amendment), `source_id` of the customer's kind (Tanker), `delivery_window`, `customer_agreement`, `note`; **no** `manual_quote_total_minor_units` (422 if sent); row 7 only | deliveries.md, "POST .../transition (confirm)" |
| Confirm, B | Same, with `expected_status: quote_requested`, the chosen `water_category_id`, any eligible `source_id`, and `manual_quote_total_minor_units` (required, whole naira, at least 100 kobo, no upper limit); rows 26 then 7 | same |
| Agreement | `method` `phone_call` / `in_person_to_staff` / `other` (requires `note`); `agreed_at` not in the future and not before the order; `disclosures_confirmed: true` | same |
| Errors | 409 `invalid_order_transition`, 409 `transition_requirements_unmet` (`phone_verified`, `source_eligible`, `delivery_window_set`), 422 `validation_error` per field, 404 `order_not_found`, 403 `csrf_failed` | same |
| Price after | The snapshot: A copies the quote's total (`manual: false`); B stores the typed total (`manual: true`) | same, "Confirmation rules" |
| SMS | Sent after the commit; `confirmation_sms.status` `accepted` / `not_accepted` on the detail | same, FR-050 |
| History | A: the row 7 entry with `confirmation`. B: the row 26 entry (`reason_code` `manual_quote`), then row 7 with `confirmation` | same, "GET .../history (change)" |

## After generating

1. Check every screen and state exists, for both kinds, and the honesty
   rules hold.
2. Record the result in `docs/design/admin-confirm-order.md` from the
   [template](../_template.md), with the screen-to-endpoint table and a
   clickable preview link.
3. Anything the design needs that the contracts lack is an open question,
   not a new field.
4. G2 after the amendment is agreed (`Status: agreed`). Then open the link
   issue (confirmation stays with #72; #17 is closed, see #130).

## Decisions (@chidimmamogbo, review of PR #132, 2026-10-27)

1. **The quote's category id:** add `id` to `quote.water_category` on the
   admin order detail (additive, read side); the confirm request stays as
   agreed. Written as a [proposed
   amendment](../../api/deliveries.md#proposed-amendment-72-the-quotes-category-id-and-the-source-kind);
   agreed by @chidimmamogbo, waiting for @nnamdi-security.
2. **The source's kind:** add `kind` (`ninth_mile`, `borehole` or `null`) to
   each `confirmation-options` source, so a priced Tanker order shows only
   sources of the customer's kind. Same amendment.
3. **Admin label:** "Awaiting confirmation" for `quote_requested` and
   `awaiting_confirmation`; `confirmed` stays "Awaiting rider". It matches
   the customer side (#126) and fixes the assign panel showing on
   unconfirmed orders (found on #125). Added to `api-mapping.md` with the
   build.
4. **Scope: both kinds here.** The same sheet confirms a price request, with
   section 3 as a money field ("Manual price") and upstream C1's wording and
   rules (`manual_quote_total_minor_units`, row 26 then row 7, two history
   entries).
