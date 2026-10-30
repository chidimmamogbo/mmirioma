# Prompt 16: reviewing and deciding held orders in the admin app

Issue: [#128](https://github.com/mmiri-oma/mmirioma/issues/128) ·
Requirements: FR-012, FR-034, FR-035, FR-036, FR-038, FR-044, BR-06, BR-12,
BR-13, BR-14, NFR-004, NFR-012, NFR-020, NFR-021, SRS §8 · Acceptance tests:
T-14, T-23 · Contract (agreed, G3):
[deliveries.md](../../api/deliveries.md#admin-hold-review-endpoints), "Admin
hold review endpoints" · Backend: built in #93 and #112 · Build: a link issue
opened after G2 (#17 was closed and re-scoped, see #130). The order-detail
"Cancel this order" entry point is #129.

**Why this prompt:** a driver's job can stop on a **hold** (alternative
proof waiting for an administrator, a pickup that used another source or
raised a safety concern, an unsafe stop). The backend lets an administrator
find held orders and decide them, but the fork's admin screens (design
handoff v1) have **no way to see a hold or decide one**: `a-orders` has no
"on hold" state, and the mock "Cancel this order" promises things the agreed
cancel does not do. Without these screens a held job can never finish.

**What already exists:** the upstream repo approved a hold review design
(`docs/design/admin-hold-review.md` in mmiri-oma/mmirioma, #88; the fork's
contract and feature doc link to it, but the file did not come across). This
prompt designs the same decisions **again for the fork**, in the **fork's
look** (design handoff v1), from the **agreed contract only**.

**Before using:** this fork's visual system is the **design handoff v1**
([handoff-v1.md](../handoff-v1.md); the pack is kept locally under `design/`,
git-ignored), admin patterns `a-*` (sidebar shell, tables, the `a-orders`
side panel, cards, key-value rows, chips, notices, `MiniButton`), and the
side sheet and dialogs of [admin-confirm-order.md](../admin-confirm-order.md)
(720 px at 1280, full screen at 360 with the buttons fixed at the bottom). It
replaces [00-design-system.md](00-design-system.md) here. Add a component only
when a screen truly needs one, and say so.

Paste everything inside the block into Claude Design (or use it as the spec
for a clickable preview, as for [admin-confirm-order.md](../admin-confirm-order.md)).

```text
Using the MmiriOma admin design already in this project (design handoff v1:
the sidebar shell, the Orders page with its table, pills and right-hand panel,
the side sheet and dialogs of the confirm-order design, cards, key-value
rows, chips, notices; Plus Jakarta Sans), design how a DISPATCHER FINDS AND
DECIDES HELD ORDERS. Desktop first at 1280px; also show 360px (dispatchers
sometimes use a phone).

CONTEXT
Customers in Enugu order water deliveries; drivers collect water at a source
and deliver it. Sometimes the driver's job STOPS and waits for a dispatcher.
This is called a HOLD. It is not an order status: the order keeps its status
(for example Unloading) while the hold is open, and the driver cannot take
the next step until a dispatcher decides. Three kinds:
  1. PROOF REVIEW: the customer could not give the delivery code, so the
     driver sent alternative proof. The dispatcher approves it (the order
     becomes Delivered) or rejects it (the driver sends a new code).
  2. SOURCE REVIEW: at pickup the driver used a different source than the
     assigned one, or flagged a safety concern. The dispatcher continues (only
     when the source can be used for the order's water category), fails the
     delivery, or cancels the order.
  3. UNSAFE STOP: the driver reported unsafe access or an unsafe transfer and
     stopped. The dispatcher resumes once there is a safe alternative, fails
     the delivery, cancels the order, or (before the driver has left) takes
     the job back.
Only a dispatcher or administrator decides. Payment is cash on delivery and a
hold decision never changes payment.

PRODUCT HONESTY RULES (every screen)
- Show only what the server sends. Never invent a field, a reason, a price or
  a rule. A value the server does not send is "Not recorded", not a guess.
- The delivery code is NEVER shown, only whether it was issued, whether the
  SMS was accepted, the attempts used and whether it expired.
- No live tracking and no map. A shared location is text only: latitude,
  longitude and accuracy, and only when the driver shared it with consent;
  otherwise "No location shared". Never a route.
- Source eligibility is the server's sentence, shown as written. Never "safe",
  "clean", "purified", "drinking" or "potable" on your own.
- A decision is final once sent and is recorded with the dispatcher's name and
  time. Never say the customer or the driver was notified: nothing notifies
  the driver, and no cancellation message is sent to the customer yet (the
  dispatcher tells the customer).
- A fail or a cancel here never charges the customer: no redelivery fee is
  recorded, and the amount shown for a cancel is the server's sentence.
- Minimum customer data: name and phone only where a dispatcher must call the
  customer; no other personal data.
- Label every sample name, phone, amount and source "SAMPLE DATA"; phones look
  like 0800 000 0001.
- Keep everything typed after any error (NFR-012).

SCREENS AND STATES

R0. ORDERS PAGE (a-orders): FINDING HELD ORDERS
  - A pill "On hold (n)" next to the existing pills. n is the number of
    orders with an open hold. It lists every held order, whatever its status.
  - A held order keeps its status chip and gets a second amber chip "On hold"
    and, below the status in the table, "Proof review", "Source review" or
    "Unsafe stop" and "12 minutes ago". The hold shows in every pill, not only
    in "On hold".
  - Panel banner (amber card) on a held order: "On hold: Proof review",
    "Since 08:48 · 12 minutes ago", "Driver: Sample Driver One", button
    "Review". Times are Africa/Lagos. No "Assign a rider" on a held order.
  - States: loading; error ("We couldn't load the orders.", Try again);
    "On hold" empty ("No orders are on hold.").

THE REVIEW SHEET (R1, R2 and R3 share it; side sheet at 1280, full screen at
360, buttons fixed at the bottom)
  Header: the hold kind ("Proof review", "Source review", "Unsafe stop"),
  "Order MO-7KQ2M9XH4T · Unloading", "Driver: Sample Driver One", "On hold
  since 08:48 (12 minutes ago)". The customer's name and phone as a call link
  (from the order, for the dispatcher to call). Close button.
  Sections, in order: the evidence for this kind (R1, R2 or R3), "Other
  reports from the driver" (each: type, time, note; "No other reports" when
  empty), then the decision.
  States for the sheet: loading; "This order has no open hold." with Refresh
  (it was decided meanwhile; the page refreshes); "We couldn't load the
  review." with Try again; no connection.
  After any successful decision: the sheet closes, a toast says what
  happened, the banner is gone, and the history shows the decision.

R1. PROOF REVIEW (alternative proof)
  Evidence: "Delivered: 1,000 L"; "Why there is no code": "Customer cannot
  receive the code" or "Other"; "Driver's note" in quotes; times: Arrived,
  Unloading completed, Proof sent; "Delivery code": "Issued 08:44 · SMS
  accepted (or SMS not accepted) · 3 of 5 attempts used · Expired (or Not
  expired)" and "The code itself is never shown." or "No code was issued.";
  "Contact attempts": the times, oldest first, or "No contact attempts
  recorded"; "Location": text or "No location shared".
  Decision: two buttons, "Approve proof" and "Reject proof".
    Approve form: "How did the customer confirm?" radio: "Phone call with the
    customer", "Customer confirmed in person to staff", "Other" (details
    required); "When did the customer confirm?" date and time (not in the
    future, not before unloading was completed); "Details" optional, 500
    characters; "Your note" required, 1 to 500 characters with a counter
    ("What did you check?"). Confirm dialog: "Approve this proof? The order
    becomes Delivered with 1,000 L. Payment is not changed by this decision."
    Buttons "Approve proof", "Back".
    Reject form: "Your note" required, 1 to 500 ("Why is this proof not
    accepted?"). Confirm dialog: "Reject this proof? It no longer counts and
    the order stays Unloading. The driver can send the customer a new code and
    submit proof again. If the customer still cannot confirm, fail the
    delivery (Other, with a note)." Buttons "Reject proof", "Back".
  Errors: "You can't approve proof for a delivery you made." (the signed-in
  dispatcher is the delivering driver or recorded the proof; Reject stays
  available); "This order has changed." with Refresh (hold already decided, or
  the order is no longer Unloading); a 422 under its field; no connection (the
  form is kept).

R2. SOURCE REVIEW
  Evidence: "Assigned source": name and approximate location, or "No source
  assigned"; "Used": "The assigned source" or "Another source: <name the
  driver typed>"; "Source reference" (the driver's), "Collected: 3,000 L",
  "Picked up 07:50"; "Safety concern": "No safety concern flagged." or an
  amber notice "The driver flagged a safety concern at pickup." with "Driver's
  note" in quotes. Card "Can this source be used?": a chip and the server's
  sentence as written, three answers: Eligible (green, "Can be used"), Not
  eligible (red, "Cannot be used"), Cannot check (amber, "Cannot be checked").
  Decision: "Continue delivery", "Fail delivery", "Cancel order".
    Continue is enabled only when the answer is Eligible; otherwise it is
    disabled with "Continue is only possible when the source can be used. Fail
    or cancel the order instead."
    Continue dialog: "Continue the delivery?" note required 1 to 500 ("Why is
    it fine to continue?"); "The driver can continue to the customer."
    Buttons "Continue delivery", "Back".
  Errors: the server re-checks when you continue. If the source can no longer
  be used, the refusal shows the SERVER'S sentence as written and the card
  updates to the new answer; "This order has changed." with Refresh; a 422; no
  connection.

R3. UNSAFE STOP
  Evidence: "Reported: Unsafe access" or "Unsafe transfer"; "Driver's note" in
  quotes; "Reported 09:02, while the order was Unloading".
  Decision: "Resume delivery", "Fail delivery", "Cancel order", and, only when
  the order is still "Driver accepted" (the driver has not left), "Withdraw
  job".
    Resume dialog: note required 1 to 500, labelled "Safe alternative" with
    "Say how the driver can continue safely."; "The job continues from where
    it stopped." Buttons "Resume delivery", "Back".
    Withdraw dialog: note optional 500; "Take the job back from Sample Driver
    One? The order goes back to Confirmed and the job leaves the driver's
    list. This also closes the unsafe stop. Nothing notifies the driver."
    Buttons "Withdraw job", "Back".
  Errors: "This order has changed." with Refresh; "This order has no driver
  assigned" (withdraw, nobody to take it back from); a 422; no connection.

FAIL (dialog; from R2 and R3, and from an order that is Driver accepted or
  later, with no hold, because a rejected proof can end in a failed delivery)
  Title "Fail this delivery". Reason radio: "Source quality concern", "Unsafe
  access", "Other" (a note is required). Note optional, 500, counter. Text:
  "The delivery attempt is recorded as failed and the driver's job ends. No
  redelivery fee is recorded. The driver is not notified: their app shows the
  change when it next loads. Rescheduling is not part of this screen." From a
  hold add: "This also closes the <kind> hold." Buttons "Fail delivery"
  (danger), "Back". Submitting locks the dialog.
  Errors: "This order has changed." with Refresh; a 422 under the note; no
  connection (kept; a repeat after it succeeded shows "This order has
  changed."); "Your security check failed. Reload the page."

CANCEL (dialog; from R2 and R3; #129 adds the entry from the order detail)
  Title "Cancel this order". Fixed reason line "Reason: MmiriOma is unable to
  deliver" (not a choice). Then the server's sentence about the cost to the
  customer, as written, for example "The customer is not charged for this
  cancellation." Note optional, 500. Text: "The driver's job ends and leaves
  their list. Nothing notifies the driver. No cancellation message is sent to
  the customer yet: tell them yourself." From a hold add: "This also closes
  the <kind> hold." Buttons "Cancel order" (danger), "Back". "Cancel order" is
  disabled until the server's sentence has loaded.
  States: loading the sentence; "We couldn't check what this costs the
  customer." with Try again (Cancel order stays disabled); "This order can no
  longer be cancelled."; "This order has changed." with Refresh; a 422;
  no connection.

H. ORDER HISTORY (hold entries)
  The history timeline gains: "Hold opened: Source review" (driver, time, the
  driver's note, and the kind of concern in words), and the decision: "Proof
  approved", "Proof rejected", "Source continued" or "Delivery resumed after
  unsafe stop", each with the dispatcher's name, time and note. A hold closed
  by a failure, a cancel or a withdraw has no decision entry: the status
  change that closed it is already in the timeline.

COMMON
  - Toasts: "Proof approved. The order is now Delivered." / "Proof rejected.
    The driver can send a new code." / "Continued. The driver can go on to the
    customer." / "Resumed. The driver can continue." / "Delivery marked as
    failed." / "Order cancelled. Tell the customer." / "Job withdrawn. The
    order is back to Confirmed."
  - Touch targets at least 44px; every status shows a word, never colour alone.
  - Show the sheet and every dialog at 1280 and 360.

OUTPUT
The 1280px and 360px frames for every screen and state, with the exact copy.
Name components as in the handoff so developers can map them to the existing
React and Tailwind v4 components.
```

## Field rules (from the contract)

| Item | Rule | Source |
| --- | --- | --- |
| Which orders | `GET /admin/orders?on_hold=true`; the page's `total` is the On hold count. `hold` on the order: `null` or `{ id, kind, since }`, the job's oldest open hold | deliveries.md, "Hold object on admin orders (R0)" |
| One hold at a time | The oldest open hold is shown; a decision names it (`hold_id`) and closes every open hold of that kind on the job; if another kind is still open it becomes the one shown | "Hold review rules" |
| Evidence | `GET /admin/orders/{reference}/hold`: `HoldReview`; only the part for the kind is set (`proof`, `pickup` with `source_eligibility`, or `report`); 404 `hold_not_found` "This order has no open hold" | "HoldReview object" |
| Proof | `delivered_litres`, `reason` (`customer_cannot_receive_code`, `other`), `driver_note`, `arrived_at`, `unloading_completed_at`, `sent_at`, `delivery_code` (never the code), `contact_attempts` (times), `location` or `null` | same |
| Approve / reject | `POST /admin/orders/{reference}/proof-overrides`: `hold_id`, `decision`, `customer_acknowledgment` (**required for approve, absent for reject**: `method` `phone_call` / `in_person_to_staff` / `other` (note required), `confirmed_at` not in the future and not before unloading was completed, `note` up to 500), `note` 1 to 500 | "POST .../proof-overrides" |
| Own delivery | 403 `own_delivery_override` "You can't approve proof for a delivery you made." (approve only; BR-13, T-23) | same |
| Source eligibility | `eligible`, `not_eligible` or `cannot_check` with the server's message, shown as written | "Source eligibility (R2)" |
| Continue | `POST .../hold/continue`: `hold_id`, `note` 1 to 500; only when eligible, re-checked; 409 `source_not_eligible` with the message and `details.answer` | "POST .../hold/continue" |
| Resume | `POST .../hold/resume`: `hold_id`, `note` 1 to 500 = the safe alternative | "POST .../hold/resume" |
| Withdraw | `POST .../withdraw` with `expected_status: accepted`, optional `note`; offered only when `withdraw_allowed` (order `accepted`); also closes the unsafe stop; 404 `assignment_not_found` "This order has no driver assigned"; 409 `invalid_order_transition` | "POST .../withdraw (change)" and "Admin dispatch" |
| Fail | `POST .../transition`: `to: failed`, `expected_status` (the status the dispatcher saw), `reason_code` `source_quality_concern` / `unsafe_access` / `other` (note required for `other`), optional `note`, optional `hold_id` (an open hold of the order); no redelivery fee; every open hold closed; rescheduling is R4, design ahead | "POST .../transition (fail and cancel)" |
| Cancel | `GET .../cancellation-outcome?reason_code=mmirioma_unable` (`message` shown as written; 409 when it cannot be cancelled), then `POST .../transition`: `to: cancelled`, `reason_code: mmirioma_unable`; the job leaves the driver's list; nothing notifies the driver; no customer message yet | same |
| Errors | 409 `hold_not_open` ("This hold has already been decided or has changed"), 409 `invalid_order_transition`, 404 `order_not_found`, 422 `validation_error` per field, 403 `csrf_failed`, shared 401 and 403 | "Error codes added by this section" |
| History | `GET .../history?include=holds`: `kind` `status_change`, `hold_opened` or `hold_decided`; `hold.category`, `hold.decision`; labels from the design | "GET .../history (change)" |

## After generating

1. Check every screen and state exists and the honesty rules hold.
2. Record the result in `docs/design/admin-hold-review.md` from the
   [template](../_template.md), with the screen-to-endpoint table and a
   clickable preview link.
3. Anything the design needs that the contract lacks is an open question,
   not a new field.
4. G2 by one reviewer who is not the designer. Then open the link issue.
