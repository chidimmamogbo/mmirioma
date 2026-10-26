# Prompt 12: cash collection, remittance and reconciliation

> **Reference copy** from the main repo (`mmiri-oma/mmirioma@adc8654`), kept for
> [driver-cash.md](../driver-cash.md), which reuses its approved K1 and K2. Links to other
> main repo design documents point to files that are not in this fork.

Issue: [#98](https://github.com/mmiri-oma/mmirioma/issues/98) · Production
plan step 4 · Requirements: FR-040 (pay on delivery only, fallback F4),
FR-041 (cash part), FR-050 (payment acknowledgment SMS, P0), BR-12, BR-15,
NFR-004, NFR-012, NFR-020, NFR-021, NFR-032 · Acceptance tests: T-14, T-21,
T-24 · Contract: none yet. `POST /driver/jobs/{id}/cash-collection` and
`POST /admin/cash-reconciliations` are illustrative in SRS §6 only; the
contract is written from this design (G3) · Backend: none. There is no
`cash_collections` table and orders have no payment status yet; the
`audit_logs` table (#96) and `order_exceptions` exist.

**Why this prompt:** the pilot is pay on delivery only (fallback F4), so
cash is the only payment, and T-14 needs reconciliation shown without
database edits. Today nothing records the cash: the driver design left it
out on purpose ([driver-deliveries.md](../driver-deliveries.md), decision 2:
"a cash collection screen still needs its own design"), and the admin app
has no payment view.

The cash rule is fixed by SRS FR-041 and BR-15:

- the driver collects cash **after unloading** and records the amount;
- the driver remits the cash to an administrator (the finance officer is an
  administrator, not a separate role) **before 6:00 PM Africa/Lagos** every
  day; cash collected after 6:00 PM is remitted the next day, and every day
  is an operating day;
- each collection moves `collected → awaiting_remittance → remitted →
  reconciled`, and only authorized staff mark it remitted and reconciled;
- discrepancies are recorded as exceptions;
- the order's payment status is separate from its order status (BR-12):
  an order can be `delivered` with payment outstanding (T-24).

Out of scope (agreed fallbacks): Paystack and bank transfer (F4), refunds
(F7, recorded outside the app), cost recording (F6, measurement sheet).

It extends the approved [driver deliveries](../driver-deliveries.md),
[admin dispatch](../admin-dispatch.md) and
[admin order confirmation](../admin-order-confirmation.md) designs, which
stay as they are.

**Before using:** open the team Claude Design project ("MmiriOma Design
System") so these screens reuse the design system, the driver job screens
(A1-A8), the admin layout, the order detail and the history. If the canvas
cannot be written from your account, follow LOG.md (2026-10-22, "Prompt 08
could not be run on the team design canvas").

**Open questions 1-4 are decided** (technical lead, 2026-10-22: the
recommended answers; see the end of this file), and the block below follows
those decisions. Questions 5-9 were decided after the prompt was run; answer
6 added a "Correct amount" step to K4, which is on the canvas but not in the
block below.

Paste everything inside the block into Claude Design.

```text
Using the MmiriOma design system and the driver and admin screens already
in this project (reuse their tokens, components, driver job card and step
screens, admin layout, order detail, check list, history and badges; if a
screen truly needs a new component, add it to the system and say so),
design CASH COLLECTION, REMITTANCE AND RECONCILIATION for two apps:
- the DRIVER app: mobile first at 360px on an entry-level Android phone on
  a slow network; show 412px too;
- the STAFF (administrator) web app: desktop first at 1280px; show every
  screen and dialog at 360px too.

CONTEXT
MmiriOma delivers water in Enugu, Nigeria. During the pilot every order is
pay on delivery: the customer pays the driver in cash, only after the water
has been unloaded. The driver records how much cash they received. Every
day, before 6:00 pm (Lagos time), the driver hands the cash they collected
to an administrator acting as finance officer. The administrator counts it,
confirms they received it, and later reconciles it against the orders.
Cash collected after 6:00 pm is handed over the next day. Every day is a
working day.

Each cash collection has its own status, shown in words (client copy for
the labels; suggested):
- collected: "Collected by driver" (the driver recorded it, still holds it);
- awaiting_remittance: "Ready to hand over" (the driver listed it for a
  handover; still holds it);
- remitted: "Received by <administrator name>" (an administrator confirmed
  they have the cash);
- reconciled: "Reconciled" (an administrator matched it to the order).

The ORDER has two separate statuses, always shown side by side, never
merged: the delivery status ("Delivered", "Unloading", ...) and the payment
status. Payment statuses used in the pilot (client copy for labels):
- pending_collection: "Pay on delivery: cash after unloading";
- partially_paid: "Part paid", with the outstanding balance;
- paid: "Paid".
An order can read "Delivered" while payment is still "Pay on delivery" or
"Part paid". Delivery never waits for payment.

RULES (must be followed in every screen)
- Cash is recorded only after unloading. Before the driver has completed
  unloading, the driver app does not offer "Record cash".
- The driver never sets or changes the amount due. It comes from the
  server (the order's agreed total, labelled "Manual quote" as in the
  confirmation design). The driver types only the cash they received.
- Money: ₦ first, commas, two decimals ("₦45,000.00"). The driver and the
  administrator type whole naira only (no kobo field); show the formatted
  amount as they type.
- No false confirmation. A collection is "Collected by driver" only after
  the server records it; "Received" only after an administrator confirms
  it; "Reconciled" only after an administrator reconciles it. Never show
  "Paid" before the server says the payment status is paid.
- The payment acknowledgment SMS to the customer is shown as sent only if
  the server says the provider accepted it. If not, show a warning (client
  copy, e.g. "The payment SMS could not be sent. Call the customer to
  tell them."). The SMS never changes any status.
- Times are Africa/Lagos, 12-hour with lower-case am/pm; dates include the
  weekday and year ("Tue 27 Oct 2026, 6:00 pm").
- No water-quality claims: never "safe water", "clean", "purified",
  "potable", "drinkable".
- No live map or tracking.
- Simulated (demo) orders keep their "Simulated" tag everywhere (BR-09).
- Show only the customer data each user needs: the driver sees the order
  reference and the receiver's first name and last initial; the
  administrator sees reference, customer name and phone.
- Every status, warning and difference is words plus an icon, never colour
  alone; touch targets at least 48px; every dialog has a visible title, a
  Cancel button, and returns focus to the button that opened it.
- No double submit. On an error, keep everything the user typed (NFR-012).
- Server messages appear exactly as written below. Text marked "client
  copy" is yours to write; keep it plain and short.
- All names, phones, references, amounts and times are fictional and tagged
  "SAMPLE DATA". Use phone numbers like 0800 000 0001.

SERVER MESSAGES (use exactly)
- Order not found: "Order not found"
- Security check failed: "Security token missing or invalid. Reload the page
  and try again."
- No connection: "Unable to reach the server. Check your connection and try
  again."
- Cash already recorded for this order: client copy, e.g. "Cash for this
  order is already recorded." with the recorded amount from the server.
- Unloading not complete: client copy listing what is missing, from the
  server's list (unloading completed).
- The collection changed meanwhile (another administrator received or
  reconciled it): client copy such as "This cash record has changed.
  Refresh to see its current status." with a "Refresh" button.
- A field the server refuses (amount out of range, note too long): show the
  server's message under that field.

=== BUILD NOW: DRIVER APP ===

SCREEN K1: Record cash (after unloading)
Reached from the job once unloading is complete (A5 "Complete delivery"
and the A7 outcome panels "Delivered" and "Waiting for proof approval").
A "Cash" card on the job shows:
- "Amount due" from the server, labelled "Manual quote", e.g.
  "₦45,000.00" (SAMPLE DATA);
- the button "Record cash" (primary).
If the job ended without unloading (cancelled, delivery failed), there is
no Cash card.

The form:
1. "Cash received" in whole naira. Helper text (client copy): count the
   cash with the customer before you record it.
2. If the amount is LESS than the amount due: a warning (client copy, e.g.
   "Less than the amount due. ₦5,000.00 will show as outstanding.") and a
   required note "What happened?" (up to 500 characters with counter).
3. If the amount is MORE than the amount due: a warning (client copy, e.g.
   "More than the amount due. The office will review the difference.") and
   a required note.
4. If the customer paid nothing: the driver enters ₦0.00; the same warning
   and required note as 2 (client copy).

Action: "Record cash" opens a dialog: "You received ₦45,000.00 in cash for
MO-1042. You can't change this after you record it." Buttons "Record cash"
and Cancel.

States:
- default (empty);
- amount equal to amount due;
- less than due (warning, note required);
- more than due (warning, note required);
- nothing paid (₦0.00, note required);
- sending (locked, button busy);
- recorded: the Cash card reads "Collected by driver: ₦45,000.00 at
  2:15 pm", "Hand over by Tue 27 Oct 2026, 6:00 pm" from the server. No
  payment SMS at this step: it goes out when an administrator receives the
  cash;
- already recorded (from the server; shows the recorded amount, no form);
- unloading not complete (from the server; no form);
- offline: the form stays filled, "Record cash" is off with "No connection"
  until online; nothing is shown as recorded until the server answers;
- not sent (no connection mid-send; everything kept, retry);
- order not found (job reassigned).

SCREEN K2: My cash (driver menu item "Cash")
- The driver's total cash on hand now (collected and ready to hand over),
  e.g. "₦92,500.00 to hand over" (SAMPLE DATA).
- "Hand over by" time from the server: today 6:00 pm, or tomorrow 6:00 pm
  for cash collected after 6:00 pm. If the time has passed, an "Overdue"
  label with an icon (client copy). The due time and the overdue flag come
  from the server; the app never computes them.
- A list of the driver's collections, newest first: order reference, time
  collected, amount, status label. Group by "To hand over" (collected and
  ready) and "Handed over" (received, reconciled; last 7 days).
- Action "Hand over cash" (primary): opens a handover sheet listing the
  "Collected by driver" records with tick boxes (all ticked by default) and
  their total. "Ready to hand over" moves the ticked records to "Ready to
  hand over". The sheet says the cash is still the driver's responsibility
  until an administrator confirms receiving it (client copy).
States: no cash to hand over (empty, client copy); loading; list; overdue;
handover sending; handover done (records now "Ready to hand over");
the collection changed meanwhile (Refresh); offline; not sent.

=== BUILD NOW: STAFF (ADMINISTRATOR) APP ===

SCREEN K3: Cash page (sidebar "Cash")
For one operating day (date picker, default today, Africa/Lagos):
- Summary across drivers: cash recorded by drivers, received, reconciled,
  still with drivers, and the number of differences. Each as a figure with
  a word label (SAMPLE DATA).
- One row per driver who has cash records that day or still holds cash
  from an earlier day: driver name, vehicle, amount still with the driver,
  amount ready to hand over, "Hand over by" time and an "Overdue" label
  (from the server), last received time. Action per row: "Receive cash".
- A second list: collections received and not yet reconciled, with
  "Reconcile" per collection and "Reconcile selected".
States: loading; no cash records for the day (empty, client copy); list;
a driver overdue; no connection; security check failed.

SCREEN K4: Receive cash from a driver (dialog or side sheet)
- Driver name, and the driver's "Ready to hand over" and "Collected by
  driver" records, each with order reference, collected time, recorded
  amount. The administrator ticks the records they are receiving (the
  ready ones ticked by default).
- "Total recorded by the driver" for the ticked records.
- "Cash counted" in whole naira (required).
- If counted is different from recorded: a difference line ("₦2,000.00
  short" or "₦2,000.00 over", words plus icon) and a required note. The
  difference is saved as an exception for review; it never changes the
  driver's recorded amounts.
- Action "Confirm received": dialog "You confirm you have received
  ₦92,500.00 in cash from <driver name>." Buttons "Confirm received" and
  Cancel.
States: default; counted equals recorded; short; over; sending; received
(toast, records now "Received by <your name>", difference exception shown
if any, and the payment SMS outcome per order: sent, or the warning); the collection changed meanwhile (Refresh, ticked records kept
where still valid); field errors; no connection; security check failed.

SCREEN K5: Reconcile (dialog, one or several received collections)
For each collection: order reference, customer name, amount due (manual
quote), cash recorded by the driver, cash received, and the payment
status the server set when the cash was received ("Paid", or "Part paid"
with the outstanding balance, or "More than due: review"); reconciling
does not change it. An optional note.
Action "Reconcile" (confirm dialog). States: default; mismatch rows
flagged (words plus icon); sending; reconciled (toast, records "Reconciled");
changed meanwhile (Refresh); no connection; security check failed.

SCREEN K6: Order detail, payment section (Confirmed and later)
A "Payment" card next to the confirmed summary, separate from the delivery
status:
- payment method "Pay on delivery: cash after unloading";
- payment status badge (Pay on delivery / Part paid / Paid) and, for
  part paid, the outstanding balance;
- the cash collection, once recorded: amount, collected by <driver> at
  <time>, status (Collected by driver / Ready to hand over / Received by
  <name> at <time> / Reconciled by <name> at <time>), the driver's note,
  any difference exception, and the payment SMS outcome.
Show it for: delivered with cash not yet recorded; delivered and collected;
delivered, part paid; delivered, paid and reconciled; waiting for proof
approval with cash recorded. The delivery status badge stays exactly as it
is in every case.

HISTORY (extend H1 from prompt 06)
Each cash step appears in the order history with who and when: "Cash
recorded ₦45,000.00" (driver), "Ready to hand over" (driver), "Cash
received" (administrator), "Reconciled" (administrator), "Payment status:
Paid" (system, with the step that caused it), and "Payment SMS sent" or
"not sent". A difference shows its note.

=== DESIGN AHEAD (tag each "Design ahead - not in current build") ===

SCREEN K7: Other payment methods on the payment card (Paystack, bank
transfer, refunds). Show only how K6 makes room for more than one payment
line; nothing here is built now.

DELIVERABLE
All screens, sheets, dialogs and states above at the sizes given, annotated
with which field or server response each element uses (amount due, cash
received, collection status, due time, overdue flag, received by, counted
amount, difference, reconciled by, payment status, outstanding balance, SMS
outcome, error). End with the labels proposed for the collection statuses,
the payment statuses and the differences, the list of components used, and
any new component or token added to the design system.
```

## After generating

1. Check every build-now screen and state exists, messages match, "Record
   cash" never appears before unloading is complete, the driver never edits
   the amount due, nothing reads "Paid", "Received" or "Reconciled" before
   the server says so, the delivery and payment statuses are always shown
   separately, and there are no water-quality claims.
2. Record the result in `docs/design/cash-remittance.md` using the
   [template](../_template.md). @Cloudcrackamara reviews it for
   design-system consistency; the technical lead approves it (G2). In
   `docs/design/driver-deliveries.md`, note that decision 2 is answered by
   this design.
3. The screen-to-endpoint table becomes the payments contract (G3), a new
   `docs/api/payments.md`, agreed with the frontend and backend owners.
   Expected needs, all **to be agreed** (nothing here is a contract yet):

   | Screen | Needs |
   | --- | --- |
   | K1 Cash card | On `GET /driver/jobs/{reference}`: the amount due in kobo (the order's total), whether cash can be recorded (`allowed_actions` gains `record_cash` once `unloading_completed_at` is set and no collection exists), and the collection once recorded. The driver sees no other payment data |
   | K1 Record cash | `POST /driver/jobs/{reference}/cash-collection` with `amount_minor_units` (whole naira, ≥ 0) and a `note` required when it differs from the amount due. Creates one `cash_collections` row (`collected`) per order; a repeat is 409 (exact code to agree) with the recorded amount, and a matching `Idempotency-Key` replay returns the first result (NFR-011). 409 `transition_requirements_unmet` with `details.missing` `unloading_completed`; 404 `order_not_found`; 422 `validation_error`. Audited (NFR-004) |
   | K2 | A driver read of their own collections with status, `remittance_due_at` (6:00 PM Africa/Lagos on the collection day, or the next day after 6:00 PM, computed by the server) and an overdue flag; `POST` to move the driver's chosen `collected` rows to `awaiting_remittance` (question 1) |
   | K3 | Admin read per operating day: totals, per-driver rows (held, ready, due time, overdue), received-not-reconciled list |
   | K4 | `POST /admin/cash-reconciliations` (SRS §6) or a remittance endpoint: collection ids, counted amount in kobo, note; moves them to `remitted` with `received_by` and `remitted_at`, sets each order's payment status and sends the acknowledgment SMS (question 2); a difference is recorded as an exception (stored on the remittance record: [payments.md](../../api/payments.md#decisions), decision 1); only admins; 409 when a collection is no longer in a receivable state |
   | K5 | Admin reconcile: collection ids and optional note; moves `remitted` → `reconciled` with `reconciled_by` and `reconciled_at`; the payment status was already set at receipt (K4, question 2) |
   | K6, History | On `AdminOrderDetail`: `payment_method`, `payment_status`, `outstanding_balance_minor_units`, the cash collection with its custody fields and exceptions, SMS outcome; each step in `order_events` or `audit_logs` |
   | Data | `cash_collections` (SRS §5: id, order_id, driver_id, amount in kobo as `BigInteger`, status, collected_at, remitted_at, received_by, reconciled_at, reconciled_by); on `orders`, `payment_method` and `payment_status` (set to `pay_on_delivery` / `pending_collection` at confirmation for every pilot order) and the outstanding balance; every custody change written to `audit_logs` in the same transaction |
   | SMS | The payment acknowledgment (FR-050, P0) through the messaging module after the commit, with its outcome on the response (question 2 decides which step sends it); a failure never undoes the step |

4. Open the build issues (backend, driver screens, admin screens) once G2
   and G3 are passed. The issue's acceptance criteria apply to the backend
   build: integer kobo, every transition audited, tests for each status
   change, the 6:00 PM rule, duplicates and access control, migrations
   reviewed and tested.

## Open questions for the technical lead

The SRS fixes the four statuses and who may mark `remitted` and
`reconciled`, but not what each step means in the app. Questions 1-4 change
the screens and were decided by the technical lead on 2026-10-22 (the
recommended answers). Questions 5-9 were decided later the same day by the
technical lead, with @Cloudcrackamara reviewing the design; answer 6 added
a correction step to K4, drawn on the canvas after this prompt was run (see
[cash-remittance.md](../cash-remittance.md)).

1. **Decided 2026-10-22: option (a).** The driver moves their chosen
   `collected` records to `awaiting_remittance` with "Hand over cash" (K2).

   **What moves a collection from `collected` to `awaiting_remittance`?**
   (a) the driver lists it for a handover ("Hand over cash", K2);
   (b) the server, straight after recording, so `collected` lasts an
   instant; (c) the server at 6:00 PM for the day's cash. **Recommended:
   (a).** It gives the administrator a list of what the driver says they
   are bringing, and it is the only option where the two statuses differ in
   practice. With (b) or (c), K2 loses the "Hand over cash" action.
2. **Decided 2026-10-22: option (a).** The order's payment status changes,
   and the acknowledgment SMS is sent, when an administrator confirms
   receiving the cash (`remitted`, K4). Until then it stays
   `pending_collection`.

   **When does the order's payment status change, and when is the
   acknowledgment SMS sent?** FR-041: the customer gets an acknowledgment
   "for each verified payment", and "only authorized staff confirm ... cash
   handovers"; FR-040: payment status is never inferred from a customer
   upload or a redirect. Options: (a) at **remitted** (an administrator has
   the cash); (b) at **reconciled**; (c) at the driver's record (the
   customer gets a receipt at the door, but no staff member has verified
   anything). **Recommended: (a)**, which matches "staff confirm cash
   handovers". The cost is that the customer may get the SMS hours after
   paying. Until then the payment status stays `pending_collection`.
3. **Decided 2026-10-22: as designed.** The driver gives a required note
   when the amount differs from the amount due; no exception is opened at
   the driver step. Exceptions come from a difference at K4 (counted
   against recorded) and are flagged at K5. One collection per order. How
   an outstanding balance is collected afterwards is split out as question
   9.

   **Amount different from the amount due.** FR-041 says underpayments are
   `partially_paid` with the outstanding balance and overpayments are
   "flagged for refund review". The design asks the driver for a note and
   saves no exception at the driver step. Should a driver-recorded
   difference also open an `order_exceptions` row straight away, or only at
   reconciliation? And who collects an outstanding balance (a second
   collection for the same order, or outside the app under F7)? The design
   allows one collection per order.
4. **Decided 2026-10-22: as designed.** ₦0.00 is a valid collection with a
   required note; the payment then follows question 2 (`partially_paid`
   with the full balance outstanding once received).

   **Customer pays nothing.** Is ₦0.00 a valid collection (status
   `collected`, payment then `partially_paid` with the full balance
   outstanding), or a separate "not paid" report that only opens an
   exception? The design shows ₦0.00 with a required note.
5. **Decided 2026-10-22:** an alert only; nothing is blocked in the pilot.

   **Overdue cash.** The SRS sets the deadline but no consequence. The
   design shows "Overdue" from a server-computed due time and blocks
   nothing. Should overdue cash block the driver's next job offer, or only
   alert the administrators? No new status is proposed.
6. **Decided 2026-10-22:** an administrator can correct the recorded
   amount before receiving the cash, with a required reason, audited, the
   original amount kept in the history (K4). The payment status and SMS use
   the recorded amount, so a typing mistake must be fixable.

   **Driver mistakes.** Once recorded, the driver cannot change the
   amount. A wrong figure surfaces at K4 as a difference exception. Is an
   administrator correction of the recorded amount needed for the pilot, or
   is the exception plus the measurement sheet enough?
7. **Decided 2026-10-22:** allowed; the history shows who did each step.

   **Reconciling the same day.** Can the administrator who received the
   cash also reconcile it? The SRS does not require two people. The design
   allows it.
8. **Decided 2026-10-22:** the migration sets the payment fields on orders
   `confirmed` or later and not `cancelled`; others stay empty until
   confirmed.

   **Which orders get a payment status.** Orders confirmed before this
   change have no payment fields. Recommended: the migration sets
   `payment_method` `pay_on_delivery` and `payment_status`
   `pending_collection` on orders that are `confirmed` or later, and leaves
   earlier orders unset until confirmation. This is a data migration and
   needs the reviewed plan CLAUDE.md asks for.
9. **Decided 2026-10-22: option (a),** recorded as fallback F9 in the
   pilot plan. The order stays "Part paid" with its balance on K6.

   **Collecting an outstanding balance** (split from question 3). With one
   collection per order, a `partially_paid` order cannot record a second
   cash payment in the app. Options: (a) the balance is collected and
   recorded outside the app, like refunds under F7; (b) a later
   collection for the same order is allowed, so the contract drops the
   one-per-order rule. Not designed here; the payment card (K6) shows the
   outstanding balance either way.
