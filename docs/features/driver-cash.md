# Driver cash: Cash card, Record cash, My cash and hand over (K1, K2)

Requirements: FR-040 (pay on delivery, fallback F4), FR-041 (cash part),
BR-12, BR-13, BR-15, NFR-011, NFR-012, NFR-020, NFR-021 · Acceptance tests:
T-14 (the driver's part) · Design:
[cash-remittance.md](../design/cash-remittance.md) (approved G2 2026-10-22;
boards Cash01-Cash05) · Contract: [payments.md](../api/payments.md), "Driver
endpoints" (agreed G3; amendments 1-3 agreed 2026-10-23) · Issues:
[#124](https://github.com/mmiri-oma/mmirioma/issues/124) (K2 in PR #139, K1
in this change); active job screens #97; backend #123; admin side
[cash-remittance.md](cash-remittance.md) (#125)

## 1. Overview and purpose

The driver's view of the cash in their care, from the customer's hand to the
office:

- **Cash card (K1)** on the job once unloading is complete: the amount due
  from the server and "Record cash"; once recorded, what was recorded and
  when it must reach the office.
- **Record cash (K1)**: the driver types the cash received; a different
  amount, including ₦0, needs a note; a dialog confirms it.
- **My cash (K2)**, driver menu "Cash": how much they hold, when it is due
  (6:00 pm Africa/Lagos, from the server), and their recent records.
- **Hand over cash (K2)**: marks records "Ready to hand over". It moves no
  money; the cash stays the driver's until an administrator receives it (K4).

Delivery and payment never wait for each other (BR-12): the Cash card and
"Mark as delivered" can be used in either order, and the driver never sees
the order's payment status.

## 2. Feature workflow

1. The driver records unloading complete (A5). Every job response now
   carries `cash` (payments amendment 2), and the job screen shows the Cash
   card beside "Complete delivery": "Amount due", the amount, "Manual quote ·
   Pay on delivery: cash after unloading", and "Record cash" while
   `cash.record_allowed` is true.
2. The card also shows on "Waiting for proof approval" (a `proof_review`
   hold) and on the "Delivered" outcome. A delivered job's own address
   answers 404, so the outcome and Record cash read the job from today's
   `done` group of My jobs, which carries `cash` too.
3. "Record cash" opens `/driver/jobs/:reference/cash`. The driver types whole
   naira; the formatted amount and a line ("Matches the amount due.", "Less
   than…", "More than…", "Customer paid nothing.") show under the field. A
   different amount asks "What happened?" (500 characters, with a counter).
4. "Record cash" opens the dialog "You received ₦… in cash for MO-….", "You
   can't change this after you record it.". Confirming sends `POST
   /driver/jobs/{reference}/cash-collection` with `amount_minor_units` and
   `note`.
5. On 201 (or 200 for a repeat) the page shows the toast "Cash recorded for
   MO-…." and the recorded card: amount, "Collected by driver", recorded at,
   "Hand over by" from the server, the difference and note. The job, My jobs
   and My cash are read again.
6. Menu › Cash (`/driver/cash`) lists the cash on hand. "Hand over cash"
   opens the sheet; "Ready to hand over" sends `POST /driver/cash/handover`;
   the toast says how many records are ready and their total.

## 3. Important files

| File | Responsibility |
| --- | --- |
| `frontend/src/lib/api/driverCash.ts` | `getMyCash`, `handOverCash`, `recordCash`; Zod schemas for `DriverCash`, `CashCollection` and the job's `cash` (`jobCashSchema`) |
| `frontend/src/lib/api/driverJobs.ts` | `cash` on `DriverJobSummary` and `DriverJobDetail` |
| `frontend/src/features/driver-cash/useDriverCash.ts` | Queries and mutations (`networkMode: 'always'`); recording reads the job, My jobs and My cash again |
| `frontend/src/features/driver-cash/recordCash.ts` | K1 rules and wording: reading the amount, the comparison lines, the note rule, error kinds |
| `frontend/src/features/driver-cash/labels.ts` | K2 chips, time lines, toast, error kinds |
| `frontend/src/features/driver-cash/components/CashCard.tsx` | K1 Cash card, the recorded cash, the amount block |
| `frontend/src/features/driver-cash/pages/RecordCashPage.tsx` | K1 Record cash and every state after sending |
| `frontend/src/features/driver-cash/components/CashParts.tsx` | Cash row and cash list |
| `frontend/src/features/driver-cash/components/HandOverSheet.tsx` | Cash05 sheet |
| `frontend/src/features/driver-cash/pages/MyCashPage.tsx` | Cash04 |
| `frontend/src/features/driver-jobs/components/ActiveJob.tsx`, `ActiveParts.tsx` | Mount the Cash card on A5, the proof review hold and the A7 outcome |
| `frontend/src/features/driver-jobs/components/DriverLayout.tsx` | Menu items "Jobs" and "Cash" |
| `frontend/src/lib/money.ts` | `formatNaira`, `nairaInputToKobo` (shared with the admin screens) |

## 4. Database models and relationships

None in the frontend. Records are `cash_collections` rows owned by the
driver (payments contract, "Data").

## 5. API endpoints and request/response behavior

| Call | Used for | Handling |
| --- | --- | --- |
| `GET /driver/jobs`, `GET /driver/jobs/{reference}` | The job's `cash` | `null` until unloading is complete; a missing `cash` reads as `null` |
| `POST /driver/jobs/{reference}/cash-collection` | Record cash | Body `{ amount_minor_units, note }`; 201 or 200 `CashCollection`; 409 `cash_already_recorded` (`details.amount_minor_units`), `transition_requirements_unmet` (`details.missing`); 404; 403 `csrf_failed`; 422 |
| `GET /driver/cash` | My cash | 200 `DriverCash`; network, 5xx or an unexpected body: "Not loaded" |
| `POST /driver/cash/handover` | Ready to hand over | Body `{ collection_ids }` (1-50); 200 `DriverCash`; 409 `cash_collection_changed`; 403; 422 |

Responses are checked with Zod; an unknown status or a fractional amount is
`invalid_response`.

## 6. Important business rules

- **Cash only after unloading (BR-15).** The card exists only when the server
  sends `cash`; Record cash shows only while `record_allowed`.
- **The amount due is never the driver's** (FR-040, BR-13): it is the server's
  price snapshot, read-only. The driver types only the cash received, in
  whole naira; ₦0 is valid (decision 4).
- **A different amount needs a note** (decisions 3 and 4); the page asks for
  it before the dialog, and the server refuses without it.
- **The record cannot be changed by the driver**; an administrator can
  correct it before receiving it (decision 6).
- **Due time and overdue come from the server** (the 6:00 PM rule); the client
  never computes them. Overdue blocks nothing (decision 5).
- **Handing over moves no money** and changes no order or payment status.
- **The driver never sees a payment status**, an outstanding balance or a
  customer's details beyond the job's receiver line.
- **Money is integer kobo** in every request and response; shown as
  `₦45,000.00`.

## 7. Authentication and authorization requirements

Behind `AppGate app="driver"` (role `driver`); the server returns only the
signed-in driver's jobs and records, and another driver's job is 404. Both
`POST` calls send `X-CSRF-Token`. 401 ends the session; another role sees X4.

## 8. Error handling and edge cases

| Situation | Shown |
| --- | --- |
| Record cash: nothing typed, or not whole naira | Record cash off; "Enter an amount in whole naira." |
| A different amount without a note | "Tell the office what happened before you record the cash."; nothing sent |
| Sending | The dialog locked: "Recording…" busy, Cancel off |
| 409 `cash_already_recorded` | "Cash for this order is already recorded." / "Recorded amount: ₦…. Ask the office if this is wrong." and the recorded card |
| 409 `transition_requirements_unmet`, or no `cash` yet | "You can record cash only after unloading." / "Missing: Unloading completed." (or "An amount due on the order") and Back to job |
| Offline | "No connection" / "You can record the cash when you are back online. Your entries are kept."; Record cash off; nothing queued |
| No connection or 5xx while sending | "Not sent" with the server's message; entries kept; "Try again" repeats the same request, which the server answers once (NFR-011) |
| 404 `order_not_found` | "Order not found" / "This job may have been given to another driver." and Back to jobs |
| 403 `csrf_failed` | The server's message with "Reload" |
| 422 | The server's message under the amount or the note |
| My cash and the handover | As before: "Not loaded", nothing ticked, "This cash record has changed." with Refresh, "Not sent" with Try again, security, other |

## 9. Testing instructions

```bash
cd frontend
npm run lint && npm run typecheck && npm test && npm run build
```

- `src/lib/api/driverCash.test.ts`: record and handover requests (URL, CSRF,
  body), the contract examples, the 409 envelopes, invalid responses.
- `src/lib/api/driverJobs.test.ts`: `cash` on a job, a job without it, a
  malformed card.
- `src/features/driver-cash/recordCash.test.ts`: reading amounts, the note
  rule, every line's wording, error kinds, missing requirements.
- `src/features/driver-cash/recordCash.test.tsx` (real routes): the card on
  A5, the proof review hold and the Delivered outcome, none without
  unloading, the recorded card; every form and after-sending state above,
  and recording a delivered job from its `done` summary.
- `src/features/driver-cash/driverCash.test.tsx`, `labels.test.ts`: K2.

**End-to-end run (2026-10-23, #124, Bonvee120 + agent).** On a throwaway
PostGIS database seeded through the app's services, with the backend and the
Vite dev server running locally:

1. The order went from creation to unloading complete through the real API.
2. In the browser (412 px), the driver signed in, saw the Cash card on A5 and
   recorded ₦40,000.00 against ₦45,000.00 with a note. It was recorded at
   9:04 pm Lagos time, so the server set "Hand over by Sat 24 Oct 2026,
   6:00 pm".
3. The driver handed it over from My cash.
4. The server then showed the collection `awaiting_remittance`, the admin
   cash page listing it with the driver, and the history's `cash_recorded`
   and `cash_handed_over` steps.
5. The order stayed `unloading` with payment `pending_collection` (BR-12).

There were no database edits after seeding. The delivered-job card was
covered by the component tests, not this run.

## 10. Known limitations

- **Corrections are not shown to the driver.** The server also sends
  `original_amount_minor_units` and `corrected_at` (payments amendment 3);
  the boards show only the current amount, so the client ignores them.
- **A finished job's card is reachable only today**: My jobs lists finished
  jobs on the day they ended, and a delivered job's own address answers 404.
- **Opening a delivered job's address directly** (not from My jobs) shows "no
  longer available" rather than the outcome: the job page needs My jobs'
  "accepted" hint (#97 behaviour). The Record cash page itself reads the
  `done` summary and works either way.
- **The header of My cash shows the driver's name only**; the vehicle is not
  in the session or `GET /driver/cash`.
- **Chip tones differ from the admin cash screens** (logged 2026-10-23).
- "Hand over cash" is offered offline too; the request then shows "Not sent".
