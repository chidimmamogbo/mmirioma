# Prompt 14: confirming an order placed with a server quote (admin)

Issue: [#72](https://github.com/chidimmamogbo/mmirioma/issues/72) ·
Requirements: FR-012, FR-014, FR-022, FR-023, FR-024, FR-027, FR-030,
FR-033 (row 7), FR-036, FR-050, BR-02, BR-05, NFR-004, NFR-012, NFR-020,
NFR-021, NFR-022 · Acceptance tests: T-04, T-09, T-14 · Contracts (agreed,
G3): [deliveries.md](../../api/deliveries.md#order-confirmation-endpoints)
("Confirmation rules", extended in #21),
[order-details-and-price.md](../../api/order-details-and-price.md)
(question 14) · Backend: built in #113 and #21 · Build: #17, after approval.

**Why this prompt:** since #121 (PR #126) customers place orders with a
server price. Such an order arrives in `awaiting_confirmation`, and the
fork's admin screens (design handoff v1) have **no way to confirm any
order**: `a-orders` only offers "Assign a rider", and #17 may link only what
the screens already show. Without this design a priced order cannot reach
`confirmed`, so no driver can ever be assigned to it.

**What already exists:** the upstream repo approved the manual-quote confirm
sheet C1 and its states (`docs/design/admin-order-confirmation.md` in
mmiri-oma/mmirioma, #87, G2 2026-10-22), and listed "C4: confirming with a
server quote" as design ahead. This prompt designs that case in the **fork's
look** and reuses C1's structure, labels and states wherever the contract
allows, so a dispatcher learns one sheet.

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
DISPATCHER CONFIRMS AN ORDER THE CUSTOMER PLACED WITH A SERVER PRICE.
Desktop first at 1280px; also show 360px (dispatchers sometimes use a phone).

CONTEXT
Customers in Enugu order water deliveries. When the app could price the
order, the customer saw the total and placed the order at that price. The
order now waits for a dispatcher, who phones the customer, agrees a delivery
window, and picks the water source the driver collects from. Then the order
is Confirmed, the customer gets an SMS, and a driver can be assigned.
Payment is cash on delivery after unloading, for every order. There is no
cancellation or redelivery charge.

PRODUCT HONESTY RULES (every screen)
- The price is the customer's accepted server price. Show it read-only; the
  dispatcher cannot type or change it here. A changed price is a repricing,
  which needs the customer's documented agreement and is NOT on this screen.
- The water category is the one the customer accepted with the price: shown,
  not chosen. Show its label exactly as sent; never "safe", "clean",
  "purified", "drinking" or "potable" on your own.
- Never show a source's cost per litre (supplier cost, never shown).
- Never imply a driver is assigned or the order is confirmed before it is.
- Label every sample name, phone, amount and source "SAMPLE DATA"; phones look
  like 0800 000 0001.
- Keep everything typed after any error (NFR-012).

SCREENS AND STATES

Q0. ORDERS PAGE (a-orders), an order placed with a server price
  - In the table and the right-hand panel this order reads "Awaiting
    confirmation" (see open question 3), never "Awaiting rider".
  - Panel card "Confirm this order": the price chip "Server price", the total,
    the water category, and the line "Agree the delivery window with the
    customer, then choose a water source." Button "Confirm order".
  - Phone not verified: button disabled, "Phone not verified" and "The
    customer must verify their phone before the order can be confirmed."

Q1. CONFIRM ORDER sheet (side sheet at 1280, full screen at 360; buttons fixed
    at the bottom). Sections in order:
  1 Order: reference, quantity (litres and local gallons; Keke cans or Tanker
    size), address, area, landmark, customer name, phone as a call link,
    preferred date ("No preferred date" when none).
  2 Checks: Phone verified (Done / Not met); "Pay on delivery" with "Cash
    after unloading" as a fixed line.
  3 Price (read-only), chip "Server price": the total in naira, and "The
    price the customer accepted in the app. It is fixed for this order."
  4 Water category (read-only): the accepted category's label.
  5 Water source: rows for that category. "Can be used for <category> (n)"
    first and selectable: name, approximate location, "Lab report LR-0001 ·
    Approved until <date>", a "Simulated" tag for a demo source. Then "Cannot
    be used for <category> (n)", disabled, one line per reason (ban icon +
    words: "Not activated for this category", "Suspended after a safety
    concern", "Laboratory approval expired", "Activation revoked").
    TANKER orders: only sources of the kind the customer chose ("Ninth Mile
    water" or "Any borehole water"); say which kind (see open question 2).
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
  States: loading; no source of the customer's kind can be used for the
  category ("No water source can be used for this order right now." with
  Check again); no sources set up ("No water sources set up yet." / "Ask the
  technical lead to add water sources."); phone not verified (read-only);
  field errors (summary at the top plus under each field).

Q2. CONFIRM DIALOG: "Confirm this order?" with a summary (order, category,
    source, window, server price, payment) and "<ref> becomes Confirmed and
    the customer is sent a confirmation SMS." Cancel first. Confirming:
    locked, spinner.

Q3. ERRORS after sending (everything kept):
  - 409 transition_requirements_unmet: "This order cannot be confirmed yet."
    with one line per missing item (phone not verified / the chosen source
    can no longer be used / the delivery window is not set); for the source,
    "The source list has been refreshed and your choice cleared. Choose
    another source."
  - 409 invalid_order_transition: "This order has changed." (another
    dispatcher confirmed it, or the customer cancelled) with Refresh.
  - 422 on the category or source: the message under that section.
  - 403 security check failed: "Reload page". No connection: message, kept.

Q4. CONFIRMED: toast "<ref> confirmed for <window>." The panel summary lists
    category, source (location, report reference), window, "Server price
    ₦<total>", "Pay on delivery: cash after unloading", confirmed by and
    when, how and when the customer agreed, the note. Then "Assign a rider".
    Warnings as in C2: "The confirmation SMS could not be sent." / "Call the
    customer to tell them. The order is still confirmed."; a source that is
    no longer eligible (warning, no action).

Q5. HISTORY: one entry "Confirmed" with "category · source · window ·
    Server price ₦<total>" and the note. (No "Manual quote agreed" entry: a
    priced order skips that step.)

BUILD NOW: Q0 to Q5. DESIGN AHEAD: none.

OUTPUT
The 1280px and 360px frames for every screen and state, with the exact copy.
Name components as in the handoff so developers can map them to the existing
React and Tailwind v4 components.
```

## Field rules (from the agreed contracts)

| Item | Rule | Source |
| --- | --- | --- |
| Which orders | `status` `awaiting_confirmation` with a `quote` (placed with a server price). A quote request (`quote_requested`) is confirmed with a manual total instead (not this prompt; open question 4) | [deliveries.md](../../api/deliveries.md#confirmation-rules) |
| Options | `GET /admin/orders/{reference}/confirmation-options`: every active category with every source, eligible first, `reasons[]`; never the cost per litre | same, "Objects" |
| Confirm | `POST /admin/orders/{reference}/transition` with `to: confirmed`, `expected_status: awaiting_confirmation`, `water_category_id` (the quote's), `source_id`, `delivery_window`, `customer_agreement` (`method`, `agreed_at`, `disclosures_confirmed: true`), `note`; **no** `manual_quote_total_minor_units` (422 if sent) | same, "POST .../transition (confirm)" |
| Price shown | `quote.total_minor_units` on the order (frozen, FR-024); the snapshot copies it with `manual: false` | same, "Confirmation rules" |
| Tanker source | Must be of the customer's `water_source` kind; a source with no kind does not match (422 on `source_id`) | same |
| Errors | 409 `invalid_order_transition`, 409 `transition_requirements_unmet` (`phone_verified`, `source_eligible`, `delivery_window_set`), 422 `validation_error` per field, 404 `order_not_found`, 403 `csrf_failed` | same |
| SMS | Sent after the commit; `confirmation_sms.status` `accepted` / `not_accepted` on the detail | same, FR-050 |
| History | Row 7 only for a priced order; `confirmation` line with `total_minor_units` and `manual` | same, "GET .../history (change)" |

## After generating

1. Check every screen and state exists and the honesty rules hold.
2. Record the result in `docs/design/admin-confirm-quoted-order.md` from the
   [template](../_template.md), with the screen-to-endpoint table and a
   clickable preview link.
3. Anything the design needs that the contracts lack stays an open question
   below, not a new field.
4. After approval (G2), the build belongs to #17 (confirmation).

## Open questions for the reviewers (@chidimmamogbo; contract owner @nnamdi-security)

1. **The quote's category id (contract gap).** Confirming must send the
   quote's `water_category_id`, but the admin order detail's
   `quote.water_category` has the **label only** (`OrderQuoteRead`:
   `label`, `supported_uses`). The client could only match it by label among
   the options' categories, which breaks if two categories share a label.
   Proposal: an additive `id` on `quote.water_category` in `AdminOrderRead`
   (G3), or the server takes the quote's category when the field is absent.
2. **The source's kind (contract gap).** For a Tanker order the source must
   be of the customer's kind, but `confirmation-options` sources carry no
   `kind`, so the screen cannot filter them: the dispatcher would learn only
   from a 422 after confirming. Proposal: an additive `kind` (`ninth_mile`,
   `borehole` or `null`) on each source option (G3), so the sheet shows only
   matching sources.
3. **The admin status for these orders.** The fork's admin adapter shows
   `quote_requested`, `awaiting_confirmation` and `confirmed` all as
   "Awaiting rider" (api-mapping.md), but no rider can be assigned before
   confirmation. Show "Awaiting confirmation" in the table, pill and panel
   for `awaiting_confirmation` (and `quote_requested`)?
4. **Scope: quote requests too?** The fork also cannot confirm a quote
   request (`quote_requested`, manual total). It is the same sheet with
   section 3 as a money field (upstream C1). Design it here as well, or keep
   #72 to priced orders and open a separate issue?
