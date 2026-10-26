# Order confirmation

Requirements: FR-012, FR-022 (manual fallback), FR-024, FR-027, FR-030,
FR-033 (rows 26 and 7), FR-050, BR-02, NFR-004, NFR-012 · Acceptance tests:
T-04, T-09, T-14 · Contract:
[deliveries.md](../api/deliveries.md#order-confirmation-endpoints) (agreed
G3, PR #111) · Design:
[admin-order-confirmation.md](../design/admin-order-confirmation.md)
(approved G2) · Issues: #113 (backend), #114 (screens), from #87 · Pilot fallbacks F2-F5
([pilot plan](../process/pilot-plan.md#agreed-manual-fallbacks)) · Source
records: [water-sources.md](water-sources.md) (#112)

## 1. Overview and purpose

Before a driver can be offered an order, a dispatcher confirms it. For the
pilot, the app does not calculate prices or offer delivery slots, so the
dispatcher phones the customer and agrees:

- a **manual quote**, the total in naira (F2), frozen on the order (FR-024);
- a **delivery window** (F3);
- a **water category**, and a **source** that may serve it (FR-012).

Payment is cash on delivery after unloading (F4); there is no cancellation or
redelivery charge (F5). The order becomes **Confirmed**, the customer gets a
confirmation SMS (FR-050), and the dispatcher can then assign a driver. The
backend is #113; the admin screens (C0 card, C1 sheet, C2 summary, the
history line) are #114.

**Quoted orders** (#21): an order placed with a server quote
([pricing.md](pricing.md)) is already `awaiting_confirmation`. The
dispatcher confirms it the same way but enters no total: the snapshot copies
the quote's total (not manual), and only row 7 runs ([order details
question 14](../api/order-details-and-price.md#open-questions)).

## 2. Feature workflow

```
GET  /admin/orders/{ref}/confirmation-options
  every active category → every source, eligible first, with reasons[]
  (shared check, sources.eligibility; never the cost per litre)

POST /admin/orders/{ref}/transition  {to: "confirmed", ...}
  confirmation.confirm_order
    lock order ─> status must be expected_status          else 409 invalid_order_transition
                  (quote_requested, or awaiting_confirmation with a quote)
    ─> field checks (category active, source exists,
       window not past, agreed_at not future / not before the order;
       quoted order: the quote's category, a source of the Tanker
       customer's kind)                                     else 422 (all at once)
    ─> row 7 checks: phone_verified, source_eligible, delivery_window_set
                                                       else 409 transition_requirements_unmet
    ─> one transaction:
         event quote_requested → awaiting_confirmation  (row 26, manual_quote, at t;
                                                          skipped for a quoted order)
         order: category, source, window
         event awaiting_confirmation → confirmed        (row 7, note, at t + 1 µs)
         order_price_snapshots row (linked to the row 7 event; manual total,
                                    or the quote's total with is_manual false)
         audit_logs "order_confirmed"
       COMMIT
    ─> confirmation SMS ─> orders.confirmation_sms_status accepted | not_accepted
  ─> 200 AdminOrderDetail (+ water_category, source, delivery_window, price, confirmation_sms)
```

The detail (`GET /admin/orders/{ref}`, and every endpoint that returns
`AdminOrderDetail`, including assign) carries the confirmation fields; the
history adds `confirmation` on the row 7 entry.

On the admin order detail (#114):

```
Request received, phone verified ── C0 "Confirmation" card ── Confirm order
  ─> C1 side sheet (720 px; full screen on phones), options refetched on open
       1 Order  2 Checks  3 Category  4 Source  5 Window  6 Manual quote
       7 Customer agreement (how, when, tick box)  8 Note
     "Confirm order" enabled once every section is complete
     ─> client checks (window order, whole naira, note for "other") ─> error summary
     ─> "Confirm this order?" dialog (summary) ─> one POST
          200 ─> sheet closes, toast "MO-… confirmed for <window>.",
                 C2 summary above the dispatch card, Assign driver
          409 transition_requirements_unmet ─> missing items listed;
                 source_eligible: options refetched, source choice cleared
          409 invalid_order_transition ─> "This order has changed." Refresh
          422 ─> errors under their fields + summary   403 csrf ─> Reload page
          no connection ─> message, everything kept
Confirmed and later ── C2 "Confirmed" card (+ SMS-not-sent / source warnings)
History ── "Manual quote agreed with the customer" (row 26), then the
           row 7 entry with "category · source · window · Manual quote ₦…"
```

## 3. Important files

| File | Responsibility |
| --- | --- |
| `backend/app/modules/confirmation/service.py` | Options, `confirm_order`, the SMS text and sending, the detail view and history lines |
| `backend/app/modules/confirmation/schemas.py` | `ConfirmRequest` (validation), `ConfirmationOptions`, `OrderConfirmationFields`, `ConfirmationLineRead` |
| `backend/app/modules/pricing/models.py` | `OrderPriceSnapshot`, `AgreementMethod` |
| `backend/app/modules/orders/models.py` | `TransitionReason.MANUAL_QUOTE`, `ConfirmationSmsStatus`, the SMS columns |
| `backend/app/modules/orders/transitions.py` | Row 26; row 7's pilot alternative (`DELIVERY_WINDOW_SET`, pay on delivery) |
| `backend/app/modules/orders/service.py` | `transition_order(event_id=, occurred_at=)` for the two ordered events |
| `backend/app/modules/deliveries/admin_router.py` | `GET .../confirmation-options`; `POST .../transition` picks the body by `to` |
| `backend/app/modules/dispatch/schemas.py` | `AdminOrderDetail` and `AdminOrderEvent` gain the confirmation fields (required argument, so no response drops them) |
| `backend/alembic/versions/20261022_0012_add_order_confirmation.py` | Migration `0012` |
| `docs/api/examples/confirmation-options.json`, `order-confirm-request.json`, `admin-order-history-confirmed.json` | Contract samples; backend and frontend tests compare shapes with them |
| `frontend/src/lib/api/confirmationTypes.ts` | Shared vocabulary and Zod schemas: reasons, agreement methods, the detail's confirmation fields, the history line |
| `frontend/src/lib/api/adminConfirmation.ts` | `getConfirmationOptions`, `confirmOrder`, `missingRequirements` |
| `frontend/src/lib/api/adminDispatch.ts` | `parseDetail` and the history schema read the confirmation fields (missing reads as `null`) |
| `frontend/src/features/admin-confirmation/ConfirmationSection.tsx` | C0 card, C2 summary and warnings, the toast and focus after confirming |
| `frontend/src/features/admin-confirmation/ConfirmOrderSheet.tsx` | C1: the eight sections, every state, the confirm dialog |
| `frontend/src/features/admin-confirmation/logic.ts`, `labels.ts`, `useConfirmation.ts` | Money and Lagos-time helpers, form checks, server field errors; the design's wording; the query and mutation |
| `frontend/src/features/admin-orders/mockConfirmation.ts` | The mock source's categories, sources and confirm (`VITE_ORDERS_SOURCE=mock`; `?mock=sms_failed` for the SMS warning) |
| `frontend/src/components/ui/Dialog.tsx` | `side`: the 720 px side sheet (design-system addition) |

The confirmation module orchestrates orders, sources, pricing, messaging and
audit; deliveries and dispatch call it to build the detail, and it imports
neither, so there is no import cycle.

## 4. Database models and relationships

Migration `0012` (revises `0011`):

- `order_price_snapshots`: `order_id` (unique) → `orders`; `event_id`
  (unique) → `order_events` (the row 7 event); `total_minor_units`
  (BigInteger, a multiple of 100 and at least 100, by CHECK); `currency`
  (`NGN`, CHECK); `is_manual`; `water_category_id` → `water_categories` and
  `water_category_label` (the label at confirmation); `source_id` →
  `water_sources`; `delivery_window_start_at`/`end_at` (end after start);
  `entered_by` → `users`, `entered_at`; `customer_agreement_method`
  (`phone_call`, `in_person_to_staff`, `other`; CHECK) and
  `customer_agreed_at`. All foreign keys RESTRICT.
- `orders.confirmation_sms_status` (`accepted`, `not_accepted`; CHECK) and
  `confirmation_sms_attempted_at`.
- `order_events.reason_code` allows `manual_quote`.

`orders.water_category_id`, `source_id` and the window columns already
existed (#112, revision `0007`).

## 5. API endpoints and request/response behavior

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/admin/orders/{reference}/confirmation-options` | none | 200 `ConfirmationOptions` | 404 `order_not_found` |
| POST | `/admin/orders/{reference}/transition` | `ConfirmRequest` (`to: confirmed`) | 200 `AdminOrderDetail` | 404 `order_not_found`, 409 `invalid_order_transition`, 409 `transition_requirements_unmet`, 422 `validation_error`, 403 `csrf_failed` |

The transition path keeps the hold review's fail and cancel body
(`to: failed | cancelled`); OpenAPI shows both as a `oneOf` with `to` as the
discriminator. Field rules are in the
[contract](../api/deliveries.md#post-adminordersreferencetransition-confirm);
the examples are listed in [examples/README.md](../api/examples/README.md).

## 6. Important business rules

- **From the status the dispatcher saw** (`expected_status`):
  `quote_requested` with a manual total, or `awaiting_confirmation` for an
  order placed with a server quote (#21), with no total (422 if sent). An
  `awaiting_confirmation` order without a quote, or any other status, is
  409 `invalid_order_transition`. A repeat confirm is 409: never a second
  snapshot or SMS.
- **A quoted order keeps what the customer accepted** (#21, question 14):
  the category must be the quote's, a Tanker order's source must be of the
  customer's `water_source` kind (a source with no kind set does not match),
  and the total is the quote's. A different price would be a repricing,
  which needs the customer's documented agreement (BR-05, FR-036); it is
  not offered.
- **Two status changes, one transaction** (question 1): row 26 then row 7,
  both by the dispatcher (row 7 alone for a quoted order). If anything fails, neither is written. Row 26 is
  reachable only through this service.
- **Row 7 checks run under the order lock:** phone verified (FR-003),
  source eligible for the category today in Lagos (FR-012, BR-10, T-04),
  window set (F3). Payment does not apply (pay on delivery, F4).
- **Money is integer kobo** (SRS §5): whole naira only (FR-022 rounds the
  payable amount to whole naira), at least ₦1.00, **no maximum** (decision
  7). No breakdown: a manual quote is a total.
- **The price is frozen** (FR-024, T-09): later changes to a category label
  or a source's cost never change the snapshot.
- **The SMS never changes the order** (FR-050): sent after the commit; a
  refusal is stored as `not_accepted` and the order stays confirmed. Its
  wording is accepted for now (decision 8); it writes "N" for naira (GSM-7).
- **A source that stops being eligible later blocks nothing** (decision 10):
  the detail reports its current `reasons`; assigning a driver still works.
- **A real order may use a simulated source** for now (decision 9).
- **Audit** (NFR-004): one `order_confirmed` row per confirmation, with
  source and category ids and `manual_quote` (`true` or `false`); never the
  amount, phone or note.
- **Event order:** the row 26 event is written at the confirmation time and
  the row 7 event one microsecond later, so the history (newest first) lists
  Confirmed above Awaiting confirmation.

## 7. Authentication and authorization requirements

Both endpoints require a signed-in, active **admin** (`CurrentAdmin`);
customers and drivers get 403 `forbidden`, signed-out requests 401
`not_authenticated`. The `POST` needs `X-CSRF-Token` (403 `csrf_failed`).

## 8. Error handling and edge cases

| Case | Result |
| --- | --- |
| Order not Request received (already confirmed, cancelled, a repeat) | 409 `invalid_order_transition`, `details: {from, to: "confirmed"}`, nothing written |
| Phone not verified, source not eligible | 409 `transition_requirements_unmet`, `details.missing` sorted (`phone_verified`, `source_eligible`); nothing written |
| Unknown or inactive category, unknown source, window starting in the past, agreement time in the future or before the order was sent | 422 `validation_error`, one `{loc, msg, type}` per problem, all at once |
| Total not a whole naira or under ₦1.00, no total from `quote_requested`, a total from `awaiting_confirmation`, end not after start, `other` without a note, `disclosures_confirmed` not true, unknown field, another `expected_status` | 422 `validation_error` from the schema |
| Quoted order: another category, or a source not of the customer's kind | 422 `validation_error` on `water_category_id` or `source_id` |
| `expected_status` not the order's status, or `awaiting_confirmation` without a quote | 409 `invalid_order_transition`, nothing written |
| Failure after both events were written (for example the audit row) | Everything is rolled back; the order is still Request received; no SMS |
| SMS provider refuses | Order confirmed; `confirmation_sms.status` `not_accepted`; the C2 warning |
| Two dispatchers confirm at once | The order lock serializes them; the second gets 409 `invalid_order_transition` |

## 9. Testing instructions

```bash
cd backend && source .venv/bin/activate
ruff check . && ruff format --check .
pytest tests/test_confirmation_api.py tests/test_order_transitions.py
# With a separate test database (LOG.md, 2026-10-20), after alembic upgrade head:
TEST_DATABASE_URL=... pytest tests/test_confirmation_integration.py
```

- `test_confirmation_api.py` (no database): roles, CSRF, every schema rule,
  no maximum, the `to` discriminator (fail still reaches the hold review),
  errors passed through, shapes against the examples, the SMS wording,
  naira and Lagos window formatting.
- `test_confirmation_integration.py`: options ordering and reasons; a full
  confirmation (events in order, snapshot, order fields, audit, SMS text,
  detail and history); a refused SMS; a repeat; unmet checks and T-04;
  field errors together; a mid-transaction failure rolling back both
  events; T-09; decision 10 with a real driver assignment.
- `test_quotes_integration.py` (#21): confirming a quoted order (row 7
  alone, the quote's total, not manual, audit `manual_quote` false, SMS
  total); the wrong category or source kind; a stale `expected_status`; a
  repeat. `test_confirmation_api.py` also checks the request from
  `awaiting_confirmation` without a total and the two total rules.
- `test_order_transitions.py`: the contract's table (rows 1-26) matches the
  rules.
- Migration: `alembic upgrade head`, `alembic check`, `alembic downgrade -1`
  on a throwaway PostGIS container (2026-10-22).

Frontend (#114):

```bash
cd frontend
npm run lint && npm run typecheck && npm test && npm run build
```

- `src/lib/api/adminConfirmation.test.ts`: options, confirm and history
  against the contract samples; an unknown reason is `invalid_response`; an
  older server without the fields reads as not confirmed.
- `src/features/admin-confirmation/logic.test.ts`: kobo and naira, Lagos
  times, the window wording, the form checks, the request body, server
  field errors placed under their fields.
- `src/features/admin-confirmation/confirmation.test.tsx`: C0 (verified, not
  verified, Awaiting confirmation); C1 contents and every state (confirmed
  end to end with toast, C2, Assign driver and history; client checks;
  server field errors; refused for the source; order changed; no
  connection; security; no sources; no category possible; note for
  "other"); the two C2 warnings.
- By hand: `npm run dev` with the mock source, open `MO-6VM1ZP3H8K` and
  confirm it; `?mock=sms_failed` shows the SMS warning.

## 10. Known limitations

- **Only Request received orders show the card.** The server now confirms
  orders Awaiting confirmation with a quote (#21), but the admin screen
  (#114) still shows no card for them; it needs a screen change (G2) to
  confirm without a total.
- **Not run end to end against the real backend yet** in this change: the
  screens were built and tested against the mock source and the contract
  samples. T-14 needs a run with the API (`VITE_ORDERS_SOURCE=api`).
- **The 720 px side sheet starts at the desktop breakpoint**; between the
  tablet and desktop widths it is full screen, like on phones.
- **No SMS retry:** a refused SMS is reported; the dispatcher calls the
  customer (C2). Resending is not designed.
- **Changing the window or price after confirmation** is not built (prompt 08
  question 6; FR-036 needs the customer's acknowledgement).
- **What the customer sees** after confirmation (window and total in the
  customer app) is a separate customer design: prompt 11, #99 (PR #117).
- **Slots** (C4) replace F3 later. Server quotes exist (#21) but the
  customer screens (#9) do not use them yet, so pilot orders still arrive as
  quote requests.
- **Downgrading migration `0012` fails while any confirmation exists**
  (`manual_quote` events), by design; see the migration's docstring.
