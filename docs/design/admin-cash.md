# Admin cash design (admin app)

<!-- Workflow: docs/process/ui-driven-development.md. Fork gates: CLAUDE.md,
"Team fork workflow". -->

Issue: [#19](https://github.com/chidimmamogbo/mmirioma/issues/19) · Requirements:
FR-040 (pay on delivery only, F4), FR-041 (cash part), FR-050 (payment SMS),
BR-07, BR-12, BR-15, NFR-004, NFR-012, NFR-020, NFR-021 · Acceptance tests:
T-14, T-21, T-24 · Contract: [payments.md](../api/payments.md) (agreed, G3) ·
Based on: the main repo's approved [cash remittance design](cash-remittance.md)
(K3, K4, K5) · Designer: @nnamdi-security + Claude Code · Reviewed by: @nnamdi-security
(technical lead) on 2026-10-26 · Status: approved

The admin app's screens for the cash drivers collect on delivery: the day's
cash per driver (K3), receiving a driver's handover with the counted total and
correcting a record first (K4), and reconciling received cash (K5). They pair
with the partner app's K1 and K2 ([driver-cash.md](driver-cash.md), #20).

**Approved (G2)** by @nnamdi-security, technical lead, sole approver under
#36, on 2026-10-26, as written, including the fork decisions 2-6 and the new
wording in decision 6. The contract is agreed (G3, [payments.md](../api/payments.md)).

**Behaviour, states and wording come from the approved main repo design**
(`cash-remittance.md`, approved G2 on 2026-10-22 by the technical lead,
canvas version `1792676565-c441`, boards `Cash06` to `Cash08`), which already
matches the agreed contract. This document only places K3 to K5 in the fork's
admin app and draws them with its components. Every change from the approved
design is listed under [Decisions](#decisions).

## Design link

- Visual reference: the approved Claude Design canvas "MmiriOma Cash
  Remittance" ([cash-remittance.md](cash-remittance.md#design-link)), boards
  `Cash06.dc.html` (K3), `Cash07.dc.html` (K4) and `Cash08.dc.html` (K5).
- No new canvas: the fork draws these screens with its existing admin parts
  (`AdminFrame`, `PageHead`, `Panel`, `StatCard`, `DataTable`, `MiniButton`,
  `NairaInput`, `ConfirmDialog`, `Notice`, `LoadingBlock`, `ErrorBlock`). No
  new token, colour, size or font.

## Where the screens sit

| Screen | Place | Route |
| --- | --- | --- |
| K3 Cash page | New sidebar item **Cash**, directly after **Payments** | `/admin/cash` (`?date=YYYY-MM-DD`, default today in Lagos) |
| K4 Receive cash | "Receive cash" on a driver row of K3 | `/admin/cash/drivers/:driverId` |
| K5 Reconcile | The "Received, not reconciled" panel on K3, with its confirm dialog | on `/admin/cash` |

The existing **Payments** page (`/admin/payments`, a per-order list with "Mark
paid") is unchanged. It has no endpoint in the contract (see
[Decisions](#decisions), 2), so its functions keep their mocks and show "not
connected yet" against the real API.

## Screens and states

All amounts are SAMPLE DATA in mock mode. Money shows as naira with kobo
(`₦6,500.00`) on these screens, as in the approved design and the partner
cash screens, because cash must match to the kobo. Every state is from the
approved design unless marked *fork*.

| Screen | States | Build now / design ahead |
| --- | --- | --- |
| K3 Cash page | Loading; empty day; day with cash; driver overdue; no connection; security check failed; day picker *fork* | Build now (#19) |
| K4 Receive cash | Matches; short; over; note missing; correct amount (dialog); amount corrected; confirm dialog; sending; received (SMS sent, SMS not sent); received with a difference; changed meanwhile (409); field refused (422); driver not found (404); no connection; security check failed; driver has nothing to receive *fork* | Build now (#19) |
| K5 Reconcile | One record; several, differences flagged; confirm dialog; sending; reconciled; changed meanwhile (409); no connection; security check failed | Build now (#19) |

### K3 Cash page (`GET /admin/cash?date=`)

- **Head:** "Cash", with the day shown as "Mon 26 Oct 2026" and two small
  buttons "Previous day" and "Next day" (*fork*, decision 3). Next day is
  disabled on today.
- **Five figures** (`StatCard`): "Recorded by drivers", "Received",
  "Reconciled", "Still with drivers" (all money from `totals`), and
  "Differences" (a count, `totals.differences`).
- **Drivers** panel: one row per driver from `drivers`, in the server's order
  (overdue first): name and vehicle, "With the driver", "Ready to hand over",
  "Hand over by" (Lagos time) with an **Overdue** chip when `overdue` is
  true, "Last received", and **Receive cash** (to K4). Empty: "No cash with
  drivers on this day."
- **Received, not reconciled** panel: K5 below.
- **Errors:** no connection → `ErrorBlock` "Could not load the cash page."
  with Retry; 403 `csrf_failed` on an action → "Your session check failed.
  Reload the page and try again." (the approved "security check failed").

### K4 Receive cash (`GET /admin/cash/drivers/{driver_id}`)

- **Head:** "Receive cash from Sample Driver A", back link "Cash".
- **The driver's records** (`collections`): tick box (all ticked), order
  reference, customer, "Amount due", "Recorded", the custody status label,
  the driver's note, and "Correct amount" while the record is not received.
  A corrected row reads "Corrected from ₦4,500.00 by Ngozi E." with the
  reason (decision 6 of the approved design).
- **Correct amount** dialog: "New amount" (`NairaInput`) and "Reason
  (required)", 500 characters; `POST /admin/cash-collections/{id}/correction`.
- **Count:** "Total recorded by the driver" for the ticked records, "Cash
  counted" (`NairaInput`), then "Counted matches the recorded total." or
  "₦2,000.00 short" / "₦500.00 over" with "Saved as an exception for review.
  The driver's records do not change." and a required note.
- **Confirm received** dialog: "You confirm you have received ₦92,500.00 in
  cash from Sample Driver A." / "Each order's payment status changes now, and
  each customer is sent a payment SMS." → `POST /admin/cash-remittances`.
- **Received:** each order's payment status label and SMS outcome; for a
  failed SMS: "The payment SMS could not be sent for MO-1051." / "Call the
  customer to tell them. The payment is still recorded." Then "Back to Cash".
- **Changed meanwhile** (409 `cash_collection_changed`): "These records
  changed while you were counting. The list has been reloaded." and the list
  reloads. **Field refused** (422): the field's message under the field.
- **Nothing to receive** (*fork*): "Sample Driver A has no cash to hand over."
  with "Back to Cash".
- **Driver not found** (404 `driver_not_found`): `ErrorBlock` "Driver not
  found." with "Back to Cash".

### K5 Reconcile (on K3, `POST /admin/cash-reconciliations`)

- **Received, not reconciled** (`awaiting_reconciliation`, oldest first): tick
  box, order reference, customer, "Amount due", "Recorded", "Received" (who
  and when), and the payment status set at receipt: "Paid · Matches the
  amount due", "Part paid · ₦2,500.00 outstanding", "Paid · More than due:
  review ₦5,000.00". "Reconcile" per row and "Reconcile selected".
- **Confirm** dialog: "Reconcile 3 records?" / "Payment statuses stay as they
  are. Differences stay recorded on the orders."
- **Reconciled:** toast "Reconciled 3 records." and the panel reloads. Empty:
  "Nothing waiting to be reconciled."
- **Changed meanwhile** (409): as K4.

## Screen-to-endpoint table

Every row points to the agreed [payments contract](../api/payments.md); the
client is `frontend/src/lib/api/adminCash.ts`.

| Screen | Element / action | Endpoint | Fields used |
| --- | --- | --- | --- |
| K3 | Cash page | `GET /admin/cash?date=` | `date`, `totals`, `drivers`, `awaiting_reconciliation` |
| K4 | Driver's records | `GET /admin/cash/drivers/{driver_id}` | `driver`, `collections` (`AdminCashCollection`) |
| K4 | Correct amount | `POST /admin/cash-collections/{id}/correction` | `amount_minor_units`, `reason`; 200 corrected record; 404, 409, 422 |
| K4 | Confirm received | `POST /admin/cash-remittances` | `driver_id`, `collection_ids`, `counted_minor_units`, `note`; 201 `Remittance` (`difference_minor_units`, `orders[]`); 409, 422 |
| K5 | Reconcile | `POST /admin/cash-reconciliations` | `collection_ids`, `note`; 200; 409, 422 |

No screen field lacks a source.

## Decisions

1. **The approved K3 to K5 are reused** (@nnamdi-security, 2026-10-26): same
   behaviour, states and wording; drawn with the fork's admin components. No
   new rule.
2. **The Payments page is not relinked.** Its per-order list and "Mark paid"
   have no endpoint: payment becomes paid only when an administrator receives
   a driver's handover with the counted total (BR-07, payments.md), and bank
   transfers and refunds are not in the pilot (F4). `listPayments`,
   `confirmPayment` and `refundAsPoints` keep their mocks and "not connected
   yet" against the real API. Decided with the re-scope of #19 (2026-10-26).
3. **Sidebar and day picker** (*fork*). The approved design put "Cash" after
   "Holds"; the fork has no Holds page, so "Cash" sits after "Payments". The
   approved K3 shows one day; the fork adds "Previous day" / "Next day" to
   reach the contract's `date` parameter.
4. **K5 lives on K3,** as in the approved design (the "Received, not
   reconciled" list with "Reconcile selected"); no separate route.
5. **Mock mode** (`VITE_USE_MOCKS=true`) serves sample cash data through the
   same functions, so the full mock demo includes K3 to K5. Sample data is
   tagged SAMPLE.
6. **Wording added by the fork, to review:** "No cash with drivers on this
   day.", "Sample Driver A has no cash to hand over.", "Nothing waiting to be
   reconciled.", "Reconciled 3 records.", "These records changed while you
   were counting. The list has been reloaded.", "Your session check failed.
   Reload the page and try again." Everything else is the approved wording.

## Open questions

None. The approved design and the agreed contract decide every rule
(payments.md decisions, 2026-10-22).

## Changes to the design system

None.
