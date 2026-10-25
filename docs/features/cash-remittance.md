# Cash collection, remittance and reconciliation

Issues: #98 (design and contract), #123 (backend), #124 (driver screens),
#125 (admin screens) · Requirements: FR-040 (pay on delivery only, F4),
FR-041 (cash part), FR-050 (payment acknowledgment), BR-09, BR-12, BR-15,
NFR-004, NFR-011, NFR-012, NFR-020, NFR-021, NFR-022 · Acceptance tests:
T-14, T-21, T-24 · Contract: [payments.md](../api/payments.md) (agreed G3,
2026-10-22; amendments 1-3 agreed 2026-10-23) · Design:
[cash-remittance.md](../design/cash-remittance.md) (approved G2)

This document covers the backend (#123) and the administrator's screens
K3-K5 (#125). The driver screens are #124 (K1 and K2 in
[driver-cash.md](driver-cash.md)). Each section has a backend part
and an admin screens part.

## 1. Overview and purpose

### Backend (#123)

The pilot takes cash on delivery only (fallback F4). The cash has to be
traced from the customer's hand to the office:

- the driver records the cash after unloading and holds it;
- before 6:00 pm Lagos time the driver hands it to an administrator acting
  as finance officer;
- the administrator receives it, which sets the order's payment status and
  texts the customer;
- later the administrator reconciles it against the order.

Each step is audited (NFR-004). None of them changes the order status,
which tracks the delivery only (BR-12). An order can be `delivered` with
payment `pending_collection` (T-24).

### Admin screens (#125)

The pilot takes cash on delivery only. A driver records the cash after
unloading and hands it over; an administrator **receives** it, which sets
each order's payment status and sends the payment SMS, and later
**reconciles** it. This document covers the administrator's screens:

- **K3 Cash page** (sidebar "Cash"): one Lagos day's figures, the drivers
  holding or recording cash, and every received record not yet reconciled.
- **K4 Receive cash**: tick the driver's records, count the cash, confirm;
  "Correct amount" before receipt.
- **K5 Reconcile**: one record or the ticked ones.
- **K6 Payment card** on the order detail, beside the confirmed summary:
  method, payment status, amount due, the cash line with its custody step,
  the driver's note, the payment SMS outcome, and a banner for a difference
  counted at receipt.
- **History lines**: each cash step with its amount, a correction's old and
  new amounts, and on receipt the payment status and SMS outcome
  (amendment 1).

The screens call the backend endpoints below, or the mock source with
`VITE_ORDERS_SOURCE=mock`.

## 2. Feature workflow

### Backend (#123)

```text
confirm order (#113) ─> orders.payment_method = pay_on_delivery
                        orders.payment_status = pending_collection
unloading complete (driver) ─> job's Cash card: amount due, record_cash
POST /driver/jobs/{ref}/cash-collection        none -> collected
POST /driver/cash/handover                     collected -> awaiting_remittance
POST /admin/cash-collections/{id}/correction   amount fixed, status unchanged (before receipt only)
POST /admin/cash-remittances                   -> remitted
   one transaction: payment status per order, remittance row (counted difference), events, audit
   after commit:    payment SMS to each customer whose amount is above ₦0
POST /admin/cash-reconciliations               remitted -> reconciled (payment status unchanged)
```

Reads: the job's `cash` on every driver job response, `GET /driver/cash`
(K2), `GET /admin/cash?date=` (K3), `GET /admin/cash/drivers/{id}` (K4),
`AdminOrderDetail.payment` (K6) and the history with `?include=holds`.

### Admin screens (#125)

```
K3 /admin/cash?date=YYYY-MM-DD        GET /admin/cash?date=   (default today, Lagos)
  figures: recorded, received, reconciled, still with drivers, differences
  Drivers (overdue first) ── Receive cash ─> K4 side sheet
       GET /admin/cash/drivers/{id}   (refetched on open)
       tick records (ready ones ticked) ─> total recorded
       Cash counted ─> matches | ₦… short | ₦… over (+ required note)
       Correct amount ─> dialog (amount ≠ current, reason) ─> POST .../correction
       Confirm received ─> "Confirm received" dialog ─> POST /admin/cash-remittances
          201 ─> per order: payment status, SMS sent / not sent (+ warning),
                 counted difference saved as an exception ─> Done ─> toast
  Received, not reconciled ── Reconcile / Reconcile selected ─> K5 dialog
       per record: due, recorded, received, payment status (flagged if it differs)
       Reconcile ─> "Reconcile N records?" ─> POST /admin/cash-reconciliations ─> toast
Errors (by code): 409 cash_collection_changed ─> "This cash record has changed." Refresh
                  422 ─> under the field   csrf_failed ─> Reload page
                  no connection ─> the server's message, everything kept
```

Every cash write marks all cash queries stale, so the figures and lists
reload.

## 3. Important files

### Backend (#123)

| File | Responsibility |
| --- | --- |
| `backend/app/modules/payments/models.py` | `cash_collections`, `cash_remittances`, `cash_events`; status, SMS and event kinds |
| `backend/app/modules/payments/service.py` | Every rule: the 6:00 pm deadline, the payment status table, the SMS text, record, handover, correction, receipt, reconciliation, the cash page, the payment card and the history. The module docstring lists the rules |
| `backend/app/modules/payments/schemas.py` | Request bodies (whole naira, id lists) and every response shape |
| `backend/app/modules/payments/router.py` | The eight endpoints; driver and admin roles |
| `backend/app/modules/orders/models.py` | `PaymentMethod`, `PaymentStatus` and the four payment columns on `orders` |
| `backend/app/modules/confirmation/service.py` | Sets `pay_on_delivery` / `pending_collection` when an order is confirmed |
| `backend/app/modules/deliveries/service.py` | `JobAction.RECORD_CASH`; `drivers_job_on_order` (the driver's live or finished job and its unloading time) |
| `backend/app/modules/deliveries/router.py`, `schemas.py` | `cash` on every job response; `record_cash` in `allowed_actions` |
| `backend/app/modules/deliveries/holds.py`, `admin_router.py`, `admin_schemas.py` | `payment` on the admin detail; cash entries in the history with `include=holds` |
| `backend/app/modules/dispatch/schemas.py`, `router.py`, `service.py` | `AdminOrderDetail.payment`; `vehicles_by_driver` for the cash page |
| `backend/alembic/versions/20261023_0013_add_cash_collections.py` | The tables, the order columns and the data step |

### Admin screens (#125)

| File | Responsibility |
| --- | --- |
| `frontend/src/lib/api/adminCash.ts` | Types, Zod schemas and calls for the five admin cash endpoints |
| `frontend/src/lib/money.ts` | `formatNaira` (₦, commas, two decimals) and `nairaInputToKobo` (whole naira to integer kobo) |
| `frontend/src/features/admin-cash/CashPage.tsx` | K3, the day picker (`?date=`), the toasts; opens K4 and K5 |
| `frontend/src/features/admin-cash/ReceiveCashSheet.tsx` | K4: records, count, difference and note, confirm, received summary; the Correct amount dialog |
| `frontend/src/features/admin-cash/ReconcileDialog.tsx` | K5 and its confirm step |
| `frontend/src/features/admin-cash/parts.tsx` | Error banner, status and overdue chips, figure tile, ₦ field, sample-data notice |
| `frontend/src/features/admin-cash/labels.ts` | The design's wording, the difference line, error kinds, server field errors |
| `frontend/src/features/admin-cash/useCash.ts` | TanStack Query hooks and keys |
| `frontend/src/features/admin-cash/source.ts`, `apiCashSource.ts`, `mockCash.ts` | Data source interface, the real API, and the mock (`VITE_ORDERS_SOURCE=mock`) |
| `frontend/src/components/layout/AdminShell.tsx` | "Cash" in the staff navigation |
| `frontend/src/components/ui/Dialog.tsx` | `side`: the 720 px side sheet (same change as #126) |
| `frontend/src/features/admin-cash/PaymentCard.tsx` | K6, on the admin order detail |
| `frontend/src/lib/api/adminDispatch.ts` | `payment` on `AdminOrderDetail` and `cash` on history entries (Zod; missing reads as `null`) |
| `frontend/src/features/admin-dispatch/labels.ts`, `OrderHistory.tsx` | `cashEventLines` and the payment status words; the cash entries' detail lines |
| `frontend/src/features/admin-orders/mockPayments.ts` | The mock order detail's `payment`, one fixture per K6 state |

## 4. Database models and relationships

- `cash_collections`: one per order (UNIQUE `order_id`). It records:
  - the driver (`users`) and the job that unloaded the water (`assignments`);
  - the amount in kobo, whole naira, ₦0 or more (CHECK), and the driver's
    original amount when corrected;
  - the custody status (CHECK on the four values), the deadline, who
    received and reconciled it and when, and the payment SMS outcome.
  - Two CHECKs tie the received and reconciled fields to the status, so a
    `remitted` row always says who received it and in which handover.
- `cash_remittances`: one per handover. It keeps:
  - the driver and the receiving administrator;
  - the recorded and counted totals, and their difference (CHECK: counted
    minus recorded), with the note.
  - A non-zero difference is the FR-041 exception record (contract
    decision 1).
- `cash_events`: one row per step (`kind`, actor, time, amount after the
  step, previous amount for a correction, payment status and balance for a
  receipt, note). The history reads it.
- `orders` gains `payment_method`, `payment_status` (FR-040 values, CHECK),
  `outstanding_balance_minor_units` and `overpaid_minor_units` (`BigInteger`,
  default 0, never negative).

All foreign keys are RESTRICT. Money is `BigInteger` kobo throughout.

The admin screens add no tables.

## 5. API endpoints and request/response behavior

### Backend (#123)

| Method | Path | Who | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | `/driver/jobs/{reference}/cash-collection` | Driver | 201 `CashCollection`; 200 for the same amount and note again | 404 `order_not_found`; 409 `cash_already_recorded`, `transition_requirements_unmet` (`unloading_completed`, `price_recorded`); 422 |
| GET | `/driver/cash` | Driver | 200 | |
| POST | `/driver/cash/handover` | Driver | 200 (same body as GET) | 409 `cash_collection_changed`; 422 |
| GET | `/admin/cash?date=YYYY-MM-DD` | Admin | 200 (today in Lagos by default) | 422 |
| GET | `/admin/cash/drivers/{driver_id}` | Admin | 200 | 404 `driver_not_found` |
| POST | `/admin/cash-collections/{id}/correction` | Admin | 200 `AdminCashCollection` | 404 `cash_collection_not_found`; 409 `cash_collection_changed`; 422 |
| POST | `/admin/cash-remittances` | Admin | 201 with each order's payment status and SMS status | 404 `driver_not_found`; 409 `cash_collection_changed`; 422 |
| POST | `/admin/cash-reconciliations` | Admin | 200 | 409 `cash_collection_changed`; 422 |

Every driver job response (`GET /driver/jobs`, the detail and every step)
carries `cash` (`null` before unloading). `AdminOrderDetail` carries
`payment` (`null` before confirmation). Shapes and examples are in
[payments.md](../api/payments.md) and `docs/api/examples/`.

### Admin screens (#125)

| Screen | Method and path | Success | Errors handled |
| --- | --- | --- | --- |
| K3 | `GET /admin/cash?date=` | 200 `CashDay` | no connection |
| K4 | `GET /admin/cash/drivers/{driver_id}` | 200 `{driver, collections}` | 404 `driver_not_found` |
| K4 | `POST /admin/cash-collections/{id}/correction` | 200 `AdminCashCollection` | 404 `cash_collection_not_found`, 409 `cash_collection_changed`, 422, 403 `csrf_failed` |
| K4 | `POST /admin/cash-remittances` | 201 `Remittance` | 404 `driver_not_found`, 409 `cash_collection_changed`, 422, 403 `csrf_failed` |
| K5 | `POST /admin/cash-reconciliations` | 200 `{collections}` | 409 `cash_collection_changed`, 422, 403 `csrf_failed` |

Shapes and rules are in [payments.md](../api/payments.md#admin-endpoints).
Responses are checked with Zod; an unknown status or a missing field is
`invalid_response`, never shown as a wrong state. Correction fields
(`original_amount_minor_units`, `corrected_by`, `corrected_at`,
`correction_reason`) read as `null` when absent.

## 6. Important business rules

### Backend (#123)

- **After unloading only (BR-15).** Cash is recorded only once the job's
  unloading is recorded complete, never on a cancelled order. The driver
  must be the one whose job unloaded it. That job may already have ended,
  since a delivered job's detail is 404 (amendment 2).
- **The amount due is never the driver's** (FR-040, BR-13). It is the price
  snapshot total; the driver types only the cash received. A different
  amount, including ₦0, needs a note (decisions 3 and 4).
- **6:00 pm rule (FR-041).** Cash recorded before 18:00 Africa/Lagos is due
  at 18:00 that day; at or after 18:00, at 18:00 the next day. Every day
  counts. Overdue is a flag computed on read and blocks nothing (decision 5).
- **Payment status on receipt** (decision 2):
  - equal is `paid`;
  - less, including ₦0, is `partially_paid` with the rest outstanding,
    which is collected outside the app (F9);
  - more is `paid` with `overpaid_minor_units` flagged; any refund is
    handled outside the app (F7).
  - It is worked out from the **recorded** amount; a counted difference
    stays on the remittance and changes no order.
- **Corrections** (decision 6): administrators only, before receipt, with a
  reason; the driver's original amount is kept and shown.
- **Payment SMS** (FR-041, FR-050): sent after the receipt is committed, to
  the customer's account phone, for amounts above ₦0. "N" is used instead
  of "₦" so it stays a GSM-7 message. A refused SMS is stored as `failed`
  and changes nothing.
- **Same administrator** may receive and reconcile (decision 7).
- **Existing orders** (decision 8): the migration gives orders `confirmed`
  or later, except `cancelled`, `pay_on_delivery` / `pending_collection`.

### Admin screens (#125)

- **Money is integer kobo** (SRS §5): staff type whole naira; the client
  sends kobo and formats ₦ for display only.
- **Nothing is worked out on the client** (BR-12): the figures, the
  overdue flag, the hand-over time, the payment status and the SMS outcome
  all come from the server. The only client arithmetic is the ticked total
  and the counted difference shown before sending.
- **Receiving sets the payment status and sends the SMS** (decision 2); the
  sheet then shows the server's result per order. An SMS not sent is a
  warning; the payment stays recorded (FR-050).
- **A counted difference needs a note** and is saved as an exception on the
  remittance; it never changes the driver's records or any order's payment
  (decision 1).
- **Correct amount** is offered only before receipt, with a required reason;
  the driver's original amount stays visible (decision 6).
- **Reconciling never changes a payment status** (decision 2); the confirm
  step says so.
- **Overdue blocks nothing** (decision 5). The same administrator may
  receive and reconcile (decision 7).
- **Sample data is labelled** while the mock source is used (BR-09).

## 7. Authentication and authorization requirements

### Backend (#123)

Driver endpoints need a signed-in driver (`CurrentDriver`); admin endpoints
an administrator (`CurrentAdmin`); everyone else gets 403 `forbidden`.
Every `POST` needs the CSRF header. A driver sees only their own cash; another
driver's job is 404 `order_not_found` (T-07), and another driver's record in
a handover is 409 `cash_collection_changed`. Audit rows (NFR-004) are written
for `cash_recorded`, `cash_handed_over`, `cash_corrected`, `cash_received`,
`cash_remittance_recorded` and `cash_reconciled`, with ids, amounts and
statuses only, never names, phones or notes.

### Admin screens (#125)

The page is inside the staff app (`AppGate app="staff"`, role `admin`);
every endpoint requires an active admin. `POST`s send `X-CSRF-Token`.

## 8. Error handling and edge cases

### Backend (#123)

- **Repeats** (NFR-011): the same amount and note again return 200 with the
  first record, also after the job ended or the amount was corrected;
  anything else is 409 `cash_already_recorded` with the recorded amount. A
  second receipt or reconciliation of the same record is 409.
- **Concurrency:** receipts lock the orders first, then the collections, so
  two administrators receiving the same cash produce one receipt and one
  409 (integration test).
- **Partial requests:** any id that cannot move makes the whole request 409
  with the ids listed; nothing changes.
- **Order without a price snapshot** (confirmed by script before #113): 409
  `transition_requirements_unmet` with `price_recorded` (amendment 3).
- **SMS provider down:** the receipt stands; `sms_status` is `failed` and
  K4 and K6 show the warning.

### Admin screens (#125)

| Case | Shown |
| --- | --- |
| Day fails to load | The server's message with Retry |
| No cash on the day | "No cash records for <day>." |
| Driver holds no cash | "No cash to receive." in K4; "Receive cash" off on K3 when nothing is held |
| Records received or reconciled meanwhile (409) | "This cash record has changed." with Refresh; typed values kept; ticks for records no longer on hand drop out |
| Field refused (422) | The server's message under the field |
| No connection | The server's message; everything kept; send again |
| Security check failed | The server's message with "Reload page" |
| Counted differs, no note | "Add a note to say what happened." (before sending) |
| ₦0 recorded for an order | No SMS: "No payment SMS: nothing was received for this order." |

## 9. Testing instructions

### Backend (#123)

```bash
cd backend && source .venv/bin/activate
ruff check . && ruff format --check .
pytest tests/test_payments.py tests/test_payments_api.py
# With a separate test database (LOG.md, 2026-10-20), after alembic upgrade head:
TEST_DATABASE_URL=... pytest tests/test_payments_integration.py
```

- `test_payments.py`: the 6:00 pm rule (including exactly 18:00, UTC versus
  Lagos and weekends), overdue, the payment status table, the SMS wording,
  `record_cash` placement, and every request field rule (kobo, floats,
  strings, id lists).
- `test_payments_api.py` (no database): roles for every endpoint, CSRF,
  validation, 201 and 200, arguments passed, the job's Cash card, the cash
  history merged by time, and every example against the response schemas.
- `test_payments_integration.py`:
  - the whole lifecycle with every refusal, T-24 and T-21;
  - part paid, nothing paid and overpaid with a refused SMS;
  - cancelled and unpriced orders;
  - the 6:00 pm rule with the cash page;
  - two administrators receiving at once.
- Migration: `alembic upgrade head`, `alembic check`, `alembic downgrade -1`,
  `upgrade head` again, and the data step checked on sample orders, on a
  throwaway PostGIS container (2026-10-23).

### Admin screens (#125)

```bash
cd frontend
npm run lint && npm run typecheck && npm test && npm run build
```

- `src/lib/money.test.ts`, `src/lib/api/adminCash.test.ts`: formatting and
  parsing; every call's path, method and body; unknown status rejected.
- `src/features/admin-cash/labels.test.ts`: status and payment wording,
  the difference line, error kinds, field errors.
- `src/features/admin-cash/cash.test.tsx`: K3 figures, order and empty
  day; K4 receive with a short count, note, confirm, per-order status and
  SMS warning; matches; correction; 409, 422, no connection, security; K5
  one and several records, 409. Values are set with one change event, not
  typed key by key (LOG.md, 2026-10-23).
- `src/lib/api/adminCash.test.ts` and `adminDispatch.test.ts` also parse
  the backend's samples: the cash day, driver cash, remittance,
  reconciliation, the order detail's `payment` and the cash history.
- `src/features/admin-cash/paymentCard.test.tsx`: K6 for delivered with no
  cash (T-24), part paid with the SMS not sent, reconciled with a
  difference at receipt, recorded and not received, and no card before
  confirmation.
- `src/features/admin-dispatch/logic.test.ts`, `dispatch.test.tsx`: the
  cash history lines, and the backend's history sample rendered.
- By hand: `npm run dev` with `VITE_ORDERS_SOURCE=mock`, open
  `/admin/cash`.

**End-to-end run (2026-10-23, #125, Daveoski + agent).** On a throwaway
PostGIS database (migrations to `0013`, the demo seed, a vehicle and a water
source added with the dispatch and sources command lines), against the
local API, with no database edits:

1. The dispatcher confirmed demo order MO-QSYYHGZ5V0 with a ₦45,000.00
   manual quote and offered it to the demo driver.
2. The driver went from accept to unloading complete, then recorded
   ₦40,000.00 with a note and handed it over.
3. The admin cash page (K3) listed the driver with ₦40,000.00 ready, and the
   driver's cash (K4) showed the record ready to hand over.
4. Receiving with ₦38,000.00 counted:
   - without a note it was refused (422); with one it was accepted;
   - the order became part paid with ₦5,000.00 outstanding, because the
     recorded amount counts, not the counted one;
   - the -₦2,000.00 difference was stored and the SMS outcome reported;
   - receiving again was refused with 409 `cash_collection_changed`.
5. Reconciling (K5) left the payment status unchanged.
6. The order detail's `payment` (K6) read part paid, cash reconciled,
   difference -₦2,000.00, while the order stayed `unloading` (BR-12, T-24).
   The history held the four cash steps, newest first.

Every saved admin response (cash day before and after receipt, driver cash,
remittance, reconciliation, order detail, history) parsed with the screens'
Zod schemas, and `cashEventLines` gave "Payment status: Part paid ·
₦5,000.00 outstanding". The browser screens were not clicked through in this
run (no browser in that session); see the next run.

**Browser click-through (2026-10-24, #125, Daveoski + agent).** The admin
screens K3-K6 against the real backend, in the desktop app's browser at
800 × 600, with the API and Vite dev server from `main` (`14340ca`) and a
throwaway PostGIS container (migrations to `0013`, the demo seed, a vehicle
and a simulated water source activated for potable water). Two demo orders
were confirmed (manual quotes ₦45,000.00 and ₦30,000.00), assigned, driven
to delivered, and their cash recorded (₦40,000.00 with the driver's note and
₦30,000.00) and handed over through the API. Everything after that was
clicked, with no database edits:

1. **K3** listed the Demo Driver with ₦70,000.00 ready to hand over and the
   6:00 pm hand-over time.
2. **K4** opened with both records ticked, the driver's note and a
   ₦70,000.00 total.
3. **Correct amount:** the same amount with no reason showed "Enter an
   amount different from the recorded one." and "Give a reason for the
   correction."; ₦29,000.00 with a reason was saved, the record showed
   "Corrected from ₦30,000.00 by Demo Dispatcher" with the reason, and the
   total became ₦69,000.00.
4. **Receive:** ₦68,000.00 counted showed "₦1,000.00 short" and, without a
   note, "Add a note to say what happened."; with a note the "Confirm
   received" dialog named ₦68,000.00 and the driver. The result listed both
   orders part paid (₦5,000.00 and ₦1,000.00 outstanding: the recorded
   amounts count), "Payment SMS sent" for each, and the difference saved as
   an exception. Done showed the toast; K3 reloaded by itself (received
   ₦69,000.00, still with drivers ₦0.00, differences 1) and "Receive cash"
   was disabled.
5. **K5, one record:** MO-SJ50AB48M0's dialog showed due, recorded, received
   and part paid; "Reconcile this record?", then the toast, and reconciled
   became ₦40,000.00.
6. **K5, changed meanwhile:** with MO-PHE9QJHKBF reconciled through the API
   behind the open page, "Reconcile selected (1)" got 409 and showed "This
   cash record has changed." with Refresh and Reconcile disabled. Refresh
   closed the dialog and reloaded: reconciled ₦69,000.00, nothing left.
7. **K6 and history** on both orders: delivered, part paid with the
   outstanding balance, "Difference at receipt: ₦1,000.00 short" with the
   note, the cash reconciled, the correction (MO-PHE9QJHKBF), "Payment SMS
   sent", and the history lines for recorded, handed over, corrected,
   received (with the payment status) and reconciled, newest first.

Not clicked in this run (covered by `cash.test.tsx`): an over count, a
422 under a field, no connection, the security check, "Reconcile selected"
with several records, and an SMS that was not sent.

## 10. Known limitations

### Backend (#123)

- The driver screens are #124 (K1 and K2, [driver-cash.md](driver-cash.md)).
- One collection per order; an outstanding balance is collected outside the
  app (F9) and the order stays `partially_paid`.
- Overpayments are flagged only; refunds are outside the app (F7).
- Overdue cash alerts but blocks nothing; there is no reminder SMS.
- The "My jobs" list shows finished jobs only on the day they ended, so cash
  for a job delivered on an earlier day can be recorded only through the
  API, not from the list. It should not happen in practice: drivers record
  cash at the door.
- The cash page names a driver's vehicle by its type; no registration
  number is stored.

### Admin screens (#125)

- **T-14 and T-21 end to end:** run through the API on 2026-10-23, and the
  admin screens clicked through in a browser against the real backend on
  2026-10-24 (see Testing instructions). The driver's steps in that
  click-through went through the API; K1 and K2 were clicked through in
  #124's run.
- **A remittance's counted difference shows in full on every order it
  took**, as the contract says (`remittance_difference`). Two orders received
  together with ₦1,000.00 short each show "Difference at receipt: ₦1,000.00
  short", which can read as ₦2,000.00 in total.
- **K3's "Received, not reconciled" empty text** is "Everything received has
  been reconciled." even when nothing has been received that day.
- The K6 card shows a payment method other than `pay_on_delivery` as the
  server's code; the pilot has no other method (F4).
- `lib/money.ts` duplicates the naira helpers in #126's
  `admin-confirmation/logic.ts`; switch those to it once both are merged.
