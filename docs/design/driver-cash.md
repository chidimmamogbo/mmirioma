# Driver cash design (partner app)

<!-- Workflow: docs/process/ui-driven-development.md. Fork gates: CLAUDE.md,
"Team fork workflow". -->

Issue: [#7](https://github.com/chidimmamogbo/mmirioma/issues/7) · Requirements:
FR-040 (pay on delivery only, F4), FR-041 (cash part), BR-12, BR-13, BR-15,
NFR-004, NFR-012, NFR-021 · Acceptance tests: T-14, T-21, T-24 · Contract:
[payments.md](../api/payments.md) (agreed, G3) · Based on: the main repo's
approved [cash remittance design](cash-remittance.md) (K1, K2)
Designer: @chidimmamogbo + Claude Code · Reviewed by: @chidimmamogbo on 2026-10-26 · Status: approved

The partner app's screens for the cash a customer pays on delivery: the rider
or driver records what they received (K1), sees the cash they hold, and hands
it over to the office (K2). An administrator then receives it, which sets the
order's payment status (K3 to K6, not in this design; linked in #19).

**Approved (G2)** by @chidimmamogbo on 2026-10-26, at preview version
`1793014264-890c`, including the new wording listed in decision 7. The
contract is agreed (G3, [payments.md](../api/payments.md)).

**Behaviour, states and wording come from the approved main repo design**
(`cash-remittance.md`, approved G2 on 2026-10-22, canvas version
`1792676565-c441`), which already matches the agreed contract. This document
only places K1 and K2 in the fork's partner app and redraws them with its
design system. Every change from the approved design is listed under
[Decisions](#decisions).

## Design link

- Clickable preview (every state, Rider and Driver app, phone width, sample
  data): <https://claude.ai/artifact/EmuF94h7pQteg79i56tX2E>, version
  `1793014264-890c`. A review aid, not committed code; states with new
  wording are tagged "new wording". Private until shared from its Share menu.
- Reference: [cash-remittance.md](cash-remittance.md) and its Claude Design
  canvas.

## Where the screens sit

| Place | Rider app (Keke) | Driver app (Tanker) |
| --- | --- | --- |
| K1 Cash card | Delivery successful (`/partner/rider/jobs/:ref/done`), in place of the "Payment" row | Delivered (`/partner/driver/jobs/:ref/done`), same place |
| K1 Cash card, later | The job page of a delivered job with no cash recorded | Same |
| K2 home card | Rider home, under the online card, only while cash is on hand | Driver home, same |
| K2 My cash | Menu item "My cash" (`/partner/rider/cash`) | Menu item "My cash" (`/partner/driver/cash`) |
| K2 Hand over cash | From My cash (`.../cash/handover`) | Same |

The word for the person follows the app: "rider" in the Keke app, "driver"
in the Tanker app. The server role is `driver` for both
([api-mapping.md](../architecture/api-mapping.md#names)).

## Screens and states

All amounts are SAMPLE DATA. Money shows as naira with kobo (`₦6,500.00`) on
these screens, as in the approved design, because cash must match to the
kobo. Every state below is from the approved design unless marked *fork*.

| Screen | States designed | Build now / design ahead |
| --- | --- | --- |
| K1 Cash card | Ready to record; recorded; recorded after 6:00 pm; no card (job ended without unloading, or cancelled) | Build now (#20) |
| K1 Record cash | Empty; equal; less than due (note); note missing; more than due (note); nothing paid (₦0.00, note); confirm dialog; sending; recorded; recorded less than due; already recorded (409); unloading not complete (409); offline; not sent; order not found (404); field refused (422) | Build now (#20) |
| K2 Home card *fork* | Cash on hand; overdue; hidden when nothing is on hand | Build now (#20) |
| K2 My cash | Loading; nothing to hand over; cash on hand; overdue; not loaded | Build now (#20) |
| K2 Hand over cash | All ticked; some ticked; none ticked; sending; done; changed meanwhile (409); not sent | Build now (#20) |

### K1 Cash card

A `Card` on the Done screen, below the job summary, replacing the "Payment"
row (decision 3).

- **Ready to record:** caption "Amount due", the amount in 28 px bold
  (`₦6,500.00`), a line set by `cash.amount_due_label` (decision 8):
  `manual_quote` shows "Manual quote · Pay on delivery: cash after
  unloading"; `quote` (an order placed with a server quote) and any other
  value show "Pay on delivery: cash after unloading". Then the hint
  "Count the cash with the customer before you record it." and a primary
  button "Record cash". "Back to dashboard" stays below; neither waits for
  the other.
- **Recorded:** a green "Cash recorded" chip, "Collected by rider" (or
  driver), the time, "Hand over by Mon 26 Oct, 6:00 pm" from the server, and
  an `alt` button "My cash".
- **Recorded after 6:00 pm:** as recorded; the hand-over time is the next
  day, as the server sends it.
- **No card** when the job ended without unloading or was cancelled.

### K1 Record cash

A full screen in the partner shell (`TopBar` with back), title "Record
cash", the job reference and customer name under it.

- **Field:** "Cash received", ₦ prefix, whole naira, numeric keyboard; the
  formatted amount under it.
- **Equal:** "Matches the amount due." (green).
- **Less:** "Less than the amount due." / "₦1,500.00 will show as
  outstanding." (amber), plus the note field.
- **More:** "More than the amount due." / "The office will review the
  difference of ₦500.00." (amber), plus the note field.
- **Nothing paid (₦0):** "Customer paid nothing." / "The full ₦6,500.00 will
  show as outstanding." (amber), plus the note field.
- **Note:** "What happened? (required)", 500 characters with a counter.
  **Note missing:** "Tell us what happened." under the field; the button
  stays enabled and the error shows on tap.
- **Confirm dialog** (`ConfirmDialog`): title "Record cash", "You received
  ₦6,500.00 in cash for MO-7KQ2." / "You can't change this after you record
  it." Buttons "Record cash" and "Go back".
- **Sending:** the button shows its spinner; the field locks.
- **Recorded:** toast "Cash recorded for MO-7KQ2." and back to the Done
  screen showing the recorded card. No payment SMS at this step.
- **Recorded less than due:** as recorded, with "₦1,500.00 outstanding" on
  the card.
- **Already recorded (409 `cash_already_recorded`):** `Notice` "Cash already
  recorded" / "₦6,500.00 was recorded for this order. Contact the office if
  that is wrong." The form closes.
- **Unloading not complete (409 `transition_requirements_unmet`):** "Finish
  unloading first" / "You can record cash once unloading is complete."
- **Order not found (404):** "This order is no longer yours" / "It may have
  been reassigned. Go back to your jobs."
- **Field refused (422):** the server's field message under the field.
- **Offline / not sent:** "Not sent" / "Check your connection and try again.
  Nothing was recorded." with "Try again". The amount and note are kept
  (NFR-012).

### K2 Home card *fork*

On the partner home, under the online card, only while cash is on hand: "Cash
to hand over", the total, "Hand over by …", and a link "My cash". **Overdue:**
red border and an "Overdue" chip. Hidden when nothing is on hand.

### K2 My cash

A screen in the partner shell, title "My cash".

- **Header block:** "To hand over", the total in 28 px bold, "Hand over by
  Mon 26 Oct, 6:00 pm", and the primary button "Hand over cash".
- **List "To hand over":** a cash row per record: reference and time on the
  left, amount and status chip ("Collected by rider", "Ready to hand over")
  on the right; an "Overdue" chip when the server says so.
- **List "Handed over (last 7 days)":** rows with "Received by Ngozi E." or
  "Reconciled".
- **Overdue:** red `Notice` "Overdue" / "This cash was due at the office by
  Mon 26 Oct 2026, 6:00 pm. Hand it over as soon as you can." It blocks
  nothing.
- **Nothing to hand over:** empty state "No cash to hand over" / "Cash you
  record after a delivery shows here."
- **Loading** (`LoadingBlock`) and **not loaded** (`ErrorBlock` with "Try
  again").

### K2 Hand over cash

- Tick boxes per record, all ticked by default; "Total to hand over"
  updates as boxes change.
- Amber `Notice` "Still your responsibility" / "The cash stays with you until
  an administrator confirms receiving it."
- Primary button "Ready to hand over"; disabled with **none ticked**.
- **Sending**, then **done:** toast "Marked ready to hand over." and back to
  My cash with the rows showing "Ready to hand over".
- **Changed meanwhile (409 `cash_collection_changed`):** "Some cash changed"
  / "The office already received some of it. Your list is updated." and the
  list reloads.
- **Not sent:** "Not sent" / "Check your connection and try again."

## Labels

| Code | Label |
| --- | --- |
| `collected` | Collected by rider / Collected by driver |
| `awaiting_remittance` | Ready to hand over |
| `remitted` | Received by <administrator name> |
| `reconciled` | Reconciled |
| `overdue` (flag) | Overdue |

## Screen-to-endpoint table

Every row points to the agreed [payments contract](../api/payments.md).

| Screen | Element / action | Endpoint | Fields used |
| --- | --- | --- | --- |
| K1 | Cash card | `GET /driver/jobs/{reference}` | `allowed_actions` `record_cash`, `cash.amount_due_minor_units`, `cash.amount_due_label`, `cash.collection` |
| K1 | Record cash | `POST /driver/jobs/{reference}/cash-collection` | `amount_minor_units`, `note`; 201 / 200 repeat; 409 `cash_already_recorded`, 409 `transition_requirements_unmet`, 404 `order_not_found`, 422 |
| K2 | Home card, My cash | `GET /driver/cash` | `on_hand_minor_units`, `ready_minor_units`, `remittance_due_at`, `overdue`, `collections` |
| K2 | Ready to hand over | `POST /driver/cash/handover` | `collection_ids`; 409 `cash_collection_changed`, 422 |

## Decisions

1. **The main repo's approved K1 and K2 are reused** (@chidimmamogbo,
   2026-10-26): same behaviour, states and wording; redrawn with the fork's
   design system. No new rule.
2. **K1 sits on the Done screen and the delivered job's page**
   (@chidimmamogbo, 2026-10-26). The fork's flow is pour, delivery code,
   done; by then unloading is complete, which the contract requires
   (BR-15).
3. **The Done screen's "Payment" chip is removed.** It showed the order's
   payment status to the partner, which the approved design rules out
   (decision 5 there; FR-040, BR-13). The Cash card replaces it.
4. **My cash is a home card and a menu item, apart from Earnings**
   (@chidimmamogbo, 2026-10-26). Earnings is the partner's own pay; My cash
   is the customer's money the partner holds for the office.
5. **"Rider" or "driver" follows the app.** The approved design says
   "driver"; the fork's Keke app says "rider" (design decision 9).
6. **Naira with kobo on cash screens only** (`₦6,500.00`), as approved;
   the rest of the partner app keeps its whole-naira style.
7. **New wording, to review:** the approved design's summary does not quote
   the text of these states, so it is written here: "Tell us what happened."
   (note missing), "Cash already recorded", "Finish unloading first", "This
   order is no longer yours", "Not sent", "Some cash changed", "No cash to
   hand over", the K2 home card, and the toast "Marked ready to hand over."
8. **Price label by `amount_due_label`** (@chidimmamogbo, 2026-10-26;
   settles the open question left by this design). The order details and
   price contract (#28) uses `quote` for an order placed with a server quote
   and keeps `manual_quote` for a dispatcher's manual price
   ([order-details-and-price.md](../api/order-details-and-price.md),
   payments.md amendment 3). The card says "Manual quote" only for
   `manual_quote`, so a quoted price is never called manual; `quote` and any
   label the app does not know show "Pay on delivery: cash after unloading"
   alone, without failing.

## Open questions

- Linking (#20) depends on the backend job steps (#13) for
  `unloading_completed_at`, since the fork's flow has no separate
  "unloading complete" step yet.

## Changes to the design system

No new token. Two parts drawn with existing tokens, as in the approved
design: the **amount block** (caption, 28 px bold amount, optional line) and
the **cash row** (reference and time left, amount and chip right, optional
tick box).
