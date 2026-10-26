# Cash remittance design

> **Reference copy** from the main repo (`mmiri-oma/mmirioma@adc8654`), kept for
> [driver-cash.md](driver-cash.md), which reuses its approved K1 and K2. Links to other
> main repo design documents point to files that are not in this fork.

<!-- Recorded from the Claude Design canvas "MmiriOma Cash Remittance",
version 1792676565-c441. Workflow: docs/process/ui-driven-development.md -->

Issue: [#98](https://github.com/mmiri-oma/mmirioma/issues/98) · Requirements:
FR-040 (pay on delivery only, F4), FR-041 (cash part), FR-050 (payment
acknowledgment), BR-12, BR-15, NFR-004, NFR-012, NFR-020, NFR-021 ·
Acceptance tests: T-14, T-21, T-24 · Prompt:
[prompts/12-cash-remittance.md](prompts/12-cash-remittance.md) · Contract:
[payments.md](../api/payments.md) (agreed, G3)
Designer: @Bonvee120 (generated with Claude Design from prompt 12) ·
Reviewed by: @Cloudcrackamara (design system) and @nnamdi-security
(technical lead) on 2026-10-22 · Status: approved

This design covers the cash part of FR-041 for the pilot. The driver records
the cash after unloading and lists it for a handover; an administrator
receives it, which sets the order's payment status and sends the payment
SMS, and later reconciles it. It follows the technical lead's decisions of
2026-10-22 on prompt 12 questions 1-4. Business rules stay in the SRS and
the [payments contract](../api/payments.md).

**Approved (G2)** by the technical lead on 2026-10-22, at canvas version
`1792676565-c441`, after the design-system review by @Cloudcrackamara. K7
is design ahead and is not approved for build. The contract is agreed
(G3, [payments.md](../api/payments.md)).

## Design link

- Claude Design canvas: <https://claude.ai/artifact/UWkVKaCyD5o9kkRv2VajDd>,
  title "MmiriOma Cash Remittance".
- Version recorded here: `1792676565-c441`.
- **A separate canvas,** like the order confirmation one: the team canvas
  ("MmiriOma Design System") cannot be written from this account
  ([LOG.md](../../LOG.md), 2026-10-22). It copies the approved tokens from
  `frontend/src/index.css` exactly and adds no colours, sizes or fonts.
- **Sharing:** the canvas is shared by link. It was private while the
  agent published to it ([LOG.md](../../LOG.md), 2026-10-22).
- Boards. Driver boards show each state at 360 px and 412 px; staff boards
  at 1280 px (with the sidebar) and 360 px. Each state has numbered notes
  beside it naming the field, action or server response it uses:

  | Board | Covers |
  | --- | --- |
  | `Main.dc.html` | Rules applied, the decisions followed, labels, components, new parts, assumptions |
  | `Cash01.dc.html` | K1 Cash card: unloading complete (A5), delivered (A7), waiting for proof approval (A7), ended without unloading (no card) |
  | `Cash02.dc.html` | K1 form: empty, equal, less (note), note missing, more (note), nothing paid (₦0.00, note), confirm dialog, field refused (422) |
  | `Cash03.dc.html` | K1 after Record cash: sending, recorded, recorded after 6:00 pm, recorded less than due, already recorded (409), unloading not complete (409), offline, not sent, order not found (404) |
  | `Cash04.dc.html` | K2 My cash: loading, nothing to hand over, cash on hand, overdue, not loaded |
  | `Cash05.dc.html` | K2 Hand over cash: all ticked, some ticked, none ticked, sending, done, changed meanwhile (409), not sent |
  | `Cash06.dc.html` | K3 Cash page: loading, empty day, day with cash, driver overdue, no connection, security check failed |
  | `Cash07.dc.html` | K4 Receive cash: matches, short, over, note missing, correct amount, amount corrected, confirm dialog, sending, received with one SMS not sent, received with a difference, changed meanwhile (409), field refused (422), no connection and security check failed |
  | `Cash08.dc.html` | K5 Reconcile: one record, several with differences flagged, confirm dialog, sending, reconciled, changed meanwhile (409), no connection and security check failed |
  | `Cash09.dc.html` | K6 Payment card: delivered and not recorded (T-24), collected, part paid with SMS not sent, paid and reconciled with a difference at receipt, waiting for proof approval; history lines |
  | `Cash10.dc.html` | K7 several payment lines (design ahead) |

- All names, references, vehicles and amounts are fictional and tagged
  SAMPLE DATA. No screenshots are committed.

## Screens and states

| Screen | States designed | Build now / design ahead |
| --- | --- | --- |
| K1 Cash card on the job | Unloading complete; delivered; waiting for proof approval; no card when the job ended without unloading | Build now |
| K1 Record cash | Empty; equal; less than due (note); note missing; more than due (note); nothing paid (₦0.00, note); confirm dialog; sending; recorded; recorded after 6:00 pm; recorded less than due; already recorded; unloading not complete; offline; not sent; order not found | Build now |
| K2 My cash | Loading; nothing to hand over; cash on hand; overdue; not loaded | Build now |
| K2 Hand over cash | All ticked; some ticked; none ticked; sending; done; changed meanwhile; not sent | Build now |
| K3 Cash page | Loading; empty day; day with cash; driver overdue; no connection; security check failed | Build now |
| K4 Receive cash | Matches; short; over; note missing; correct amount (dialog); amount corrected; confirm dialog; sending; received (SMS sent, SMS not sent); received with a difference; changed meanwhile; field refused; no connection; security check failed | Build now |
| K5 Reconcile | One record; several, differences flagged; confirm dialog; sending; reconciled; changed meanwhile; no connection; security check failed | Build now |
| K6 Payment card and history | Not recorded; collected; part paid, SMS not sent; paid and reconciled with a difference at receipt; waiting for proof approval; history | Build now |
| K7 Several payment lines | One card with bank transfer, cash and Paystack lines | Design ahead |

### Behaviour shown on the screens

- **K1:** the Cash card shows "Amount due", the amount and "Manual quote ·
  Pay on delivery: cash after unloading", "Count the cash with the customer
  before you record it." and "Record cash". It sits beside "Mark as
  delivered" on A5; neither waits for the other.
- **Record cash:** one field "Cash received" with a ₦ prefix, whole naira,
  and the formatted amount under it. Equal: "Matches the amount due." Less:
  "Less than the amount due." / "₦5,000.00 will show as outstanding." More:
  "More than the amount due." / "The office will review the difference of
  ₦5,000.00." Nothing: "Customer paid nothing." / "The full ₦45,000.00
  will show as outstanding." Each difference needs "What happened?
  (required)", 500 characters with a counter. Dialog "Record cash": "You
  received ₦45,000.00 in cash for MO-1042." / "You can't change this after
  you record it."
- **Recorded:** toast "Cash recorded for MO-1042."; the card shows "Cash
  recorded", the status "Collected by driver", the time and "Hand over by"
  from the server, and "My cash". No payment SMS at this step.
- **My cash:** "To hand over" with the total and "Hand over by …", a list
  "To hand over" and a list "Handed over (last 7 days)". Overdue: banner
  "Overdue" / "This cash was due at the office by Mon 26 Oct 2026, 6:00 pm.
  Hand it over as soon as you can." and an Overdue chip on the row.
- **Hand over cash:** tick boxes, all ticked by default, "Total to hand
  over", the banner "Still your responsibility" / "The cash stays with you
  until an administrator confirms receiving it.", and "Ready to hand over".
- **Cash page:** five figures (recorded by drivers, received, reconciled,
  still with drivers, differences), a "Drivers" list with "Receive cash" per
  row, a "Received, not reconciled" list with tick boxes, "Reconcile" per
  row and "Reconcile selected".
- **Receive cash:** the driver's records with tick boxes, "Total recorded by
  the driver", "Cash counted", then "Counted matches the recorded total." or
  "₦2,000.00 short" / "₦500.00 over" with "Saved as an exception for review.
  The driver's records do not change." and a required note. Dialog "Confirm
  received": "You confirm you have received ₦92,500.00 in cash from Sample
  Driver A." / "Each order's payment status changes now, and each customer
  is sent a payment SMS." After it: each order's payment status and SMS
  outcome; "The payment SMS could not be sent for MO-1051." / "Call the
  customer to tell them. The payment is still recorded."
- **Reconcile:** per record the customer, amount due, recorded, received
  and the payment status set at receipt ("Paid · Matches the amount due",
  "Part paid · ₦2,500.00 outstanding", "Paid · More than due: review
  ₦5,000.00"). Dialog: "Payment statuses stay as they are. Differences stay
  recorded on the orders."
- **Payment card:** method, payment status, amount due, the cash line with
  its custody status, the driver's note, the payment SMS outcome, and a
  banner for a difference at receipt. The delivery status badge never
  changes because of it.

## Labels proposed

| Code | Label |
| --- | --- |
| `collected` | Collected by driver |
| `awaiting_remittance` | Ready to hand over |
| `remitted` | Received by <administrator name> |
| `reconciled` | Reconciled |
| `overdue` (flag) | Overdue |
| `pending_collection` | Pay on delivery |
| `partially_paid` | Part paid (with "₦… outstanding") |
| `paid` | Paid |
| `overpaid_minor_units` > 0 | More than due: review |

## Screen-to-endpoint table

Every row points to the agreed [payments contract](../api/payments.md).

| Screen | Element / action | Endpoint | Fields used |
| --- | --- | --- | --- |
| K1 | Cash card, Record cash | `GET /driver/jobs/{reference}` | `allowed_actions` `record_cash`, `cash.amount_due_minor_units`, `cash.amount_due_label`, `cash.collection` |
| K1 | Record cash | `POST /driver/jobs/{reference}/cash-collection` | `amount_minor_units`, `note`; 201 / 200 repeat; 409 `cash_already_recorded` (`details.amount_minor_units`), 409 `transition_requirements_unmet` (`unloading_completed`), 404 `order_not_found`, 422 |
| K2 | My cash | `GET /driver/cash` | `on_hand_minor_units`, `ready_minor_units`, `remittance_due_at`, `overdue`, `collections` |
| K2 | Ready to hand over | `POST /driver/cash/handover` | `collection_ids`; 409 `cash_collection_changed` |
| K3 | Cash page | `GET /admin/cash?date=` | `totals`, `drivers`, `awaiting_reconciliation` |
| K4 | Driver's records | `GET /admin/cash/drivers/{driver_id}` | `AdminCashCollection` list |
| K4 | Correct amount | `POST /admin/cash-collections/{id}/correction` | `amount_minor_units`, `reason`; 200 `original_amount_minor_units`, `corrected_by`, `corrected_at`, `correction_reason`; 404, 409, 422 |
| K4 | Confirm received | `POST /admin/cash-remittances` | `driver_id`, `collection_ids`, `counted_minor_units`, `note`; 201 `difference_minor_units`, `orders[].payment_status`, `outstanding_balance_minor_units`, `sms_status`; 409, 422 |
| K5 | Reconcile | `POST /admin/cash-reconciliations` | `collection_ids`, `note`; 200; 409, 422 |
| K6 | Payment card | `GET /admin/orders/{reference}` | `payment` (method, status, balances, `cash_collection`, `remittance_difference`, `sms_status`) |
| History | Cash lines | `GET /admin/orders/{reference}/history` | events `cash_recorded`, `cash_handed_over`, `cash_corrected`, `cash_received`, `cash_reconciled` |
| K7 | Several payment lines | none | Design ahead |

## Decisions

1. **Prompt 12 questions 1-4** (technical lead, 2026-10-22) are followed as
   decided: the driver hands over with "Hand over cash"; the payment status
   and SMS change on receipt; a different amount needs the driver's note and
   only a counted difference at receipt is an exception; ₦0.00 is a valid
   collection.
2. **Reconciling shows, but never sets, the payment status.** The prompt's
   K5 text first said the server sets it at reconciliation; after decision
   2 it is set at receipt (prompt 12 corrected in the same change).
3. **One counted amount per handover in K4,** not one per order. A
   difference belongs to the handover and is stored on the remittance record
   ([payments.md](../api/payments.md#decisions), decision 1).
4. **Overdue is a flag with no action.** It shows on K2 and K3 from the
   server and blocks nothing in the pilot (prompt 12, question 5).
5. **No payment information beyond the amount due for drivers** (FR-040,
   BR-13): the driver never sees the payment status or other orders'
   payments.
6. **"Correct amount" in K4** (prompt 12, question 6). An administrator can
   correct a record before receiving it, with a required reason; the row
   then reads "Corrected from ₦4,500.00 by Ngozi E." with the reason, and
   the history keeps the original amount. Added to Cash07 and the Cash09
   history after the prompt was run; not offered once the cash is received.
7. **Also decided** (technical lead, 2026-10-22, with @Cloudcrackamara
   reviewing): an overpayment is a flag only, any refund under F7; the same
   administrator may receive and reconcile; existing orders confirmed or
   later and not cancelled get the payment fields; an outstanding balance is
   collected outside the app (fallback F9) and the order stays Part paid.
8. **Assumptions confirmed at review:** "Cash" in the driver menu next to
   "Jobs" and in the staff sidebar after "Holds"; K2 shows the last 7 days
   of handed-over cash (a display window, not a rule).

## Open questions

None. Prompt 12 questions 1-9 and the contract's questions were decided on
2026-10-22 ([payments.md](../api/payments.md#decisions)).

## Changes to the design system

No new token. Three parts drawn with existing tokens, to add to
`design-system.md` if approved:

- **Amount block:** a caption over a 28 px bold amount and an optional line.
- **Cash row:** reference and time on the left, amount and status chip on
  the right, optional tick box and button.
- **Figure tile:** caption and 22 px figure, for the K3 summary.
