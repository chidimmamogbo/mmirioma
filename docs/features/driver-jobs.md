# Driver jobs

Requirements: FR-001, FR-032, FR-033, FR-034, FR-035, FR-036, FR-038,
FR-050, BR-06, BR-12, BR-13, NFR-002, NFR-004, BR-09, SRS §8 · Acceptance
tests: T-07, T-08, T-22, T-24, T-25 · Contract:
[docs/api/deliveries.md](../api/deliveries.md), "Driver job endpoints"
(part 1, agreed 2026-10-19) and "Driver job endpoints, part 2 (#51)"
(agreed 2026-10-20, PR #74) · Design:
[driver-deliveries.md](../design/driver-deliveries.md) · Issues: S1-06 (#7),
S1-15 (#19), #51 (part 2 contract), #75 (part 2 build)

## 1. Overview and purpose

The driver (delivery partner) app's backend. A driver sees their jobs
grouped as **offers**, **today**, **upcoming** (accepted jobs for a later
day) and **done**, opens their live job, and works through it:

- accept or decline an offer (a declined order returns to the dispatcher);
- start the job on its delivery day (the customer is texted "dispatched");
- record the water collected at the source, then leave for the customer;
- record arrival, optionally with a GPS point the driver consented to share;
- if the customer cannot be reached: record two contact attempts, wait the
  full 10 minutes, then record a failed attempt;
- start unloading, record unloading complete (this issues the customer's
  delivery code), and prove delivery with the code, or ask an administrator
  to approve alternative proof;
- send the customer a new code when the old one expired, was used up or was
  not sent;
- report a problem to the dispatcher at any active step.

A job is a `dispatch` **assignment** (driver assignment, #49), named in every
path by the **order reference**.

## 2. Feature workflow

1. A dispatcher offers a confirmed order to a driver (admin dispatch, row 8):
   assignment `offered`, order `assigned`.
2. `GET /driver/jobs` shows it under `offers`. `GET /driver/jobs/{reference}`
   shows the window, quantity, source, address and instructions, but **not**
   the receiver's name or phone (FR-032).
3. The driver declines (`POST .../decline`, row 10; the order returns to
   `confirmed`) or accepts (`POST .../accept`, row 9, through
   `dispatch.service.accept_assignment`): the job moves to `today`, or to
   `upcoming` for a later delivery day, and the receiver appears.
4. On the delivery day the driver starts the job (`POST .../transition`
   `departed`, row 12). The customer gets the "dispatched" SMS after the
   step is saved; an SMS failure never undoes it.
5. The driver records the pickup (`POST .../pickup`, row 13): the order
   becomes `collected`. A different source or a safety concern puts the job
   on hold (`source_review`); less than ordered opens a `partial_pickup`
   exception. Then `transition` `en_route` (row 14).
6. At the address the driver records arrival (`POST .../arrive`, row 15).
   This creates the job's `delivery_attempts` row: the server's arrival
   time, whether it was inside the confirmed window, and the GPS point only
   if the driver consented first. No code is issued yet (#67).
7. **Customer present:** `transition` `unloading` (row 16), then
   `POST .../unloading-complete` when the water is in the tank. That issues a
   6-digit code and texts it to the receiver. The driver submits
   `POST .../proof` with the delivered litres, the unloading confirmation and
   the code: the order becomes `delivered` (row 17) and the job ends. If the
   receiver cannot give the code, the driver submits alternative proof: the
   job gets a `proof_review` hold and waits for an administrator (row 18).
   Approved, the order is `delivered` and the job ends; rejected, the hold is
   cleared and the driver can send a new code and prove again
   ([admin-hold-review.md](admin-hold-review.md)).
8. **Customer unreachable (FR-038):** the driver records each contact attempt
   (`POST .../contact-attempts`). After two attempts **and** 10 minutes
   from arrival, `transition` `failed` (row 19) records the failed attempt:
   the order is `failed` with reason `customer_unreachable`, a
   `customer_unreachable` exception is opened, and the job ends.
9. A finished job shows under `done` (summary only) for the rest of that
   Lagos day. `failed` ends the driver's job even though the order can be
   rescheduled (row 21) as a new assignment.

## 3. Important files

| File | Responsibility |
| --- | --- |
| `backend/app/modules/deliveries/service.py` | All rules: grouping, allowed actions, live-job access, accept, decline, steps, pickup, arrival, contact attempts, unloading complete, proof, repeats after the job ends, new code, incidents, holds |
| `backend/app/modules/deliveries/models.py` | `PickupRecord`, `DeliveryCode`, `OrderException`, `DeliveryAttempt`, `ContactAttempt`, `DeliveryProof` and their enumerations |
| `backend/app/modules/deliveries/codes.py` | Delivery code generation, HMAC hashing, constant-time matching, SMS text, 10-minute lifetime, new-code rules |
| `backend/app/modules/deliveries/schemas.py` | Request validation (location only with consent, exactly one acknowledgement) and responses (receiver only while accepted, never the code) |
| `backend/app/modules/deliveries/router.py` | `/api/v1/driver/jobs*` endpoints, driver role only |
| `backend/app/modules/orders/transitions.py` | The state machine rows the driver steps use; `delivery_day_reached` condition name |
| `backend/app/modules/dispatch/service.py` | `accept_assignment` and `decline_assignment` (rows 9-10) |
| `backend/alembic/versions/20261019_0007_add_driver_jobs.py` | Part 1 tables |
| `backend/alembic/versions/20261020_0009_add_delivery_attempts_and_proofs.py` | Part 2 tables and the new exception categories |
| `backend/tests/test_deliveries*.py`, `test_driver_job_steps_integration.py`, `test_driver_job_examples.py` | Unit, HTTP, integration and mock JSON tests |

## 4. Database models and relationships

- `water_sources`: `name`, `approximate_location`, `is_simulated`. The rest of
  FR-011 comes with admin source management. A row here says nothing about
  approval (FR-012).
- `orders` (columns from `0007`): `source_id` → `water_sources`;
  `delivery_window_start_at`/`end_at` (both or neither, end after start),
  standing in for a delivery slot until service zones are decided.
- `assignments` (dispatch): the job. `decline_reason`, `decline_note`; one
  live assignment per order and per driver. Proof and the failed step set it
  `completed` with `ended_at`.
- `pickup_records`: one per assignment. Exactly one of `source_id` and
  `other_source_name`.
- `delivery_codes`: HMAC `code_hash`, `issued_at`, `expires_at`, `attempts`
  (0-5), `used_at`, `invalidated_at`, `sms_status`, `issued_by`.
- `order_exceptions`: incidents and system exceptions; with a `hold_kind`
  and no `resolved_at` it is an open hold. Categories added in `0009`:
  `partial_delivery`, `customer_unreachable`, `alternative_proof`.
- `delivery_attempts` (`0009`): one per assignment (unique) →
  `assignments`, `orders`. `arrived_at` (server time), `arrival_location`
  (`geography(POINT, 4326)`, nullable), `arrival_accuracy_metres`,
  `within_window` (null without a window), `unloading_completed_at`,
  `outcome` (`delivered` / `failed`), `recorded_by`.
- `contact_attempts` (`0009`): → `delivery_attempts`; `attempted_at` (server
  time), `recorded_by`.
- `delivery_proofs` (`0009`): → `assignments`, `orders`,
  `delivery_attempts`, optionally `delivery_codes`. `delivered_litres`
  (positive), `unloading_confirmed` (must be true), `delivered_at` (server
  time), `method` (`delivery_code` / `alternative_proof`) with exactly one of
  `delivery_code_id` and `alternative_reason`, `alternative_note`, optional
  consented `location`, `recorded_by`.

All foreign keys are `RESTRICT`. Enumerations are VARCHAR plus a named CHECK.
GPS points are PostGIS geography (WGS 84, SRID 4326) through GeoAlchemy2,
without a spatial index (nothing searches by location). A job's `arrived_at`
comes from its delivery attempt, or from an `arrived` event of the same job
when a dispatcher recorded the arrival.

## 5. API endpoints

All under `/api/v1`, driver role only. Full shapes in the
[contract](../api/deliveries.md#driver-job-endpoints).

| Method | Path | Success | Errors |
| --- | --- | --- | --- |
| GET | `/driver/jobs` | 200 `{offers, today, upcoming, done, generated_at}` | shared |
| GET | `/driver/jobs/{reference}` | 200 `DriverJobDetail` | 404 `order_not_found` |
| POST | `/driver/jobs/{reference}/accept` | 200 `DriverJobDetail` | 404 |
| POST | `/driver/jobs/{reference}/decline` | 204 | 404, 403 `forbidden` (already accepted), 422 |
| POST | `/driver/jobs/{reference}/transition` | 200 `DriverJobDetail`; 200 `DriverJobSummary` (done) for `failed` | 404, 409 `invalid_order_transition` / `job_on_hold` / `transition_requirements_unmet`, 422 |
| POST | `/driver/jobs/{reference}/pickup` | 201 `DriverJobDetail` | 404, 409 `pickup_already_recorded` / `job_on_hold` / `invalid_order_transition`, 422 |
| POST | `/driver/jobs/{reference}/arrive` | 200 `DriverJobDetail` | 404, 409 `invalid_order_transition` / `job_on_hold`, 422 |
| POST | `/driver/jobs/{reference}/contact-attempts` | 201 `DriverJobDetail` | 404, 409 `invalid_order_transition` |
| POST | `/driver/jobs/{reference}/unloading-complete` | 201 `DriverJobDetail` (200 for a repeat) | 404, 409 `invalid_order_transition` / `job_on_hold` |
| POST | `/driver/jobs/{reference}/proof` | 200 `DriverJobSummary` (done); 202 `DriverJobDetail` (alternative proof) | 404, 400 `delivery_code_invalid` / `delivery_code_expired`, 409 `transition_requirements_unmet` / `job_on_hold` / `invalid_order_transition`, 422 |
| POST | `/driver/jobs/{reference}/delivery-code` | 201 `DriverJobDetail` | 404, 409 `invalid_order_transition` / `transition_requirements_unmet` / `delivery_code_still_valid`, 429 `rate_limited` |
| POST | `/driver/jobs/{reference}/incidents` | 201 `IncidentRead` | 404, 409 `job_not_active`, 422 |

`DriverJobDetail` includes `unloading_completed_at`, `unreachable_allowed_at`
(arrival + 10 minutes) and the real `contact_attempts`; `delivered_litres`
is set once a code-verified delivery ended the job.

## 6. Business rules

- **Groups (Africa/Lagos):** offers = open offers on any day; today =
  accepted, not ended, delivery day today or earlier, or no window; upcoming
  = accepted, later delivery day; done = ended today, newest first.
- **Start on the delivery day** (contract Decision 3): `start_job` is offered
  only from the delivery day, and `departed` earlier is 409
  `transition_requirements_unmet` with `delivery_day_reached`.
- **Dispatched SMS (FR-050):** sent once, after the `departed` step is saved;
  a repeat sends nothing; a provider failure is logged (reference only) and
  never changes the order.
- **Live job only** (technical lead, 2026-10-19): a single job opens only for
  the driver on the order's live assignment; anything else is 404.
- **Receiver privacy (FR-032, design):** first name and last initial plus
  phone, only while the job is accepted.
- **Pickup (FR-034):** only from `departed`, once per job, not while on hold.
- **Arrival (row 15):** server time; `within_window` is recorded because a
  redelivery fee may apply only when the driver arrived inside the window
  (FR-038, BR-14). GPS is stored only with `location_consent: true`
  (FR-035); it is evidence, never tracking.
- **Customer unreachable (FR-038, #55, T-25):** `record_failed_attempt`
  appears, and `failed` is accepted, only after two contact attempts **and**
  the full 10 minutes since arrival, never earlier. Every contact tap is
  recorded (no cap: an open question in the contract).
- **Delivery code (FR-035, #67):** issued only by unloading complete (and by a
  new-code request afterwards); 6 digits, **10 minutes**, 5 attempts, single
  use, HMAC-hashed and compared in constant time. A wrong code uses an
  attempt even though the request fails (`attempts_remaining`); at 0, or
  once expired, replaced or used, the code is refused with
  `delivery_code_expired` (T-22).
- **Delivered (BR-06, T-08):** only with delivered litres, the unloading
  confirmation and a verified code, in one transaction with the proof row,
  the event, the assignment `completed` and the attempt outcome. Alternative
  proof never delivers: it opens a `proof_review` hold and an
  `alternative_proof` exception for an administrator (BR-13).
- **Partial delivery (FR-035, FR-036):** fewer litres than ordered still
  delivers and opens a `partial_delivery` exception (also when alternative
  proof is submitted, so the reviewer sees it). No upper bound is applied to
  `delivered_litres` (open question in the contract).
- **Payment (BR-12, T-24):** plays no part; delivery is recorded with payment
  outstanding.
- **Repeats:** accept, a step, arrival and unloading complete return the job
  unchanged when repeated. Proof or `failed` repeated by the same driver
  after their job ended today return the finished job (not 404), unless the
  same order has a new live job for them, which takes precedence.
- **Holds:** `source_review`, `unsafe_stop`, `proof_review`. While open,
  `allowed_actions` is only `report_incident` and steps, arrival, unloading
  complete and proof are refused with `job_on_hold`.
- **New code (FR-035):** only once unloading is recorded complete, 60
  seconds after the newest code, and not while the current code is usable
  and was sent. It voids older codes; an SMS failure keeps the code with
  `sms_status` `failed` and claims nothing.
- Every order status change goes through the state machine
  (`orders.service.transition_order(..., commit=False)`), so the evidence
  rows and the status change commit together (NFR-004).

## 7. Authentication and authorization requirements

Signed-in, active `driver` role (`CurrentDriver`); customers and admins get
403 `forbidden`. A driver can only see and act on their own live job;
anything else is 404 `order_not_found`, so references cannot be probed
(T-07, NFR-002). `POST` needs `X-CSRF-Token`. Write paths lock the order row
first (`orders.service.lock_order`), then the assignment, so concurrent
requests cannot deadlock or both win (a double "Mark as delivered" delivers
once).

## 8. Error handling and edge cases

- Accepting an offer that was withdrawn or declined → 404 (J2-f).
- Skipping a step (`en_route` from `accepted`, arrive before `en_route`) →
  409 `invalid_order_transition`; `collected`, `arrived` or `delivered` as a
  `transition` target → 422 (they have their own endpoints).
- Proof before unloading is complete → 409 `transition_requirements_unmet`
  with `unloading_confirmed`; new code before it → the same.
- Location without consent, out-of-range coordinates, both or neither of
  `delivery_code` and `alternative_proof`, `unloading_confirmed: false`,
  a code that is not 6 digits → 422.
- An arrival a dispatcher recorded for the driver (`recorded_for_driver`)
  has no delivery attempt; the first step that needs one creates it with
  that event's time, so the 10-minute wait still counts from arrival.
- A repeated failed step or proof after the job ended returns the finished
  job; for anyone else, or after that day, the job is 404.
- New code within 60 seconds → 429 with `retry_after_seconds` and
  `Retry-After`; usable code → 409 `delivery_code_still_valid`.

## 9. Testing

```bash
cd backend
pytest tests/test_deliveries.py tests/test_deliveries_api.py tests/test_driver_job_examples.py
# Integration (a separate test database, never the dev one; see LOG.md):
alembic upgrade head
TEST_DATABASE_URL=<test database URL> pytest tests/test_deliveries_integration.py \
  tests/test_driver_job_steps_integration.py
```

- `test_deliveries.py`: grouping, allowed actions (failed attempt after two
  attempts and 10 minutes, unloading complete before proof, no new code
  before it), code rules and matching, window flag, dispatched SMS text.
- `test_deliveries_api.py`: roles and CSRF for every endpoint (T-07),
  validation (consent, one acknowledgement, 6 digits), status codes (200,
  201/200, 202, 400), detail versus done summary, never the code.
- `test_driver_job_steps_integration.py`: accept and its repeat, start only
  on the delivery day with one SMS, SMS failure, steps and holds, arrival
  with GPS stored as SRID 4326, T-25, T-22 (before unloading complete,
  expired, 6th attempt), T-08 alternative proof, delivery with payment
  outstanding (T-24) and partial delivery, repeats after the job ends, a
  live job's precedence, two proofs at once.
- `test_driver_job_examples.py`: the driver job mocks validate against the
  built schemas.
- Migration: `alembic upgrade head`, `alembic downgrade -1`,
  `alembic upgrade head`, `alembic check`.

**End-to-end API run (2026-10-20, technical lead).** The whole delivery
over HTTP with real admin and driver sessions, on the dev database with
simulated demo accounts and orders; the mock SMS provider's log stood in for
the customer's phone. All server checks passed:

- *Delivered:* offer, accept (receiver shown only after), start (the
  customer's "dispatched" SMS), pickup, on the way, arrive, unloading; a code
  request and a proof refused before unloading complete; unloading complete
  sends the code once; a wrong code leaves 4 attempts; after expiry "Send new
  code" is offered and issues a fresh code; proof delivers, a repeat returns
  the done job, the job no longer opens and sits in Done; the admin history
  lists every step with its actor.
- *Customer unreachable:* arrival with a consented location and no code; the
  failed step refused before the attempts and, after two attempts, before
  10 minutes (`missing: ["unreachable_wait_elapsed"]`); after the full
  10 minutes "Record failed attempt" is offered and the order fails with
  `customer_unreachable`; a repeat returns the done job.
- *Alternative proof:* 202 with a `proof_review` hold; the order stays
  `unloading`; a second proof while held is 409 `job_on_hold`.
- *T-07:* another driver's job is 404 to view and to act on.

Set up outside the API, because nothing provides it yet: a simulated water
source on the orders (see limitations) and confirmed orders. The customer's
own view of the new statuses was not checked in this run (the fallback has
its own tests, #85).

## 10. Known limitations

- **Customer wording for `departed`, `arrived` and `unloading` is not
  designed yet** (`orders.md`: "Pending design"). Since #85 the customer
  screens show the neutral "Order update" fallback instead of crashing; the
  designed wording is #82 part 2.
- **Nothing assigns a water source to an order.** Pickup needs one (an
  "assigned source" pickup on an order without one is 422, and another source
  opens a `source_review` hold that can only end in Fail or Cancel until
  source records exist, #87), so a real
  delivery cannot get past pickup without manual setup. Source assignment
  belongs to order confirmation (admin design A1), not built.
- The driver app covers the whole job (J1, J2, A1-A8; #97, see
  [driver-app.md](driver-app.md)), but has not yet been run end to end
  against this backend.
- Open questions in the contract are not decided in code: no upper bound on
  `delivered_litres`, no cap on contact attempts, and the two
  alternative-proof reasons as agreed. A rejected alternative proof returns
  the job to "unloading complete" (#88 decision, built in #93).
- What happens to collected water after a failed attempt is not defined (the
  SRS does not say).
- The volume collected is not checked against vehicle payload yet (contract
  Decision 5).
- Water sources hold only a name and location; the FR-012 safety gate is not
  built.
- Cash collection after unloading (SRS v0.3 FR-041) needs its own design.
