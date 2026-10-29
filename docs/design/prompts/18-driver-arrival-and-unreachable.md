# Prompt 18: the driver's arrival and the unreachable customer (rider and driver apps)

Issue: [#250](https://github.com/chidimmamogbo/mmirioma/issues/250) ·
Requirements: FR-038 (P0), FR-035, FR-036, BR-14, NFR-020 · Acceptance test:
T-25 · Contract (agreed, G3): [deliveries.md](../../api/deliveries.md), driver
job part 2: `POST /driver/jobs/{reference}/arrive`, `POST
/driver/jobs/{reference}/contact-attempts` and `POST
/driver/jobs/{reference}/transition` (`failed`); design check rows A3, A4 and
A7 · Backend: built (#55, #67) · Build: a link issue opened after G2.

**Why this prompt:** the backend makes a driver who cannot reach the customer
record two contact attempts and wait the full 10 minutes from arrival before
the job can fail (FR-038, T-25). The fork's driver screens cannot do that. The
"customer" step has one button, "Arrived · water pumped in", and the code
screen's "Unloading done, send the code" then records arrival, starts unloading
and completes unloading in one tap. Two problems follow. There is no moment at
which the driver has arrived and is waiting, so the 10 minutes cannot start.
And the recorded arrival time is the time unloading finished, not the time the
driver arrived. Prompt 03 left the unreachable steps as "placeholder text
tagged SAMPLE DATA" because the policy was not written yet. It is written now.
Until this is built, the driver sends the existing "Customer not reachable"
problem report and the dispatcher ends the job with "Fail delivery" (a known
gap against FR-038 and T-25).

**What is already designed:** the whole partner trip (refill, loading, the
customer step, the code step, the done screen) and the problem report, in the
design handoff v1 ([handoff-v1.md](../handoff-v1.md)) and the cash screens of
[driver-cash.md](../driver-cash.md). This prompt changes the customer step and
adds the screens below it. It does not redesign the others.

**Before using:** open the project that holds the partner app preview. Reuse
its look: the trip screens `r-customer` and `r-otp` for the Keke rider app and
`t-customer` and `t-otp` for the tanker driver app, the problem report
`r-issue`, and the confirmation sheet of the cash screens. Add a component only
when a screen truly needs one, and say so. Paste everything inside the block
into Claude Design, or use it as the spec for a clickable preview.

```text
Using the MmiriOma partner app design already in this project (design handoff
v1: the rider and driver trip screens, the problem report, and the
confirmation sheet; Plus Jakarta Sans), design the steps from ARRIVING at the
customer to a FAILED DELIVERY when the customer cannot be reached. Phone only,
360px. Design every screen for both apps: the Keke rider app (words: rider,
Keke, cans) and the tanker driver app (words: driver, tanker, tank). Show the
rider version in full and list only the wording that differs for the driver.

CONTEXT
Riders and drivers use entry-level Android phones outdoors, often in sun, with
wet hands, on weak mobile data. Large touch targets (primary actions 56px),
high contrast, short labels, few typed fields. Today the customer step has one
button, "Arrived · water pumped in". This design splits it: first the partner
says "I have arrived", then they either unload or, if nobody answers, record
attempts to reach the customer and, after the full wait, fail the delivery.

THE RULE (FR-038, shown to the partner in plain words)
If the customer cannot be reached on arrival, the partner makes TWO contact
attempts, each recorded with its time, and waits the FULL 10 MINUTES from
arrival. Only then can the partner end the job as "customer not reachable".
Ending it earlier is not possible. The app never lets the partner skip either
condition.

PRODUCT HONESTY RULES (every screen)
- The app never tracks the partner. No arrival location is asked for or
  recorded in this version: no location prompt, no consent text, no "we know
  where you are".
- "I have arrived" records the time the partner pressed it. Never say the
  customer has been told they arrived. Never say the customer was called by the
  app: the partner calls from their own phone, and the app only records that
  they tried.
- An attempt is recorded only after the server confirms it. The time shown is
  the server's time, not the phone's. Never show an attempt as recorded while
  it is sending or after it failed.
- The "wait until" time comes from the server and is shown in Lagos time. If
  the phone's clock differs, the server wins: the fail button stays off until
  the server allows it.
- The fail button is off until BOTH conditions are met. There is no override,
  no "fail anyway", and no way to skip the wait. When it is off, say which
  condition is missing.
- Say nothing about money. No redelivery fee, no charge, no refund, no points.
  Say nothing about what to do with the water still on board: the rules for
  that are not written yet.
- No photo, no signature, no free-text reason: the reason is fixed ("Customer
  not reachable").
- All example names, phone numbers, addresses and references are fictional and
  tagged "SAMPLE DATA". Phone numbers like 0800 000 0001.

SCREENS AND STATES

U1. I HAVE ARRIVED (replaces the customer step's single button)
  The existing customer step (receiver's first name and last initial, "Call
  customer", the address, landmark and instructions, "Start navigation")
  keeps everything it has. Its primary button becomes "I have arrived". The
  words "water pumped in" are gone from this button.
  States: default; sending (button disabled, spinner, no double tap); not sent
  ("We could not record your arrival. Check your connection and try again."
  with Try again; nothing is shown as arrived); job paused ("This job is
  paused. The dispatcher will contact you." with the hold's message as the
  server sends it); job no longer yours ("This job was reassigned." and a
  button back to the dashboard, as in the existing reassigned state). Pressing
  the button twice, or opening the screen after arrival was already recorded,
  goes straight to U2 with the first arrival time.

U2. ARRIVED, WAITING OR UNLOADING
  Heading "You have arrived". Line "Arrived at 9:42 AM" (the server's arrival
  time, Lagos). The receiver's name, "Call customer", the address and the
  landmark stay visible. Two actions:
    1. Primary "Start unloading" (56px). Records the start of unloading, then
       opens the existing code screen, where "Unloading done, send the code"
       works as today and no longer records arrival.
    2. Secondary, outlined: "Customer not reachable". Opens U3.
  States: default; starting (disabled, spinner); not sent (Try again, nothing
  changes); job paused (the paused notice replaces both actions); "This job
  has changed. Refresh." with a Refresh button when the server says the job is
  not at this step.

U3. CUSTOMER NOT REACHABLE
  Top: back arrow to U2, title "Customer not reachable".
  Block 1, the rule in plain words: "Try to reach the customer twice, then
  wait until 9:52 AM. After that you can end this delivery." The time is the
  wait-until time. The block never says "10 minutes" as a countdown unless the
  app has the server's time (show the clock time, not a ticking number, in the
  default design; a small "in 6 min" next to it is allowed).
  Block 2, the attempts: a list "Attempt 1 · 9:44 AM", "Attempt 2 · 9:49 AM"
  and, below the last, the button "I tried to reach the customer" (primary,
  56px) with the count "2 of 2 attempts recorded" or "0 of 2 attempts
  recorded". Each tap records ONE attempt. After two attempts the button stays
  available (more attempts are allowed) and the count reads "3 attempts
  recorded". "Call customer" sits above the list as a secondary link.
  Block 3, the end action: button "Customer not reachable, fail the job",
  danger style, 56px, below the attempts. Its states:
    a. Off, fewer than two attempts: helper line "Record two attempts first.
       1 more needed." (or "2 more needed.").
    b. Off, two attempts but the wait is not over: helper line "You can end
       this job from 9:52 AM."
    c. On: both conditions met. No helper line.
    d. Not allowed yet but pressed anyway (a stale screen): the server
       refuses; show "You can end this job from 9:52 AM." or "Record two
       attempts first." from what the server says is missing, and refresh the
       screen.
  Pressing the enabled button opens a confirmation sheet (see U3-S).
  States: loading the job; recording an attempt (that button disabled, spinner;
  the list shows the new row only after the server answers); attempt not sent
  ("We could not record this attempt. Try again." with Try again, the count
  unchanged); job paused; reassigned; "This job has changed. Refresh."
  The screen also appears if the partner closes the app and comes back: the
  attempts and the wait-until time come from the job, not from the phone.
  Offline: the attempt button and the end button are disabled with "You are
  offline. Connect to record an attempt." Nothing is queued or shown as
  waiting to send, because the time of an attempt is the server's time.

U3-S. CONFIRM SHEET (bottom sheet, as in the cash screens)
  Title "End this delivery?". Body "This records that the customer could not
  be reached after two attempts. You cannot undo it." Buttons "Back" and
  "Fail the delivery" (danger). States: sending (both disabled, spinner);
  not sent (message and Try again); the server refuses because the wait is not
  over (the sheet closes and U3 shows state b).

U4. DELIVERY FAILED (outcome)
  Heading "Delivery failed". Reason line "Customer not reachable". The time it
  was recorded. Line "The dispatcher will contact you." Button "Back to
  dashboard". The job leaves Today and appears under Done as "Delivery failed"
  in the job list (the existing failed state of the job outcomes). No amount,
  no cash card, no fee, no instruction about the water.

U5. PROBLEM REPORT
  The existing problem report keeps all its options. "Customer not reachable"
  behaves in two ways: on a job that has not arrived yet it still sends a note
  to the dispatcher as today; on a job that has arrived it opens U3 instead,
  because the report cannot record the attempts. Show both.

PHONE ONLY (360px)
  Bottom bars as in the trip screens: the primary action fixed at the bottom
  of U1 and U2; on U3 the end action is inside the scroll area so the attempt
  button is the one under the thumb.

OUTPUT
Show U1 to U5 in every state above, for the rider version, then list the words
that change for the driver version. Show U3 in its four end-action states (a to
d) and with 0, 1, 2 and 3 attempts. Name components as in the handoff so
developers can map them to the existing ones. Do not add a component unless a
screen needs one, and say so.
```

## Screen-to-endpoint table (for the designer)

| Screen | Element / action | Endpoint |
| --- | --- | --- |
| U1 | I have arrived | `POST /driver/jobs/{reference}/arrive` with `{ "location_consent": false }`, no `location` ([driver-arrive-request.json](../../api/examples/driver-arrive-request.json) shows the body with a location, which this design leaves out); repeating returns 200 unchanged; 409 `invalid_order_transition`, 409 `job_on_hold`, 404 `order_not_found` |
| U2 | Arrival time | `arrived_at` on `GET /driver/jobs/{reference}` |
| U2 | Start unloading | `POST /driver/jobs/{reference}/transition` with `{ "to": "unloading" }` |
| U2 | Paused notice | `hold` on the job (`unsafe_stop`, `source_review`, `proof_review`) |
| U3 | Attempts list and count | `contact_attempts` (`attempted_at`, oldest first) |
| U3 | I tried to reach the customer | `POST /driver/jobs/{reference}/contact-attempts` (no body, 201); 409 `invalid_order_transition` |
| U3 | Wait-until time | `unreachable_allowed_at` (`arrived_at` + 10 minutes) |
| U3 | End action on or off | `allowed_actions` contains `record_failed_attempt` only with two attempts and the wait over; the client fetches the job again when `unreachable_allowed_at` passes |
| U3-S | Fail the delivery | `POST /driver/jobs/{reference}/transition` with `{ "to": "failed" }`; the server sets the reason `customer_unreachable`; 200 with the finished job in `done`; 409 `transition_requirements_unmet`, `details.missing` of `contact_attempts_recorded` and/or `unreachable_wait_elapsed` ([error-unreachable-wait.json](../../api/examples/error-unreachable-wait.json)) |
| U4 | Reason, time | `end_reason` (`customer_unreachable`), `ended_at` on the `done` job |
| U5 | Problem report on a job that has not arrived | `POST /driver/jobs/{reference}/incidents` as today |
| All | Reassigned | 404 `order_not_found` on a job the app had open |

## After the preview

1. Check every screen and state exists and the honesty rules hold, above all
   that the end action cannot be reached before two attempts and the wait,
   that no location or tracking appears, and that no money is mentioned.
2. Record the result in `docs/design/driver-arrival-unreachable.md` using the
   [template](../_template.md) and ask one reviewer who is not the author for
   G2.
3. Then, in order: a small shared PR for the new fields in
   `frontend/src/domain/partner.ts` (`arrived_at`, `contact_attempts`,
   `unreachable_allowed_at`) and the mapping rows in `api-mapping.md`; the
   adapters in `frontend/src/features/partner/real/jobs.ts` (arrival as its own
   step, `recordContactAttempt`, the `failed` step, and `completeUnloading`
   without the arrival); then the screens.
