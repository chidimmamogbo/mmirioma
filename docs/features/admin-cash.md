# Admin cash (fork admin app)

Requirements: FR-040 (pay on delivery only, F4), FR-041 (cash part), FR-050,
BR-07, BR-12, BR-15, NFR-004 · Acceptance tests: T-14, T-21, T-24 ·
Design: [admin-cash.md](../design/admin-cash.md) (approved G2, 2026-10-26) ·
Contract: [payments.md](../api/payments.md) (agreed G3) · Issue: #19 ·
Backend: built in #123 (`backend/app/modules/payments/`)

## 1. Overview and purpose

Administrators see the cash drivers collected on delivery, receive it from a
driver with the counted total, correct a mistyped record before receipt, and
reconcile received cash. Receiving is what sets each order's payment status
and sends the customer's payment SMS (BR-07, FR-041, FR-050). These are the
main repo's approved screens K3 to K5, drawn with the fork's admin parts.

The fork's older **Payments** page (`/admin/payments`, a per-order list with
"Mark paid") is unchanged and stays on its mocks: the backend has no per-order
"mark paid", and bank transfers and refunds are not in the pilot (design
decision 2).

## 2. Feature workflow

1. A driver records cash after unloading and marks it ready to hand over
   (partner app, K1 and K2, #20).
2. **K3** (`/admin/cash`): the day's five figures, the drivers holding cash
   (overdue first) and the received cash waiting to be reconciled. "Previous
   day" / "Next day" move through Lagos days (`?date=`).
3. **K4** (`/admin/cash/drivers/:driverId`, from "Receive cash"): the
   administrator ticks the records, may correct one first (with a reason),
   types "Cash counted" and confirms. A counted difference needs a note and is
   saved on the handover only. The result lists each order's payment status
   and any failed SMS.
4. **K5** (on K3): tick received records, or use a row's "Reconcile", and
   confirm. Payment statuses stay as they are.

## 3. Important files

| File | Responsibility |
| --- | --- |
| `frontend/src/features/admin/pages/Cash.tsx` | K3 and the K5 panel |
| `frontend/src/features/admin/pages/CashDriver.tsx` | K4: tick list, correction dialog, count, confirm, result |
| `frontend/src/features/admin/cashFormat.ts` | Amounts with kobo, the approved labels, Lagos days, error wording |
| `frontend/src/features/admin/adminApi.ts` (cash lines) | Picks the mock or the real adapter; re-exports the contract types |
| `frontend/src/features/admin/real/cash.ts` | Adapters on `lib/api/adminCash.ts` |
| `frontend/src/features/admin/queries.ts` | `useCashDay`, `useDriverCash` |
| `frontend/src/mocks/adminCashMock.ts` | Mock endpoints with the contract's rules and sample data |
| `frontend/src/features/admin/routes.tsx`, `components/layout/adminNav.tsx` | Routes and the "Cash" sidebar item after "Payments" |

## 4. Database models and relationships

None in the frontend. The backend tables (`cash_collections`,
`cash_remittances`, `cash_events`, the payment columns on `orders`) are in
[payments.md](../api/payments.md#data-for-the-build) and
`backend/app/modules/payments/models.py`. In mock mode the records live in
`admin.cash` of the mock state, created on first use.

## 5. API endpoints and request/response behavior

| Screen | Endpoint |
| --- | --- |
| K3 | `GET /api/v1/admin/cash?date=YYYY-MM-DD` |
| K4 | `GET /api/v1/admin/cash/drivers/{driver_id}`, `POST /api/v1/admin/cash-collections/{id}/correction`, `POST /api/v1/admin/cash-remittances` |
| K5 | `POST /api/v1/admin/cash-reconciliations` |

The screens were drawn for the contract, so they use its types unchanged:
there is no conversion and no field the screens show that the backend does not
send. The client validates each response with zod (`invalid_response` if it
does not match).

## 6. Important business rules

- **Payment status is set at receipt only**, by the server, per order from its
  own recorded amount (payments.md, "Payment status"): equal → Paid; less
  (including ₦0.00) → Part paid with the rest outstanding; more → Paid, the
  excess flagged "More than due: review". The client never computes it.
- **One counted amount per handover** (approved decision 3). A difference
  needs a note, is saved on the handover as an exception, and never changes an
  order.
- **Correction** only before receipt, with a required reason; the row keeps
  "Corrected from … by …" (approved decision 6).
- **Reconciling never changes a payment status** (approved decision 2).
- **Overdue** is a server flag with no action (approved decision 4).
- Money is integer kobo throughout; the screens show naira with kobo.

## 7. Authentication and authorization requirements

Admin only: the backend answers 403 `forbidden` to other roles, and the
admin area already requires the admin role. Writes send the CSRF header
through the shared client; a 403 `csrf_failed` shows "Your session check
failed. Reload the page and try again."

## 8. Error handling and edge cases

- Loading and error states on both pages (`LoadingBlock`, `ErrorBlock` with
  Retry; K3 also shows "Could not load the cash page.").
- 409 `cash_collection_changed` (records received meanwhile, or a retry after
  a lost response): "These records changed while you were counting. The list
  has been reloaded." and the list reloads.
- 422 `validation_error`: the server's message under the field (`note`,
  `counted_minor_units`, `amount_minor_units`, `reason`).
- 404 `driver_not_found` on K4: the error block and "Back to Cash".
- A driver with nothing to receive: "… has no cash to hand over."
- A future or malformed `?date=` falls back to today.
- A failed payment SMS: "The payment SMS could not be sent for MO-…" / "Call
  the customer to tell them. The payment is still recorded."

## 9. Testing instructions

```bash
cd frontend
npm run lint && npm run typecheck && npm test && npm run build
npx vitest run src/features/admin/real/cash.test.ts src/mocks/adminCash.test.ts \
  src/features/admin/cashFormat.test.ts src/features/admin/admin.test.tsx
```

- `real/cash.test.ts`: each adapter with a fake `fetch` and the contract's
  example files: the URL, method and body sent, and an error code passed
  through (422, 404, 409 with details, 403).
- `mocks/adminCash.test.ts`: the payment status table, 403 for partners, the
  day's figures and order, `driver_not_found`, the note rule, a repeat
  receipt (409), correction rules, reconciling without a status change.
- `cashFormat.test.ts`: kobo formatting, labels, Lagos days, error wording,
  field errors.
- `admin.test.tsx`: K3 in mock mode, then K4 end to end (count, confirm,
  result), and the missing note.

Against the local backend (`VITE_USE_MOCKS=false`): sign in as the demo admin
and open `/admin/cash`. The demo seed has no cash records, so K3 shows an
empty day; receiving needs an order that a driver delivered and recorded cash
for (#13, #20).

Clicked through on 2026-10-26 by @nnamdi-security against the local backend
with the demo seed: the "Cash" sidebar item, the empty day, Previous / Next
day, and "Driver not found" with "Back to Cash" all worked; the receive and
reconcile flow worked in mock mode.

## 10. Known limitations

- The demo seed creates no cash records, so receiving and reconciling cannot be
  clicked through against the local backend until the driver steps (#13) and
  driver cash (#20) are linked, or a record is made through the API.
- K6 (the payment card on the order detail) and the cash lines of the order
  history belong to the admin order detail (lane D).
- The old Payments page stays on mocks ("not connected yet" against the real
  API).
- The mock sends no SMS and always reports it sent.
