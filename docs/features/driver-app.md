# Driver app: sign in, My jobs, job offers and the active job

Requirements: FR-001, FR-032, FR-033, FR-034, FR-035, FR-036, FR-038,
FR-050, BR-04, BR-06, BR-09, BR-13, NFR-012, NFR-020, NFR-021 · Acceptance
tests: T-07, T-08, T-22, T-25 (in part; see limitations) · Design:
driver-deliveries.md (J1, J2 approved G2
2026-10-19; A1 and A3-A8 approved G2 2026-10-23, "Change: active job (#97)";
A2 as first approved) and [authentication.md](../design/authentication.md)
(D1, X1-X5) · Contract: [deliveries.md](../api/deliveries.md), "Driver job
endpoints" part 1 and part 2 (agreed G3) · Backend:
[driver-jobs.md](driver-jobs.md) · Issue:
[#97](https://github.com/mmiri-oma/mmirioma-original/issues/97) (Phase 2, step 3)

## 1. Overview and purpose

The delivery partner's (driver's) app. A driver signs in, sees their jobs
grouped as New offers, Today, Upcoming and Done, accepts or declines offers
(FR-032), and works an accepted job from start to delivery:

- **A1 Active job:** the step list and one action at a time: Start job,
  Record pickup, Leave for customer, I've arrived, Start unloading,
  Unloading complete, Complete delivery; "Report a problem" throughout.
- **A2 Record pickup** (FR-034), **A3** arrival with optional, consented
  location (FR-035), **A4** customer not reachable (FR-038), **A5** proof of
  delivery with the customer's code or a request for other proof (FR-035,
  BR-06, BR-13), **A6** report a problem (FR-036), **A7** outcomes and
  holds, **A8** offline.

Nothing is shown as done until the server records it. The server decides
what the driver may do (`allowed_actions`); the screens only show it.

