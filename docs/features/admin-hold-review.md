# Admin hold review

Requirements: FR-012, FR-034, FR-035, FR-036, FR-038, FR-044, BR-06, BR-12,
BR-13, BR-14, NFR-004, SRS §8 · Acceptance tests: T-14, T-23 · Contract:
[deliveries.md](../api/deliveries.md#admin-hold-review-endpoints), "Admin hold
review endpoints" (agreed, G3, PR #91) · Design:
[admin-hold-review.md](../design/admin-hold-review.md) (approved, G2) ·
Issues: #88 (design and decisions), #93 (backend), #94 (screens)

## 1. Overview and purpose

A driver's job can stop on a **hold**, and until now nothing could clear one,
so a held job could never finish (#86). This feature lets an administrator
see a held order, read the evidence and decide:

| Hold | Opened when | Decisions |
| --- | --- | --- |
| `proof_review` | The customer could not give the delivery code and the driver sent alternative proof | Approve (order `delivered`) or reject (driver sends a new code) |
| `source_review` | The driver used another source or flagged a safety concern at pickup | Continue (only for an eligible source), Fail, Cancel |
| `unsafe_stop` | The driver reported unsafe access or an unsafe transfer | Resume with a safe alternative, Fail, Cancel; Withdraw before departure |

It also adds the order's hold to the admin order list and detail, an
`on_hold` list filter, and hold entries in the history on request. The staff
screens (#94) show held orders, the review for each kind, the decision
dialogs and the decided cards; see "Screens" below.

## 2. Feature workflow

```
R0  GET  /admin/orders?on_hold=true     orders whose live job has an open hold
    GET  /admin/orders/{ref}            AdminOrderDetail with hold {id, kind, since}
R1-3 GET /admin/orders/{ref}/hold       HoldReview: evidence for the hold shown
R1  POST .../proof-overrides            {hold_id, decision, customer_acknowledgment?, note}
         approve: lock order, live job, open proof holds; BR-13 check;
                  proof approved; unloading → delivered (row 18, proof_override_approved);
                  job completed; unused codes voided; holds closed; audit row ─> COMMIT
         reject:  proof rejected; holds and its partial delivery closed; audit row;
                  order stays unloading; the driver can send a new code ─> COMMIT
R2  POST .../hold/continue              {hold_id, note}: only if the source is eligible
R3  POST .../hold/resume                {hold_id, note = the safe alternative}
    POST .../withdraw                   before departure; also closes the unsafe stop
FAIL/CANCEL
    GET  .../cancellation-outcome?reason_code=mmirioma_unable   charge 0, sentence
    POST .../transition                 {to, expected_status, reason_code, note?, hold_id?}
         failed (row 20) or cancelled (row 23); the job ends; every open hold closed
HISTORY
    GET  .../history?include=holds      status changes + hold opened / hold decided
```

After each decision the driver's job has no hold (or has ended), so the
driver app shows the next step the next time it loads.

## 3. Important files

| File | Responsibility |
| --- | --- |
| `backend/app/modules/deliveries/holds.py` | The service: finding holds, evidence, every decision, withdraw with holds, fail and cancel, cancellation outcome, history with holds. Module docstring holds the rules |
| `backend/app/modules/deliveries/admin_router.py` | All endpoints above; `CurrentAdmin`; thin handlers. Also serves the admin list, detail, withdraw and history, moved from the orders and dispatch routers |
| `backend/app/modules/deliveries/admin_schemas.py` | Request bodies, `HoldReviewRead`, `CancellationOutcomeRead`, the history with holds |
| `backend/app/modules/deliveries/models.py` | `HoldResolution`, `OverrideStatus`, `CustomerAcknowledgementMethod`; new columns on `OrderException` and `DeliveryProof` |
| `backend/app/modules/deliveries/service.py` | Alternative proof starts `pending`; approved proof counts as delivered on the driver's job |
| `backend/app/modules/audit/` | `AuditLog` and `record()` (NFR-004) |
| `backend/app/modules/orders/schemas.py` | `OrderHoldRead`; `AdminOrderRead.hold` |
| `backend/app/modules/orders/service.py` | `list_orders_for_staff(..., extra_conditions=...)` for the `on_hold` filter |
| `backend/app/modules/dispatch/service.py` | `withdraw_assignment(..., commit=False)` |
| `backend/alembic/versions/20261021_0010_add_hold_decisions_and_audit_logs.py` | Migration `0010` |
| `backend/tests/test_hold_review_api.py`, `test_hold_review_integration.py` | Tests |

**Why the admin order routes moved.** Modules depend one way: orders, then
dispatch, then deliveries. Holds belong to deliveries, and the list, detail,
withdraw and history now show or close them, so they are served by the
deliveries admin router; their services stay where they were (technical
lead, 2026-10-21). Paths and agreed shapes are unchanged.

## 4. Database models and relationships

Migration `0010` (revises `0009`):

| Table | Column | Rule |
| --- | --- | --- |
| `order_exceptions` | `resolved_by` | Nullable FK to `users` (RESTRICT): the administrator |
| | `resolution` | Nullable: `proof_approved`, `proof_rejected`, `source_continued`, `unsafe_resumed`, `failed`, `cancelled`, `withdrawn` (CHECK) |
| | `resolution_note` | Up to 500 characters |
| `delivery_proofs` | `override_status` | `pending`, `approved`, `rejected`; set exactly for alternative proof (CHECK `ck_delivery_proofs_override_only_for_alternative_proof`). Existing alternative proofs became `pending` |
| | `override_decided_by`, `override_decided_at`, `override_note` | The decision (FK RESTRICT) |
| | `customer_ack_method`, `customer_ack_at`, `customer_ack_note` | How the administrator confirmed with the customer (approval only) |
| `audit_logs` (new) | `actor_id`, `action`, `target_type`, `target_id`, `metadata` (JSONB), timestamps | One row per hold decision; index on `(target_type, target_id)` |

```
orders 1 ──< order_exceptions >── 0..1 assignments
                 │ resolved_by, reported_by ─> users
orders 1 ──< delivery_proofs ── override_decided_by ─> users
users  1 ──< audit_logs (target_type = 'order', target_id = orders.id)
```

A hold is an exception with `hold_kind` set and `resolved_at` null. The hold
**shown** for an order is the oldest open one on its live (offered or
accepted) assignment.

## 5. API endpoints and request/response behavior

All under `/api/v1`; shapes as in the
[contract](../api/deliveries.md#admin-hold-review-endpoints).

| Method | Path | Success | Errors |
| --- | --- | --- | --- |
| GET | `/admin/orders` (`on_hold`) | 200 page; items carry `hold` | 422 |
| GET | `/admin/orders/{reference}` | 200 `AdminOrderDetail` with `hold` | 404 `order_not_found` |
| GET | `/admin/orders/{reference}/hold` | 200 `HoldReview` | 404 `order_not_found`, `hold_not_found` |
| POST | `/admin/orders/{reference}/proof-overrides` | 200 `AdminOrderDetail` | 403 `own_delivery_override`; 409 `hold_not_open`, `invalid_order_transition`; 422 |
| POST | `/admin/orders/{reference}/hold/continue` | 200 `AdminOrderDetail` | 409 `hold_not_open`, `source_not_eligible`; 422 |
| POST | `/admin/orders/{reference}/hold/resume` | 200 `AdminOrderDetail` | 409 `hold_not_open`; 422 |
| POST | `/admin/orders/{reference}/withdraw` | 200 `AdminOrderDetail` | as before |
| GET | `/admin/orders/{reference}/cancellation-outcome` | 200 `{reason_code, customer_charge_minor_units, message}` | 409 `invalid_order_transition`; 422 |
| POST | `/admin/orders/{reference}/transition` | 200 `AdminOrderDetail` | 409 `invalid_order_transition`, `hold_not_open`; 422 |
| GET | `/admin/orders/{reference}/history` (`include=holds`) | 200 `{items}` | 404; 422 for another `include` |

- Request bodies reject unknown fields. Notes are trimmed; decision notes are
  1-500 characters.
- `HoldReview` never contains the delivery code, only its state (issued,
  SMS status, attempts used of 5, expired). A GPS point appears only if the
  driver shared it with consent, as coordinates.
- Without `include`, the history has exactly the agreed H1 fields. With
  `include=holds`, every entry has `kind` (`status_change`, `hold_opened`,
  `hold_decided`) and `hold`; hold entries have null statuses and a stable
  derived `id`.

## 6. Important business rules

- **Decisions name the hold** (`hold_id`, decision 1). A hold already
  decided, the wrong kind for the endpoint, or on an ended job is 409
  `hold_not_open` and nothing changes. Two administrators deciding at once:
  one wins, the other gets `hold_not_open` (the order row is locked first).
- **One decision per kind closes every open exception of that kind on the
  job**, so a pickup's mismatch and safety concern are one source review.
- **BR-13, T-23:** approval is refused for the job's driver and for whoever
  recorded the proof. Customers and drivers cannot call any of these
  endpoints (403).
- **Approve (row 18):** needs the customer acknowledgment (time not in the
  future and not before unloading was completed, 2 minutes' tolerance) and a
  note. `delivered` uses the proof's litres; a partial delivery keeps its
  exception. Payment is untouched (BR-12).
- **Reject:** the proof stops counting and its partial delivery exception is
  closed (a new proof opens it again). The order stays `unloading`; the
  driver sends a new code (if the current one has expired) and proves again.
- **Continue (FR-012):** only when the source is eligible for the order's
  water category, answered by the shared check in
  [water-sources.md](water-sources.md) (#112). A free-text source is always
  `not_eligible`; an order with no water category (set at confirmation,
  #113) is `cannot_check` ("This order has no water category."). Otherwise
  Continue is refused with 409 `source_not_eligible`.
- **Resume:** the note is the safe alternative; the job continues from where
  it stopped.
- **Withdraw before departure** (row 11, decision 4) also closes an unsafe
  stop (`withdrawn`).
- **Fail (row 20)** with `source_quality_concern`, `unsafe_access` or `other`
  (note required); **cancel (row 23)** with `mmirioma_unable` only. Both need
  `expected_status`, end the job (failed: assignment `completed`, attempt
  `failed`; cancelled: assignment `withdrawn`) and close every open hold. No
  charge is recorded: these failures are attributable to MmiriOma (FR-038,
  BR-14), and the cancellation is free (FR-044); the outcome read returns
  `customer_charge_minor_units: 0` (integer kobo).
- **Records (NFR-004, decision 6):** each of the four decisions writes an
  `audit_logs` row (`proof_override_approved`, `proof_override_rejected`,
  `source_review_continued`, `unsafe_stop_resumed`) with ids and kinds only,
  never notes or personal data. Status changes write `order_events`.

## 7. Authentication and authorization requirements

Every endpoint requires a signed-in, active `admin` (`CurrentAdmin`);
customers and drivers get 403 `forbidden`. `POST` requests need the
`X-CSRF-Token` header (403 `csrf_failed`). BR-13 is checked in the service
(403 `own_delivery_override`).

## 8. Error handling and edge cases

| Case | Result |
| --- | --- |
| No open hold when reading the evidence | 404 `hold_not_found` |
| Stale `hold_id`, hold of another kind, or a race lost | 409 `hold_not_open`, no change |
| Approving as the delivering user | 403 `own_delivery_override`; rejecting still works |
| Order no longer `unloading` when deciding proof | 409 `invalid_order_transition` |
| Acknowledgment time in the future or before unloading | 422 `validation_error` at `body.customer_acknowledgment.confirmed_at` |
| Continue with any answer but `eligible` | 409 `source_not_eligible`, `details.answer` |
| Fail or cancel with an `expected_status` the order no longer has | 409 `invalid_order_transition`, no change |
| A reason this section does not cover | 422 `validation_error` |
| Cancellation outcome on a cancelled, delivered or disputed order | 409 `invalid_order_transition` |
| `include` other than `holds` | 422 `validation_error` |

Every refusal rolls back before answering, so nothing is half-written.

## Screens (frontend, #94)

Built from the approved design (canvas Hold01-Hold12) on the API source;
the mock source has four held fixture jobs for review (`mockHolds.ts`, on in
the app's mock mode).

```
Directory (/admin/orders)       On hold tag beside the status; "N orders are on hold.";
                                tick box "On hold (any kind) · N" (on_hold=true);
                                empty state "No orders are on hold." with Show all orders
Order detail                    hold banner: kind, since, driver, "Review hold"
  └─ /admin/orders/:ref/hold    R1, R2 or R3 by the hold's kind: order, banner, evidence,
                                then "Your decision"
       ├─ R1  Approve (needs how and when the customer confirmed, and a note)
       │        ─> "Approve this delivery?" ; Reject ─> "Reject this proof?" (reason)
       ├─ R2  Continue (only when eligible, with a note) ; Fail ; Cancel
       └─ R3  Resume (safe alternative) ─> "Resume this job?" ; Withdraw job (before
              departure only) ; Fail ; Cancel
     decision ─> back to the order detail: toast and the decided card
Order detail after a decision   decided card from the newest history entry (approved,
                                rejected with "Mark delivery failed", continued, resumed,
                                failed, cancelled); history with hold entries
```

| File | Responsibility |
| --- | --- |
| `frontend/src/lib/api/holdTypes.ts` | Hold kinds, decisions, categories, the `hold` schema (shared) |
| `frontend/src/lib/api/adminHolds.ts` | Typed calls and Zod schemas for the hold review endpoints |
| `frontend/src/lib/api/adminDispatch.ts` | Detail with `hold`; history with `include=holds` (`kind`, `hold`) |
| `frontend/src/lib/api/adminOrders.ts` | `hold` on listed orders (checked) and the `on_hold` filter |
| `frontend/src/features/admin-holds/HoldReviewPage.tsx` | The review screen and its states |
| `frontend/src/features/admin-holds/ProofReview.tsx`, `SourceAndUnsafeReview.tsx` | R1, R2 and R3 bodies |
| `frontend/src/features/admin-holds/HoldDialogs.tsx` | Approve, Reject, Resume, Fail and Cancel dialogs |
| `frontend/src/features/admin-holds/HoldOnOrder.tsx` | Banner, decided card and toast on the order detail |
| `frontend/src/features/admin-holds/HoldTag.tsx`, `HoldBanner.tsx` | On hold tag and banner (design system additions) |
| `frontend/src/features/admin-holds/logic.ts`, `labels.ts`, `useHolds.ts` | Pure helpers, wording, TanStack Query hooks |
| `frontend/src/features/admin-orders/mockHolds.ts` | Held fixture jobs following the contract's rules |
| `frontend/src/features/admin-dispatch/OrderHistory.tsx` | Hold opened and hold decided entries |

Screen rules: error states are chosen by error **code** (design Decision 3):
`hold_not_open`, `hold_not_found` and `invalid_order_transition` show "This
order has changed." with Refresh; `own_delivery_override` (BR-13, T-23) and
`source_not_eligible` show the server's message and keep the decision
disabled; no connection keeps everything typed and lets one new request be
sent. Every decision button keeps its label, turns busy and sends once.
The CANCEL sentence is the server's cancellation outcome, word for word.
Delivered is shown only after the server says so (BR-06).

### Cancel from the order panel (#129, #176)

The Orders panel's "Cancel this order" button opens the same CANCEL dialog
(`frontend/src/features/admin/hold/EndDelivery.tsx`, `CancelDialog`), so there
is one cancel flow. Design: `docs/design/admin-order-cancellation.md`.

- **Who sees it:** `canCancel` in `hold/logic.ts`. Not on the page for
  Delivered, Cancelled and Disputed orders (row 23 refuses them).
- **Driver line:** `hasLiveDriver` is true for Assigned, Loading and On the
  way. Then the dialog says the driver's job ends; otherwise "No driver is
  assigned, so no driver's job changes."
- **Open hold:** the entry sends no `hold_id` (`hold={null}`); the server closes
  every open hold on cancel. The dialog still says "This also closes the <kind>
  hold.", from the `openHold` prop.
- **Calls:** `getCancellationOutcome` and `transitionOrder` with `to:
  cancelled`, `reason_code: mmirioma_unable` and `expected_status` from
  `backendStatusFor(order)`. There is no free-text reason, and no promise that
  the rider or customer is told or that a refund follows.
- **Mock mode:** the same dialog, with the server's sentence labelled SAMPLE.
  The old mock `cancelOrder` is gone.
- **Not here:** a cancel because the customer asked (`customer_request`) needs a
  contract change first (#174).

## 9. Testing instructions

From `backend/` with the virtualenv:

```bash
ruff check . && ruff format --check . && pytest
```

`tests/test_hold_review_api.py` (no database) covers roles, CSRF, request
validation, error codes, the evidence without the code, and the history
regression (no hold entries without `include`). `test_dispatch_api.py` and
`test_orders_api.py` keep checking the moved routes' agreed shapes.

`tests/test_hold_review_integration.py` needs a migrated test database
(`mmirioma_test`, never the dev database):

```bash
export TEST_DATABASE_URL=postgresql+asyncpg://...@localhost:5432/mmirioma_test
DATABASE_URL="$TEST_DATABASE_URL" alembic upgrade head
pytest -m integration
```

It covers approve and reject (then a new code and delivery), BR-13, stale
and racing decisions, source review refused then continued with eligibility
faked, fail from a source review, resume, withdraw before departure, cancel
with no charge, the audit rows and the history, and renders real results
through the response models. Migration checks: `alembic upgrade head`,
`alembic downgrade -1`, `alembic upgrade head`, `alembic check` (run on
`mmirioma_test`, 2026-10-21).

Frontend, from `frontend/`:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

`src/lib/api/adminHolds.test.ts` checks paths, bodies, CSRF and the Zod
checks (including `hold` on listed orders); `src/features/admin-holds/logic.test.ts`
the hold age, the Lagos time conversion and which decided card shows;
`src/features/admin-holds/holds.test.tsx` the screens on the mock source:
the directory tag, count, filter and empty state, the banner, R1 approve
and reject (then Mark delivery failed), the BR-13 refusal, "This order has
changed.", R2 with Continue off, fail, R3 resume, withdraw before departure,
cancel and "no connection".

## 10. Known limitations

- **Continue needs the assigned source:** an order confirmed with a
  category (#113) can continue when the driver collected at its assigned
  source and that source is eligible (for example a pickup held only for a
  safety concern). A driver can name another source only in free text
  (always `not_eligible`); choosing a recorded source at pickup is #109.
- **The approval card leaves out two lines the design shows:** the litres
  recorded and how the customer confirmed. No agreed endpoint returns them
  after the decision (they are stored on the proof). The card shows who
  approved and when; adding them needs a small contract change (an open
  question for the technical lead).
- R2's Continue sends at once (the design draws no confirmation dialog for
  it); R1 and R3 confirm in a dialog.
- No end-to-end run on the real API yet; to be recorded like #86.
- Only the fail and `mmirioma_unable` cancel uses of
  `POST .../transition` exist; the endpoint's other rows (A1-A7) are
  agreed with their screens.
- Rescheduling a failed delivery (R4, row 21) is design ahead.
- Nothing notifies the driver of a decision; the driver app shows the new
  state the next time it loads.
- The audit log has no screen; it is read in the database.
- Holds opened before this feature on jobs that have since ended stay open in
  the database, but are never shown (only live jobs' holds count).
