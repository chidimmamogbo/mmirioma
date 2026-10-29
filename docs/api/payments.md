# Payments contract: cash collection, remittance and reconciliation

Status: **agreed** (G3) on 2026-10-22 by @nnamdi-security (technical lead,
contract owner) and @chidimmamogbo (backend reviewer). Derived from the
approved [cash remittance design](../design/cash-remittance.md) (G2,
2026-10-22). Backend built in #123 (`backend/app/modules/payments/`,
migration `0013`; see [cash-remittance.md](../features/cash-remittance.md)).
The build found three gaps; [amendments 1-3](#amendments-proposed-in-the-123-build)
were agreed by the technical lead on 2026-10-23 and are built (#135).

Issue: [#98](https://github.com/mmiri-oma/mmirioma/issues/98) · Prompt:
[12-cash-remittance.md](../design/prompts/12-cash-remittance.md) ·
Requirements: FR-040 (pay on delivery only, fallback F4), FR-041 (cash
part), FR-050 (payment acknowledgment, P0), BR-12, BR-15, NFR-004, NFR-011,
NFR-032 · Acceptance tests: T-14, T-21, T-24

The pilot takes cash on delivery only. The driver records the cash after
unloading, hands it to an administrator before 6:00 PM Africa/Lagos, and an
administrator receives it and later reconciles it. Paystack, bank transfer
and refunds are out of scope (F4, F7). Conventions (base path `/api/v1`,
formats, error envelope, CSRF, roles) are in the
[README](README.md#conventions-apply-to-every-endpoint).

## Rules

- **Two statuses per order, never inferred from each other (BR-12).** The
  order status tracks the delivery
  ([deliveries.md](deliveries.md#principles)). The payment status is new
  here. An order can be `delivered` with payment `pending_collection`
  (T-24), and no endpoint in this document changes an order status.
- **Cash only after unloading (BR-15).** A driver can record cash once the
  job's `unloading_completed_at` is set, and not on a cancelled order.
- **The driver never sets the amount due** (FR-040, BR-13). It is the
  order's frozen price snapshot total
  ([deliveries.md](deliveries.md#order-confirmation-endpoints)). The driver
  sends only the cash received.
- **One cash collection per order.** A repeat with the same amount and note
  returns the existing record (NFR-011); a different one is refused.
  (An outstanding balance is collected outside the app in the pilot,
  [decision 9](#decisions).)
- **Collection status:** `collected → awaiting_remittance → remitted →
  reconciled` (FR-041). Only forward, one step at a time, except that an
  administrator may receive a `collected` record directly (K4 lets them
  tick it). The table below names who may make each step.
- **The payment status changes when an administrator receives the cash**
  (`remitted`; technical lead, question 2, 2026-10-22). Recording and
  handing over change nothing on the order.
- **Every custody change is audited** (NFR-004): one `audit_logs` row in the
  same transaction as the change, with the actor, the collection id and the
  amounts. No phone numbers, names or notes in the audit metadata.
- **Money is integer kobo** in `*_minor_units` fields, a whole naira (a
  multiple of 100) on input, `BigInteger` in the database. Never a float.
- **Administrators** are the finance officers (FR-041: an administrator, not
  a separate role). Admin endpoints require an active `admin`; others get
  403 `forbidden`. Driver endpoints require the assigned `driver`; another
  driver's job is 404 `order_not_found`, as for the other driver job
  endpoints. Every `POST` needs `X-CSRF-Token`.

| Step | From | To | Who | Endpoint |
| --- | --- | --- | --- | --- |
| Record | none | `collected` | Assigned driver | `POST /driver/jobs/{reference}/cash-collection` |
| Hand over | `collected` | `awaiting_remittance` | The driver who holds it | `POST /driver/cash/handover` |
| Correct amount | `collected` or `awaiting_remittance` | unchanged | Administrator | `POST /admin/cash-collections/{id}/correction` |
| Receive | `collected` or `awaiting_remittance` | `remitted` | Administrator | `POST /admin/cash-remittances` |
| Reconcile | `remitted` | `reconciled` | Administrator | `POST /admin/cash-reconciliations` |

### The 6:00 PM rule

`remittance_due_at` is computed by the server from `collected_at` (FR-041,
SRS §10 "Cash collected after 6:00 PM"):

- collected before 18:00 Africa/Lagos: 18:00 the same Lagos day;
- collected at or after 18:00: 18:00 the next Lagos day. Every day counts;
  there are no closed days.

`overdue` is `true` while the collection is `collected` or
`awaiting_remittance` and the server's clock is at or past
`remittance_due_at`. It is a flag, not a status, and it blocks nothing in
the pilot ([decision 5](#decisions)). Clients show it as given and never
compute it.

### Payment status

Set on `orders` when the order is confirmed: `payment_method`
`pay_on_delivery` and `payment_status` `pending_collection` (F4). On receipt
of the order's collection (`remitted`), with `amount` the recorded amount and
`total` the snapshot total:

| Case | `payment_status` | `outstanding_balance_minor_units` | `overpaid_minor_units` |
| --- | --- | --- | --- |
| `amount == total` | `paid` | 0 | 0 |
| `0 < amount < total` | `partially_paid` | `total - amount` | 0 |
| `amount == 0` | `partially_paid` | `total` | 0 |
| `amount > total` | `paid` | 0 | `amount - total` (flagged for review, FR-041) |

The ₦0.00 row follows decision 4 (a valid collection with a note). An
outstanding balance is collected outside the app in the pilot (fallback F9,
[decision 9](#decisions)): the order stays `partially_paid`. The payment
statuses `unpaid`, `awaiting_verification`, `partially_refunded`,
`refunded` and `disputed` (FR-040) are not used in the pilot.

The recorded amount is what counts for the order. A counted difference at
receipt (the administrator counts more or less than the driver recorded) is
an exception for review and does not change any order's payment.

## Driver endpoints

### Job detail additions (`GET /driver/jobs/{reference}`)

Additive. `cash` is `null` until unloading is complete, and `null` on a job
that ended without unloading (K1 shows no Cash card).

```json
{
  "allowed_actions": ["record_cash"],
  "cash": {
    "amount_due_minor_units": 4500000,
    "amount_due_label": "manual_quote",
    "collection": null
  }
}
```

| Field | Rule |
| --- | --- |
| `allowed_actions` | Gains `record_cash` when `unloading_completed_at` is set, the order is not cancelled and no collection exists |
| `cash.amount_due_minor_units` | The order's price snapshot total. The only payment data the driver sees |
| `cash.amount_due_label` | `manual_quote` in the pilot (the snapshot's `manual` flag); the client shows "Manual quote" |
| `cash.collection` | `null`, or the driver's `CashCollection` for this order (below) |
| `cash.record_allowed` | `true` while `record_cash` is allowed ([amendment 2](#amendments-proposed-in-the-123-build)) |

`CashCollection` (driver view):

```json
{
  "id": "4d0b7a1e-9c2f-4e3a-8b5d-6f7a8b9c0d1e",
  "order_reference": "MO-7KQ2M9XH4T",
  "amount_minor_units": 4500000,
  "amount_due_minor_units": 4500000,
  "note": null,
  "status": "collected",
  "collected_at": "2026-10-27T13:15:00Z",
  "remittance_due_at": "2026-10-27T17:00:00Z",
  "overdue": false,
  "remitted_at": null,
  "received_by": null,
  "reconciled_at": null
}
```

`received_by` is `{ "id", "name" }` once received. The driver view never
carries the customer's details beyond what the job already shows.

### POST /driver/jobs/{reference}/cash-collection

Records the cash received (K1). Request:

```json
{ "amount_minor_units": 4000000, "note": "Customer paid ₦40,000 and will pay the rest to the office." }
```

| Field | Rule |
| --- | --- |
| `amount_minor_units` | Integer kobo, a whole naira (multiple of 100), `>= 0`. No upper limit. Otherwise 422 |
| `note` | Up to 500 characters. **Required** when the amount differs from the amount due, including ₦0.00 (decisions 3 and 4); otherwise optional. Missing when required is 422 (`loc` `["body", "note"]`) |

Success: **201** `CashCollection` (`status` `collected`). Effect, in one
transaction under the order lock: the collection row, a `cash_events` row
`cash_recorded` ([amendment 1](#amendments-proposed-in-the-123-build); no
status change) and an audit row. No SMS at this
step (decision 2).

A repeat after success: the same amount and note return **200** with the
existing record (a lost response is safe to retry, NFR-011); anything else is
409 `cash_already_recorded`.

| Status | `code` | When |
| --- | --- | --- |
| 404 | `order_not_found` | Unknown reference, or not this driver's job (also after reassignment) |
| 409 | `transition_requirements_unmet` | `details.missing` `["unloading_completed"]`: unloading not complete, or the order is cancelled |
| 409 | `cash_already_recorded` | A collection exists with another amount or note; `details.amount_minor_units` is the recorded amount (K1 "already recorded") |
| 422 | `validation_error` | Field rules above |

### GET /driver/cash

The signed-in driver's cash (K2). Collections that are `collected` or
`awaiting_remittance`, plus those received or reconciled in the last 7 days.

```json
{
  "on_hand_minor_units": 9250000,
  "ready_minor_units": 4750000,
  "remittance_due_at": "2026-10-27T17:00:00Z",
  "overdue": false,
  "collections": [ { "...": "CashCollection, newest first" } ]
}
```

| Field | Rule |
| --- | --- |
| `on_hand_minor_units` | Sum of the driver's `collected` and `awaiting_remittance` amounts |
| `ready_minor_units` | The `awaiting_remittance` part of it |
| `remittance_due_at` | The earliest due time among the cash on hand; `null` when none |
| `overdue` | `true` if any cash on hand is overdue |

### POST /driver/cash/handover

Moves the driver's chosen `collected` records to `awaiting_remittance` (K2,
decision 1). Request: `{ "collection_ids": ["4d0b7a1e-..."] }`, 1-50 ids.
Success: **200** with the `GET /driver/cash` body.

| Status | `code` | When |
| --- | --- | --- |
| 409 | `cash_collection_changed` | Any id is not this driver's or is no longer `collected`; `details.collection_ids` lists them; nothing changes |
| 422 | `validation_error` | Empty or more than 50 ids, duplicates |

The cash stays the driver's responsibility until an administrator receives
it; handing over moves no money.

## Admin endpoints

### GET /admin/cash?date=YYYY-MM-DD

The cash page for one Lagos operating day (K3); `date` defaults to today.

```json
{
  "date": "2026-10-27",
  "totals": {
    "recorded_minor_units": 18250000,
    "received_minor_units": 9000000,
    "reconciled_minor_units": 4500000,
    "with_drivers_minor_units": 9250000,
    "differences": 1
  },
  "drivers": [
    {
      "driver": { "id": "a7c2...", "name": "Sample Driver", "vehicle": "Tanker ENU-123-XY" },
      "held_minor_units": 9250000,
      "ready_minor_units": 4750000,
      "remittance_due_at": "2026-10-27T17:00:00Z",
      "overdue": false,
      "last_received_at": "2026-10-26T16:40:00Z"
    }
  ],
  "awaiting_reconciliation": [ { "...": "AdminCashCollection" } ]
}
```

| Field | Rule |
| --- | --- |
| `totals.recorded_minor_units` | Collections whose `collected_at` falls on `date` (Lagos) |
| `totals.received_minor_units`, `reconciled_minor_units` | By `remitted_at` and `reconciled_at` on `date` |
| `totals.with_drivers_minor_units` | Everything `collected` or `awaiting_remittance` now, any day |
| `totals.differences` | Counted differences recorded at receipt on `date` |
| `drivers` | Every driver with a collection on `date` or cash on hand now, overdue first, then by name |
| `awaiting_reconciliation` | Every `remitted` collection, any day, oldest first |

`AdminCashCollection` is the driver view plus `driver`, `customer` (`name`,
`phone` in E.164, as on the order detail), `payment_status`,
`outstanding_balance_minor_units`, `overpaid_minor_units`, `remittance_id`
and `reconciled_by`.

### GET /admin/cash/drivers/{driver_id}

The driver's cash on hand for K4: `driver`, and every `collected` and
`awaiting_remittance` `AdminCashCollection`. 404 `driver_not_found` for an
unknown driver.

### POST /admin/cash-collections/{id}/correction

Corrects the recorded amount of a collection before it is received (K4,
[decision 6](#decisions)): for a driver's typing mistake, since the payment
status and the payment SMS use the recorded amount. Request:

```json
{ "amount_minor_units": 4500000, "reason": "Driver typed ₦4,500; the envelope holds ₦45,000." }
```

| Field | Rule |
| --- | --- |
| `amount_minor_units` | Integer kobo, whole naira, `>= 0`, different from the current amount |
| `reason` | Required, 1-500 characters |

Effect, in one transaction: the amount changes; the first correction keeps
the driver's amount in `original_amount_minor_units`; `corrected_by`,
`corrected_at` and `correction_reason` record the latest one; a
`cash_events` row `cash_corrected` (with the old and new amounts and the
reason) and an audit row. The status does not change. The driver's note
stays as written.

Success: **200** `AdminCashCollection`, which gains
`original_amount_minor_units` (`null` when never corrected), `corrected_by`,
`corrected_at` and `correction_reason`. The driver view gains
`original_amount_minor_units` and `corrected_at`, so the driver sees that
the office changed it.

| Status | `code` | When |
| --- | --- | --- |
| 404 | `cash_collection_not_found` | Unknown id |
| 409 | `cash_collection_changed` | Not `collected` or `awaiting_remittance` now (received meanwhile); nothing changes |
| 422 | `validation_error` | Field rules above, including the same amount as now |

### POST /admin/cash-remittances

Receives cash from one driver (K4).

```json
{
  "driver_id": "a7c2...",
  "collection_ids": ["4d0b7a1e-...", "9e8f7a6b-..."],
  "counted_minor_units": 9050000,
  "note": "₦2,000 short. Driver says a customer gave a torn note."
}
```

| Field | Rule |
| --- | --- |
| `collection_ids` | 1-50 ids, each this driver's, each `collected` or `awaiting_remittance` |
| `counted_minor_units` | Integer kobo, whole naira, `>= 0` |
| `note` | Up to 500 characters. Required when `counted` differs from the sum of the recorded amounts |

Effect, in one transaction: each collection becomes `remitted` with
`remitted_at` and `received_by`; a `cash_remittances` row keeps the
recorded and counted totals, the difference and the note (it is the FR-041
exception record for a counted difference, [decision 1](#decisions)); each order's
payment status is set ([table above](#payment-status)); a `cash_events`
row `cash_received` per order and one audit row per collection. After the commit, a payment acknowledgment SMS goes to each
order's customer whose recorded amount is above zero (FR-041, FR-050); a
failure changes nothing.

Success: **201**

```json
{
  "id": "c1d2...",
  "driver": { "id": "a7c2...", "name": "Sample Driver" },
  "recorded_minor_units": 9250000,
  "counted_minor_units": 9050000,
  "difference_minor_units": -200000,
  "note": "₦2,000 short. Driver says a customer gave a torn note.",
  "received_by": { "id": "0b8f...", "name": "Sample Administrator" },
  "remitted_at": "2026-10-27T16:40:00Z",
  "orders": [
    { "reference": "MO-7KQ2M9XH4T", "payment_status": "paid", "outstanding_balance_minor_units": 0, "overpaid_minor_units": 0, "sms_status": "accepted" },
    { "reference": "MO-3HF8P2LQ6D", "payment_status": "partially_paid", "outstanding_balance_minor_units": 500000, "overpaid_minor_units": 0, "sms_status": "failed" }
  ]
}
```

`difference_minor_units` is counted minus recorded (negative = short).
`sms_status` is `accepted`, `failed` (K4 warning) or `null` when no SMS
was due (₦0.00). Template (no amounts beyond these, no water-quality words):

```text
MmiriOma: we received N45,000.00 cash for order MO-7KQ2M9XH4T. Help: +234 813 377 4902
MmiriOma: we received N40,000.00 cash for order MO-3HF8P2LQ6D. N5,000.00 is outstanding. Help: +234 813 377 4902
```

| Status | `code` | When |
| --- | --- | --- |
| 404 | `driver_not_found` | Unknown `driver_id` |
| 409 | `cash_collection_changed` | Any id is not this driver's or not receivable now (received meanwhile); `details.collection_ids`; nothing changes |
| 422 | `validation_error` | Field rules above |

A retry after a lost response gets 409 `cash_collection_changed`; the
client refreshes and shows the records as received.

### POST /admin/cash-reconciliations

Reconciles received collections (K5): the administrator has matched each to
its order. Request `{ "collection_ids": [...], "note": null }` (1-50 ids,
note up to 500). Each becomes `reconciled` with `reconciled_at` and
`reconciled_by`; a `cash_events` row `cash_reconciled` per order and an
audit row each. The payment status does not change here (decision 2).
Success: **200** `{ "collections": [AdminCashCollection] }`.

| Status | `code` | When |
| --- | --- | --- |
| 409 | `cash_collection_changed` | Any id is not `remitted` now; `details.collection_ids`; nothing changes |
| 422 | `validation_error` | Field rules above |

### AdminOrderDetail additions

Additive; `payment` is `null` on orders not yet confirmed.

```json
{
  "payment": {
    "method": "pay_on_delivery",
    "status": "partially_paid",
    "outstanding_balance_minor_units": 500000,
    "overpaid_minor_units": 0,
    "cash_collection": { "...": "AdminCashCollection, or null" },
    "remittance_difference": { "difference_minor_units": -200000, "note": "...", "remittance_id": "c1d2..." },
    "sms_status": "failed"
  }
}
```

`remittance_difference` is `null` when the remittance that took this
order's cash had no difference. The order history (H1) gains the events
`cash_recorded` (driver), `cash_handed_over` (driver), `cash_corrected`
(administrator, with the old and new amounts and the reason), `cash_received`
(administrator, with the resulting payment status) and `cash_reconciled`
(administrator), and the SMS outcome; none has a `from`/`to` status. Their
shape is [amendment 1](#amendments-proposed-in-the-123-build).

## Error codes added by this document

| Status | `code` | When |
| --- | --- | --- |
| 409 | `cash_already_recorded` | A different collection exists for this order |
| 409 | `cash_collection_changed` | A collection is not in the state the request needs |
| 404 | `driver_not_found` | Unknown driver id on an admin cash endpoint |
| 404 | `cash_collection_not_found` | Unknown collection id on the correction endpoint |

## Screen-to-endpoint table

| Screen | Element | Endpoint and fields |
| --- | --- | --- |
| K1 | Cash card, Record cash | `GET /driver/jobs/{reference}`: `cash`, `allowed_actions` `record_cash` |
| K1 | Record cash, states | `POST .../cash-collection`; 201; 200 repeat; 409 `cash_already_recorded`, `transition_requirements_unmet`; 404; 422 |
| K2 | My cash | `GET /driver/cash` |
| K2 | Hand over cash | `POST /driver/cash/handover`; 409 `cash_collection_changed` |
| K3 | Cash page | `GET /admin/cash?date=` |
| K4 | Correct amount | `POST /admin/cash-collections/{id}/correction`; 200; 404; 409; 422 |
| K4 | Receive cash | `GET /admin/cash/drivers/{driver_id}`; `POST /admin/cash-remittances`; 201 with `orders[].sms_status`; 409; 422 |
| K5 | Reconcile | `POST /admin/cash-reconciliations`; 409; 422 |
| K6, H1 | Payment card, history | `AdminOrderDetail.payment`; history events above |

## Data (for the build)

- `cash_collections` (SRS §5): `id`, `order_id` (unique), `driver_id`,
  `amount_minor_units` (`BigInteger`), `original_amount_minor_units`
  (`BigInteger`, nullable), `note`, `status` (CHECK on the four values),
  `collected_at`, `remittance_due_at`, `handed_over_at`, `corrected_by`,
  `corrected_at`, `correction_reason`, `remitted_at`, `received_by`,
  `remittance_id`, `reconciled_at`, `reconciled_by`,
  `reconciliation_note`; `UUIDPrimaryKeyMixin`, `TimestampMixin`. The build
  adds `assignment_id` (the job that unloaded), `payment_sms_status` and
  `payment_sms_attempted_at`.
- `cash_events` (amendment 1): `collection_id`, `order_id`, `kind`,
  `actor_id`, `occurred_at`, `amount_minor_units`,
  `previous_amount_minor_units`, `note`, `payment_status`,
  `outstanding_balance_minor_units`. Not `order_events`, whose rows always
  carry a `to_status`.
- `cash_remittances`: `id`, `driver_id`, `recorded_minor_units`,
  `counted_minor_units`, `difference_minor_units`, `note`, `received_by`,
  `remitted_at`.
- `orders` gains `payment_method`, `payment_status` (CHECK on the FR-040
  values), `outstanding_balance_minor_units` and `overpaid_minor_units`
  (`BigInteger`, default 0). The migration sets `pay_on_delivery` and
  `pending_collection` on orders that are `confirmed` or later and not
  `cancelled`; other orders stay `NULL` until confirmed
  ([decision 8](#decisions)). The downgrade drops the columns. It is a data
  migration: reviewed and tested (`upgrade`, `downgrade -1`, `check`) before
  merge.
- A new `payments` module (`backend/app/modules/payments/`) owns these; it
  reads the price snapshot and the job state through service functions.

## Amendments proposed in the #123 build

Status: **agreed** (G3) on 2026-10-23 by @nnamdi-security (technical lead,
contract owner). Proposed in the #123 build, additive, and built in PR #135,
which merged before this agreement was recorded; the backend review by
@chidimmamogbo is on that PR.

1. **Cash history entries** (raised by @Daveoski on #123). With
   `?include=holds` only (the agreed H1 history without `include` is
   unchanged, so #62's client still reads `to_status` on every entry), the
   history adds one entry per cash step, newest first among the others:
   - `kind`: `cash_recorded`, `cash_handed_over`, `cash_corrected`,
     `cash_received` or `cash_reconciled`; `from_status`, `to_status`,
     `reason_code`, `assignment`, `confirmation` and `hold` are `null`;
   - `actor`: the driver or administrator; `created_at`: when the step was
     taken; `note`: the driver's note, the correction reason, the handover's
     difference note or the reconciliation note;
   - `cash` (null on every other entry): `collection_id`,
     `amount_minor_units` (after the step), `previous_amount_minor_units`
     (`cash_corrected` only), `payment_status` and
     `outstanding_balance_minor_units` (`cash_received` only), `sms_status`
     (`cash_received` only).

   Example: [admin-order-history-cash.json](examples/admin-order-history-cash.json).
   The steps are stored in `cash_events`, not `order_events` (which always
   carry a `to_status`).
2. **The Cash card on delivered jobs.** A delivered job's assignment is
   `completed`, and `GET /driver/jobs/{reference}` is then 404
   ([deliveries.md](deliveries.md)), so K1's "Delivered" card could not be
   shown. Therefore:
   - `cash` is also on `DriverJobSummary` (the "My jobs" list, including
     `done`), and every job response carries it;
   - `cash` gains `record_allowed`, the summary's only signal (the detail
     still lists `record_cash` in `allowed_actions`);
   - `POST .../cash-collection` accepts the driver whose live **or finished**
     job unloaded the water; declined, withdrawn and expired jobs stay 404.
3. **Smaller points:**
   - `price_recorded` is a new `details.missing` name (409
     `transition_requirements_unmet`) for an order with no price snapshot
     (confirmed by script before #113), as the amount due is unknown;
   - `driver_id` is the driver's account id (`users.id`);
   - K3's `driver.vehicle` is the vehicle type, the only vehicle text stored;
   - `AdminCashCollection` also carries `handed_over_at`, `corrected_by`,
     `correction_reason` and `payment_sms_status`;
   - `amount_due_label` is `quote` for a server quote, which #21 brings to
     the pilot ([order-details-and-price.md](order-details-and-price.md#driver-cash-label)).

Examples for every cash endpoint are in [examples/](examples/README.md), and
`backend/tests/test_payments_api.py` checks them against the response
schemas.

## Decisions

Prompt 12 questions 1-4 were decided by the technical lead on 2026-10-22.
The rest were decided on 2026-10-22 by the technical lead, with
@Cloudcrackamara reviewing the design:

1. **A counted difference is stored on the `cash_remittances` row**
   (difference, note, who received it and when, audited). It is the FR-041
   exception record; `order_exceptions` is not used for it, because a
   handover covers several orders. K3 counts it and K6 shows it.
2. **An overpayment is a flag only:** `overpaid_minor_units`, shown as
   "More than due: review" in K5 and K6. No `order_exceptions` row. Any
   refund is recorded outside the app (F7).
3. (Prompt 12, question 1) The driver hands over with "Hand over cash".
4. (Prompt 12, questions 2-4) The payment status and SMS change on receipt;
   a different amount needs the driver's note; ₦0.00 is a valid collection.
5. **Overdue cash** shows an alert and blocks nothing in the pilot.
6. **An administrator can correct the recorded amount before receiving
   it,** with a required reason, audited, the original amount kept
   ([correction endpoint](#post-admincash-collectionsidcorrection)).
7. **The same administrator may receive and reconcile.**
8. **Existing orders:** the migration sets the payment fields on orders
   `confirmed` or later and not `cancelled`; others stay `NULL` until
   confirmed.
9. **An outstanding balance is collected outside the app in the pilot**
   (fallback F9 in the pilot plan);
   the order stays `partially_paid` with its balance shown.

No open questions remain.