The driver's cash (K1 on the job, K2 My cash) is in
[driver-cash.md](driver-cash.md) (#124).

## 2. Feature workflow

1. **Sign in and My jobs** (unchanged from J1/J2): D1 at `/driver/sign-in`;
   My jobs at `/driver` (`GET /driver/jobs`); offers open J2 at
   `/driver/jobs/:reference`, where Accept and Decline work as on the card.
   Today and Upcoming cards now open the job.
2. **The job screen** (`/driver/jobs/:reference`, `GET .../{reference}`)
   shows J2 for an offer and the active job (A1) for an accepted job.
3. **Start job** (`POST .../transition` `departed`): only from the delivery
   day; before it the button is off with "You can start this job on Sat 24
   Oct." (technical lead, prompt 13 question 3). The customer is texted that
   the job started (FR-050), so it is a deliberate tap.
4. **Record pickup** opens A2 (`/driver/jobs/:reference/pickup`,
   `POST .../pickup`). Another source or a safety concern pauses the job.
5. **Leave for customer** (`transition` `en_route`).
6. **I've arrived** asks for location first (A3-b): "Share location" reads
   the position once; "Continue without location" sends none. Either way
   `POST .../arrive` records the arrival. **No code at arrival** (#67).
7. **Arrived** offers "Start unloading" (`transition` `unloading`) or
   "Customer not reachable" (A4, `/driver/jobs/:reference/unreachable`):
   two contact attempts (`POST .../contact-attempts`), then "Record failed
   attempt" once the server allows it, after the full 10 minutes
   (`transition` `failed`), which ends the job.
8. **Unloading complete** (`POST .../unloading-complete`) sends the
   customer's 6-digit code by SMS.
9. **Complete delivery** (`POST .../proof`): litres delivered (never
   prefilled), the unloading confirmation and the code. Delivered: the job
   ends ("Delivery recorded"). "Customer can't get the code?" sends other
   proof for an administrator (202, "Waiting for proof approval").
10. **Report a problem** (A6, `/driver/jobs/:reference/problem`,
    `POST .../incidents`). An unsafe report stops the job.
11. **Holds** lock every step; a cleared hold shows on "Check again" or when
    the job screen opens (question 2: nothing is pushed, no polling).

## 3. Important files

| File | Responsibility |
| --- | --- |
| `frontend/src/lib/api/driverJobs.ts` | Every driver job call (list, detail, accept, decline, transition, pickup, arrive, contact attempts, unloading complete, new code, proof, incidents); Zod schemas; `JobStepResult` tells a live job from a done one |
| `frontend/src/features/driver-jobs/useDriverJobs.ts` | Job list and job queries, the offer answer, `useOnline` |
| `frontend/src/features/driver-jobs/useActiveJob.ts` | `useJobStep` (every step, cache updated from the response), `useReportIncident` |
| `frontend/src/features/driver-jobs/activeJob.ts` | Step list, `currentStep`, `stepErrorKind`, Lagos time helpers, outcome wording, problem types |
| `frontend/src/features/driver-jobs/location.ts` | One-off consented location read; the consent answer per job, in memory only |
| `frontend/src/features/driver-jobs/driverStatus.ts` | Driver badge: hold first, then offer, then the order status; Reassigned |
| `frontend/src/features/driver-jobs/format.ts` | Lagos window, time, litres, "Offered 5 min ago" |
| `frontend/src/features/driver-jobs/components/ActiveJob.tsx` | A1, A3-a, A5-a, holds (A1-f, A6-a, A7-b), A7-c2, A8 |
| `frontend/src/features/driver-jobs/components/ProofForm.tsx` | A5-b to A5-n |
| `frontend/src/features/driver-jobs/components/ConsentSheet.tsx` | A3-b |
| `frontend/src/features/driver-jobs/components/ActiveParts.tsx` | Step list, stop work alert, call links, Check again, step error banner, A7 outcome panel |
| `frontend/src/features/driver-jobs/components/JobFrame.tsx` | Frame of A2, A4, A6: loads the job; `EndedJob` outcome lookup |
| `frontend/src/features/driver-jobs/pages/JobOfferPage.tsx` | `/driver/jobs/:reference`: J2, the active job, or the outcome |
| `frontend/src/features/driver-jobs/pages/PickupPage.tsx` | A2 |
| `frontend/src/features/driver-jobs/pages/UnreachablePage.tsx` | A4 |
| `frontend/src/features/driver-jobs/pages/ProblemPage.tsx` | A6 |
| `frontend/src/features/driver-jobs/pages/MyJobsPage.tsx`, `components/JobCard.tsx`, `components/DeclineSheet.tsx` | J1, cards, J2-b |
| `frontend/src/features/driver-jobs/components/DriverLayout.tsx` | X5 driver top bar and menu, offline bar |
| `frontend/src/features/auth/contact.ts` | `dispatcherCallHref` (the support line) for every "Call the dispatcher" |
| `frontend/src/App.tsx` | `/driver/sign-in`, `/driver`, `/driver/jobs/:reference` and its `pickup`, `unreachable`, `problem` screens |

## 4. Database models and relationships

None in the frontend. The jobs are `assignments` of `orders` to a driver,
described in [driver-jobs.md](driver-jobs.md#4-database-models-and-relationships).

## 5. API endpoints and request/response behavior

| Call | Screen | Handling |
| --- | --- | --- |
| `GET /driver/jobs` | J1, outcome lookup | 200 `DriverJobList` |
| `GET /driver/jobs/{reference}` | J2, A1-A8 | 200 `DriverJobDetail`; 404: J2-f for an offer, the outcome for an accepted job |
| `POST .../accept`, `.../decline` | J2 | As before |
| `POST .../transition` | Start job, Leave for customer, Start unloading, Record failed attempt | 200 detail; `failed` returns the `done` summary |
| `POST .../pickup` | A2 | 201 detail (hold `source_review` for another source or a concern); 409 `pickup_already_recorded`; 422 under the fields |
| `POST .../arrive` | A3 | Body `{ location, location_consent }`; location only with consent |
| `POST .../contact-attempts` | A4 | 201 detail with `contact_attempts` |
| `POST .../unloading-complete` | A5-a | 201 detail with `delivery_code` |
| `POST .../delivery-code` | Send new code | 201 detail; 409 `delivery_code_still_valid`; 429 `rate_limited` |
| `POST .../proof` | A5 | 200 `done` summary; 202 detail with hold `proof_review`; 400 `delivery_code_invalid` (`attempts_remaining`), `delivery_code_expired` |
| `POST .../incidents` | A6 | 201 `IncidentRead` (`hold` `unsafe_stop` for unsafe types); 409 `job_not_active` |

Every response is checked with Zod. A step's response replaces the cached
job, so the screen moves on only once the server has recorded the step. An
ended job keeps its last cached copy: reading it again would answer 404.

## 6. Important business rules

- **The server's `allowed_actions` decide the action shown.** Two actions
  turn on by time alone (the failed attempt after the wait, a new code after
  expiry), so the job is read again when those times pass.
- **Start job only on the delivery day** (contract part 1 Decision 3);
  before it, off with the date.
- **No code at arrival** (#67): "Unloading complete" sends it. "Code sent"
  shows only when `sms_status` is `accepted` (FR-050: no false "sent").
- **The full 10 minutes** (FR-038, #55): "Record failed attempt" stays off
  until two attempts are recorded and the server allows it, with "You can
  record a failed attempt from {time}.". No advice about the water.
- **Proof** (FR-035, BR-06): litres never prefilled; unloading confirmed;
  the 6-digit code (spaces allowed when pasted). The delivery time is the
  server's. Other proof is a request; only an administrator approves it
  (BR-13).
- **Location** (FR-035): optional, asked first, read once at arrival and
  once at delivery, never watched. The answer is kept in memory for the
  job, not in browser storage.
- **Holds** are not statuses: "Paused" (source review, server message),
  "Stop work" (unsafe stop), "Waiting for proof approval". Steps are locked;
  "Call the dispatcher" and "Check again" stay.
- **Offline: no queue** (question 1). Every step is off; the dispatcher can
  record a step for the driver (`recorded_for_driver`).
- **Minimum data:** the receiver's first name and last initial, the
  address, landmark and instructions; the phone only behind "Call receiver".
- **Simulated jobs are tagged "Simulated"** (BR-09).

## 7. Authentication and authorization requirements

Every driver route is behind `AppGate app="driver"` (role `driver`); the
server enforces the role and the live assignment on every call (FR-001,
T-07: another driver's job is 404). Every `POST` sends `X-CSRF-Token`. 401
anywhere ends the session (D1, "Your session has ended. Please sign in
again."); after signing in again a driver lands on My jobs.

## 8. Error handling and edge cases

| Situation | Shown |
| --- | --- |
| Step not sent (no connection, 5xx) | "Not sent" with what is not recorded and the server's message; Retry repeats the same step (steps are safe to repeat) |
| Step refused (409 `invalid_order_transition`, `job_on_hold`, `transition_requirements_unmet`) | The server's message with "Check again" |
| 403 `csrf_failed` | The server's message with "Reload" |
| 404 on a job the driver had accepted | Its outcome from today's Done list (Delivered, Delivery failed, Cancelled), else "Reassigned" (A7-d) |
| Wrong code | "That delivery code is not correct. 3 tries left." under the code; the code is cleared, litres and the tick kept |
| No tries left / expired / SMS failed | "Too many wrong codes" / the server's expired message / "The code didn't reach the customer", each with "Send new code" when allowed |
| New code too soon | The server's message and "Try again in 1 minute"; the button is off until the wait ends |
| Proof not sent | "The delivery is not recorded yet. Your entries are kept." with Retry |
| Problem report not sent | "The dispatcher has not been told. Your report is kept. Try again, or call the dispatcher." |
| Problem report on an ended job | The server's message and "Call the dispatcher" |
| Pickup field refused (422) | The server's message under the field |
| No GPS or permission refused | The step is recorded without a location |

## 9. Testing instructions

```bash
cd frontend
npm run lint && npm run typecheck && npm test && npm run build
```

- `src/lib/api/driverJobs.test.ts`: every call's path, method, CSRF and
  body; a done summary versus a held job from the proof; contract examples.
- `src/features/driver-jobs/activeJob.test.tsx`: A1-a, A1-b, A1-c/A1-d,
  A1-e/A3-b (without and with location), A3-c, A1-f, A6-a, A7-c2, A1-g,
  A1-h, A8, A7-d/e; A2 (assigned source, other source and concern, server
  refusal and field error); A4 (attempts, the wait, confirm and A7-f, and
  A4-f refused as too early); A5-a, A5-d/e, A5-f with A7-a, A5-c, A5-g,
  A5-h/k, A5-i, A5-j, A5-l, A5-m, A5-n with A7-b, A7-b2; A6 (sent, unsafe,
  not sent, and A6-d after the job ended). Each of the 44 approved frames
  has a test.
- `src/features/driver-jobs/driverJobs.test.tsx`: D1, X2, X4, X5; J1, J2.
- `src/features/driver-jobs/logic.test.ts`: formatting, badges, steps,
  error kinds, Lagos times, outcome wording.

**End-to-end run (2026-10-23, #97, nnamdi-security + agent).** Against the
real backend on a throwaway PostGIS database (`mmirioma_e2e_97`, dropped
afterwards), seeded through the app's own services (admin, two drivers, a
vehicle, one simulated water source activated for potable water). Every
request went through the frontend's own API client functions
(`src/lib/api/*.ts`, with their Zod response checks), one cookie session per
user. The mock SMS provider's log stood in for the customer's phone. No
database edits after seeding:

1. **Setup:** the customer registered and verified the phone with the SMS
   code; the admin and both drivers signed in.
2. **Delivered with the code** (order A): the customer sent the order; the
   admin confirmed it (window, manual quote ₦4,500.00, phone agreement) and
   offered it to the driver. The offer was listed with no receiver; after
   accepting, the receiver showed ("Sample R."). The other driver got 404
   `order_not_found` before and after accept (T-07). Start, pickup at the
   assigned source, on the way and arrival without location; no delivery
   code at arrival. A running-late incident was sent with no hold. Before
   "Unloading complete" a code request was 409
   `transition_requirements_unmet` (T-22). "Unloading complete" sent the
   code by SMS; a wrong code was `delivery_code_invalid` with 4 attempts
   left; the right code delivered 1,000 L. The job then answered 404 and sat
   in Done, the admin history had 11 entries, and the customer saw
   `delivered`.
3. **Other proof** (order B): the proof with "customer cannot receive the
   code" put the job on hold `proof_review` with the server's message; a
   second proof while held was 409 `job_on_hold`. The admin approved it
   (customer's phone acknowledgment); the driver's job ended and showed in
   Done as `delivered`.
4. **Customer unreachable** (order C): arrival with a consented location.
   "Failed" was refused before the attempts (`missing:
   contact_attempts_recorded, unreachable_wait_elapsed`) and, after two
   recorded attempts, before the 10 minutes (`unreachable_wait_elapsed`).
   After the full 10 minutes the job offered `record_failed_attempt`, and
   the order became `failed` (`customer_unreachable`) (T-25).

**Not covered by the run:** the screens were not clicked through in a
browser (no browser tool was available); they are covered by the component
tests above, and the run proves the client those screens call works against
the real server. Cash (K1, K2) has its own run in
[driver-cash.md](driver-cash.md).

## 10. Known limitations

- **The end-to-end run used the API client, not the browser** (see section
  9): a browser click-through of A1-A8 against the real backend is still
  worth doing once before the pilot (#105).
- **A2 is the first approved version**; choosing a recorded source (#109) is
  deferred until after the pilot.
- **The approval was made on the design record**, not on the canvas frames
  (they could not be read for review; `docs/log/2026-10-23-design-canvas-unreadable-for-review.md`).
  The frames were drawn by this team's own generator from prompt 13, and the
  screens follow that copy.
- **Client copy written for states the design does not draw:** "This
  delivery was marked failed." (a failure other than customer unreachable),
  "Choose what happened.", "Enter the pickup time.", "Describe the safety
  concern." (the contract requires a note with a safety concern; the design
  draws only the tick box), "Safety note", "Enter the litres delivered and
  confirm the unloading on the form first." (other proof needs them),
  "Address copied", "Another source" (an order with no assigned source).
- **"Open in maps"** opens Google Maps' search link with the address, which
  phones hand to their maps app.
- **"Cancelled by the dispatcher"** on a Done card is true only while
  customers cannot cancel (row 22 is not built); revisit it when they can.
- **No refresh while a screen is open** other than the time-based reads,
  "Check again", Retry, reconnecting and revisiting: nothing is pushed.
