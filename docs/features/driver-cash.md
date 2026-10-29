# Driver cash: Cash card, Record cash, My cash and hand over (K1, K2)

Requirements: FR-040 (pay on delivery, fallback F4), FR-041 (cash part),
BR-12, BR-13, BR-15, NFR-011, NFR-012, NFR-020, NFR-021 · Acceptance tests:
T-14 (the partner's part) · Design:
[driver-cash.md](../design/driver-cash.md) (#7, approved G2 2026-10-26; based
on the main repo's [cash-remittance.md](../design/cash-remittance.md)) ·
Contract: [payments.md](../api/payments.md), "Driver endpoints" (agreed G3;
amendments 1-3 agreed 2026-10-23) · Issue: #20 (this fork's screens and link);
admin side #19 ([cash-remittance.md](cash-remittance.md)). The backend
endpoints came across with the upstream backend (upstream #123).

## 1. Overview and purpose

The partner's view of the customer's cash in their care, from the
customer's hand to the office, in both partner apps (Keke rider and tanker
driver; the server role is `driver` for both):

- **Cash card (K1)** on the Done screen once the job is delivered: the amount
  due from the server and "Record cash"; once recorded, what was recorded and
  when it must reach the office. A delivered job's page *is* the Done screen
  (the job page sends a delivered job there), so this is also the card "on
  the delivered job's page" the design asks for.
- **Record cash (K1)**: the partner types the cash received; a different
  amount, including ₦0, needs a note; a dialog confirms it.
- **Home card (K2, fork)**: "Cash to hand over" on the home screen while cash
  is on hand, red with "Overdue" when the server says so.
- **My cash (K2)**, menu item "My cash": how much they hold, when it is due
  (6:00 pm Africa/Lagos, from the server), and their recent records.
- **Hand over cash (K2)**: marks records "Ready to hand over". It moves no
  money; the cash stays the partner's until an administrator receives it (K4).

Delivery and payment never wait for each other (BR-12), and the partner
never sees the order's payment status: the Done screens' old "Payment" row is
gone (design decision 3).

## 2. Feature workflow

1. The partner enters the customer's code and the job is delivered. Every job
   response carries `cash` once unloading is complete (payments amendment 2).
   A delivered job's own address answers 404, so the Done screen reads the
   job from the `done` group of `GET /driver/jobs`, which carries `cash` too.
2. The Done screen shows the Cash card: "Amount due", the amount, "Pay on
   delivery: cash after unloading" ("Manual quote · ..." only for
   `manual_quote`, decision 8), the hint and "Record cash" while
   `cash.record_allowed` is true.
3. "Record cash" opens `.../jobs/:reference/cash`. The partner types whole
   naira after the ₦ sign; the formatted amount and a line ("Matches the
   amount due.", "Less than...", "More than...", "Customer paid nothing.") show
   under the field. A different amount asks "What happened? (required)" (500
   characters, with a counter).
4. "Record cash" opens the dialog "You received ₦... in cash for MO-.... You
   can't change this after you record it." with "Record cash" and "Go back".
   Confirming sends `POST /driver/jobs/{reference}/cash-collection`.
5. On 201 (or 200 for a repeat) the app returns to the Done screen with
   "Cash recorded for MO-...." and the recorded card: "Cash recorded", the time,
   "Collected by rider" (or driver), the amount, any outstanding amount,
   "Hand over by ..." from the server and "My cash".
6. The home card and Menu > My cash (`.../cash`) show the cash on hand. "Hand
   over cash" opens `.../cash/handover`: every `collected` record ticked, the
   total, "Still your responsibility", and "Ready to hand over", which sends
   `POST /driver/cash/handover` and returns to My cash with "Marked ready to
   hand over.".

## 3. Important files

| File | Responsibility |
| --- | --- |
| `frontend/src/lib/api/driverCash.ts` | Typed calls `getMyCash`, `handOverCash`, `recordCash`; Zod schemas for `DriverCash`, `CashCollection` and the job's `cash` |
| `frontend/src/lib/api/driverJobs.ts` | `cash` on `DriverJobSummary` and `DriverJobDetail` |
| `frontend/src/domain/partner.ts` | `cash` on `PartnerJob` |
| `frontend/src/features/partner/real/jobs.ts`, `real/cash.ts` | The job's `cash`, and the three cash adapters |
| `frontend/src/features/partner/partnerApi.ts`, `queries.ts` | The mock / real switch, `useMyCash`, `useRecordCash`, `useHandOverCash` |
| `frontend/src/features/partner/cash/logic.ts` | Wording, ₦ with kobo, the Lagos due times, the comparison lines, the error words |
| `frontend/src/features/partner/cash/CashParts.tsx` | Cash card (K1), home card (K2), cash row, amount block, the arrival toast |
| `frontend/src/features/partner/cash/CashPages.tsx` | Record cash, My cash, Hand over cash |
| `frontend/src/features/partner/pages/RiderDone.tsx`, `DriverDone.tsx`, `RiderHome.tsx`, `DriverHome.tsx`, `PartnerAccount.tsx`, `routes.tsx` | Where the card, the home card, the menu item "My cash" and the routes sit |
| `frontend/src/mocks/partnerCashMock.ts` | The mock endpoints, on the admin cash mock's records (`admin.cash`), so the office sees what a partner records and hands over |

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

Behind `RequireRole role="driver"` (the partner area); the server returns
only the signed-in partner's jobs and records, and another partner's job is
404. Both `POST` calls send `X-CSRF-Token`.

## 8. Error handling and edge cases

| Situation | Shown |
| --- | --- |
| Nothing typed, or not whole naira | "Enter the cash you received in whole naira." under the field; nothing sent |
| A different amount without a note | "Tell us what happened." under the note; nothing sent |
| Sending | The button busy; the field locked |
| 409 `cash_already_recorded` | "Cash already recorded" / "₦... was recorded for this order. Contact the office if that is wrong."; the form closes |
| 409 `transition_requirements_unmet`, or no `cash` yet | "Finish unloading first" / "You can record cash once unloading is complete." |
| 404 `order_not_found` | "This order is no longer yours" / "It may have been reassigned. Go back to your jobs." and "Back to my jobs" |
| 422 | The server's message under the amount or the note |
| No connection or 5xx while sending | "Not sent" / "Check your connection and try again. Nothing was recorded." with "Try again"; the amount and note are kept (NFR-012); the server answers a repeat once (NFR-011) |
| My cash not loaded | The shared error block with "Try again"; the home card shows nothing |
| Nothing on hand | "No cash to hand over" / "Cash you record after a delivery shows here." |
| Overdue | Red "Overdue" notice with the due time; it blocks nothing |
| Handover: none ticked | "Ready to hand over" off |
| 409 `cash_collection_changed` | "Some cash changed" / "The office already received some of it. Your list is updated." and the list reloads |
| Handover not sent | "Not sent" / "Check your connection and try again." |

## 9. Testing instructions

```bash
cd frontend
npm run lint && npm run typecheck && npm test && npm run build
```

- `src/lib/api/driverCash.test.ts`, `driverJobs.test.ts`: the typed calls and
  the job's `cash`.
- `src/features/partner/real/cash.test.ts`: each adapter with a mocked
  `fetch`, a success and the error codes (`cash_already_recorded`,
  `order_not_found`, `transition_requirements_unmet`,
  `cash_collection_changed`, `invalid_response`).
- `src/features/partner/cash/logic.test.ts`: ₦ with kobo, the Lagos times,
  the labels, decision 8, the comparison lines, the error words.
- `src/features/partner/cash/cash.test.tsx` (real routes, mock mode): the Done
  screen's card, recording the amount due and the recorded card, the note rule,
  "Cash already recorded", My cash, handing over, none ticked, "Some cash
  changed", the home card.
- `src/mocks/partnerCash.test.ts`: the mock's rules, and the office seeing a
  handover.

**Click-through on the real backend (2026-10-28, #20).** A local backend on a
throwaway database (`VITE_USE_MOCKS=false`, demo seed), signed in as the demo
driver (tanker app), with four delivered, priced, pay-on-delivery jobs made
through the services the endpoints call (the payments tests' helpers):

1. The Done screen showed the Cash card: "Amount due ₦45,000.00", "Manual
   quote · Pay on delivery: cash after unloading" (the server's
   `manual_quote`) and Record cash; the home card was hidden with nothing on
   hand.
2. Recording ₦45,000.00 ("Matches the amount due.", the dialog) returned to
   the Done screen with "Cash recorded for MO-…." and the recorded card. It was
   recorded at 11:14 pm, so the server set "Hand over by Thu 29 Oct, 6:00 pm".
3. ₦15,000.00 against ₦20,000.00: "Less than the amount due." / "₦5,000.00
   will show as outstanding.", "Tell us what happened." until a note was
   typed, then the card with "₦5,000.00 outstanding". ₦11,000.00 against
   ₦10,000.00 showed "More than the amount due." and recorded with a note.
4. ₦0.00 recorded through the API for a third job while its form was open;
   recording ₦30,000.00 on screen showed "Cash already recorded" / "₦0.00 was
   recorded for this order. …".
5. The home card and My cash showed ₦60,000.00 on hand; the menu has "My
   cash". Hand over cash: all ticked, ₦0.00 with none ticked and the button
   off; two records handed over, "Marked ready to hand over.".
6. The last `collected` record handed over through the API meanwhile: "Some
   cash changed" and the list reloaded.
7. The dispatcher received one record through the admin API: My cash listed
   it under "Handed over (last 7 days)" as "Received by Demo Dispatcher".
8. One record's due time moved into the past on the throwaway database: the
   red "Overdue" notice on My cash, the "Overdue" chip on the record, and the
   home card's "Overdue".

Not on the real backend: the Keke app's wording ("Collected by rider", the
mock tests cover it), "This order is no longer yours" and "Not sent" (the
logic and adapter tests cover them).

## 10. Known limitations

- **Corrections are not shown to the driver.** The server also sends
  `original_amount_minor_units` and `corrected_at` (payments amendment 3);
  the boards show only the current amount, so the client ignores them.
- **A finished job's card is reachable only today**: My jobs lists finished
  jobs on the day they ended, and a delivered job's own address answers 404.
- "Hand over cash" is offered offline too; the request then shows "Not sent".
- **The mock's amount due** is the customer order's total when the job came
  from one, else the sample price for the job's water; seeded history paid
  before the cash flow has no card.
