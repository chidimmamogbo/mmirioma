# Driver assignment

Requirements: FR-013, FR-031, FR-032, BR-03, NFR-004 · Acceptance tests:
T-07 (another driver cannot act on the job) · Contract:
[docs/api/deliveries.md](../api/deliveries.md) rows 8-11 and "Assignment
statuses" (agreed) · Issue: S1-07 (#8) · Admin endpoints:
[admin-dispatch.md](admin-dispatch.md) (#61)

## 1. Overview and purpose

A dispatcher offers a confirmed order to one eligible driver; the driver
accepts or declines; the dispatcher can take the job back. The driver must
be able to carry the order in one trip and must not hold another job, so a
driver is never overcommitted and nobody is told a driver accepted before
they did (FR-031, FR-032).

Vehicle and driver profiles are managed with a command-line tool for now
(technical lead, 2026-10-19). The dispatcher's endpoints (assign, withdraw,
driver list, detail, history) are in [admin-dispatch.md](admin-dispatch.md);
the driver's accept and decline endpoints are in
[driver-jobs.md](driver-jobs.md) (accept built in #75).

## 2. Feature workflow

```
technical lead: add-vehicle (verified payload) ─> set-driver (driver account + vehicle)

assign_driver(order, driver, admin)
  lock order ─> same offer again? return it ─> held by someone else? 409
  ─> lock driver profile ─> eligibility (all reasons) ─> 409 driver_not_eligible
  ─> INSERT assignment "offered" ─> transition confirmed → assigned (row 8),
     event linked to the assignment ─> COMMIT

accept_assignment(order, driver)   assigned → accepted (row 9),  assignment "accepted"
decline_assignment(order, driver, note, reason)
                                   assigned → confirmed (row 10, driver_declined), "declined";
                                   reason and note stored on the assignment; event note
                                   is the driver's note only (driver app, driver-jobs.md)
withdraw_assignment(order, admin, expected_status)
                                   live status must equal expected_status, else 409;
                                   assigned|accepted → confirmed (rows 10-11, reassigned), "withdrawn"
```

Every status change goes through `orders.service.transition_order`, in the
same transaction as the assignment change, and the event's `assignment_id`
points at the assignment (migration `0008`).

## 3. Important files

| File | Responsibility |
| --- | --- |
| `backend/app/modules/dispatch/models.py` | `VehicleProfile`, `DriverProfile`, `Assignment`, `AssignmentStatus` |
| `backend/app/modules/dispatch/service.py` | `eligibility_problems`, `assign_driver`, `accept_assignment`, `decline_assignment`, `withdraw_assignment`; admin views (see [admin-dispatch.md](admin-dispatch.md)); profile functions for the CLI |
| `backend/app/modules/dispatch/cli.py` | `add-vehicle`, `list-vehicles`, `set-driver`, `set-availability`, `list-drivers` |
| `backend/app/modules/orders/service.py` | `lock_order`; `transition_order(..., commit=False)` so dispatch saves both in one transaction |
| `backend/alembic/versions/20261019_0006_add_vehicle_and_driver_profiles_and_assignments.py` | Migration `0006` |

## 4. Database models and relationships

Migration `0006` (revises `0005`). All foreign keys RESTRICT.

```
vehicle_profiles 1 ──< driver_profiles >── 1 users (driver)
orders 1 ──< assignments >── 1 users (driver)       assignments.offered_by ──> users (admin)
```

| Table | Columns |
| --- | --- |
| `vehicle_profiles` | `vehicle_type` (≤50), `safe_payload_litres` (CHECK 1-100000), `is_active` |
| `driver_profiles` | `user_id` (unique), `vehicle_profile_id`, `is_available` |
| `assignments` | `order_id`, `driver_user_id`, `status` (CHECK), `offered_by`, `responded_at`, `ended_at`; since `0007` `decline_reason` (CHECK, nullable) and `decline_note` |
| `order_events` | since `0008`, `assignment_id` (nullable, RESTRICT) on the events of rows 8-11 |

Partial unique indexes `uq_assignments_live_order` and
`uq_assignments_live_driver` (where `status IN ('offered', 'accepted')`):
at most one live assignment per order and per driver. Ended assignments are
kept as history.

## 5. API endpoints

Admin endpoints (assign, withdraw, driver list, detail, history): see
[admin-dispatch.md](admin-dispatch.md). Driver accept
(`POST /driver/jobs/{reference}/accept`) and decline:
[driver-jobs.md](driver-jobs.md). Service errors:

| Status | Code | When |
| --- | --- | --- |
| 404 | `order_not_found` | No such order, or (accept/decline) not offered to this driver (T-07) |
| 404 | `driver_not_found` | The driver account does not exist |
| 404 | `assignment_not_found` | Withdraw with no live assignment |
| 409 | `driver_not_eligible` | `details.reasons`: `not_a_driver`, `inactive`, `not_approved` (a partner who is `pending` or `suspended`, [partners.md](partners.md)), `no_driver_profile` (no profile, or no verified vehicle yet), `unavailable`, `vehicle_inactive`, `over_payload`, `busy` |
| 409 | `invalid_order_transition` | Order not `confirmed` (assign), already departed or not in `expected_status` (withdraw), or held by another driver |
| 403 | `forbidden` | The acting account's role may not make the change, including a driver declining a job they already accepted (row 11 is the dispatcher's) |

## 6. Business rules

- **Eligibility (FR-031):** a `driver` account, active (FR-002), with a
  driver profile, available, using an active vehicle whose verified safe
  payload covers the whole order (FR-013, BR-03), and no other live job.
  Every failing reason is reported at once.
- **One trip only.** An order larger than the vehicle's payload cannot be
  assigned to it; multi-trip plans are not modelled yet (SRS FR-013 routes
  such orders to a manual quote).
- **Not accepted until accepted (FR-032).** Offering makes the order
  `assigned`; only the offered driver's acceptance makes it `accepted`.
- **Declining returns the order** to the dispatcher (`confirmed`, reason
  `driver_declined`) and frees the driver. A driver cannot decline after
  accepting; they call the dispatcher, who withdraws.
- **Withdraw** works while the job is offered or accepted, not after the
  driver departs (then the failure or cancellation steps apply). The caller
  names the status it expects, so a withdraw of an offer cannot take back a
  job accepted a moment earlier (admin dispatch decision 1).
- **No automatic expiry** (technical lead, 2026-10-19): the dispatcher
  withdraws an unanswered offer.
- **Verified payload is a staff responsibility.** The CLI stores what it is
  given; it cannot check a vehicle.

## 7. Authentication and authorization requirements

The services take the acting `User`. Assigning and withdrawing need an
admin (checked by the state machine: rows 8, 10, 11); accepting and
declining need the offered driver (anyone else: 404, T-07). The CLI runs
with database access on the server and is for the technical lead only.

## 8. Error handling and edge cases

| Case | Result |
| --- | --- |
| Two offers of different orders to one driver at once | The driver profile row lock serializes them; the second is `busy`. The partial unique index backs this up |
| Two offers of one order to two drivers at once | The order row lock serializes them; the second fails; one live assignment |
| Same offer twice | Returns the existing assignment, no second row |
| Accept twice | Returns the accepted assignment, one event |
| Driver marked unavailable while holding a job | Keeps the job; gets no new offers |
| Admin cancels an order with a live assignment | Not handled yet: the cancellation feature must withdraw the assignment (see limitations) |
| Error after a rollback | Values for the error are read before rolling back; an async session cannot reload expired objects (LOG.md, 2026-10-19) |

## 9. Testing

```bash
cd backend && source .venv/bin/activate
pytest tests/test_dispatch.py                         # eligibility rules, CLI arguments
TEST_DATABASE_URL=... pytest tests/test_dispatch_integration.py
```

- `test_dispatch.py`: eligible driver; payload must cover the order; all
  reasons at once; non-driver and missing profile; CLI argument checks and
  phone normalization.
- `test_dispatch_integration.py` (database): assign then accept with the
  audit trail; ineligible drivers with exact reasons, order unchanged; T-07
  for accept and decline; decline returns the order and frees the driver;
  withdraw an accepted job, refused after departure, 404 when nothing is
  live; repeats and a held order; two concurrent races (one driver, two
  orders; one order, two drivers), stable over repeated runs; profile
  errors for non-drivers and unknown vehicles.
- The CLI was also run against the test database (add, list, refuse an
  unknown driver).

## 10. Known limitations

- **Service area and handling capability** (FR-031) are not checked:
  zones and transfer methods are not modelled.
- **One live job per driver**, whatever the vehicle; multi-drop rounds are
  not supported.
- **Cancelling an order with a live assignment** does not end the
  assignment yet; the cancellation feature must do it in the same
  transaction.
- **`completed`** is set by the driver's proof of delivery and failed
  attempt (#75, [driver-jobs.md](driver-jobs.md)); an admin failure or
  cancellation (rows 20, 23) does not set it yet.
- **No automatic offer expiry.**
- Vehicles cannot be deactivated or edited from the CLI yet (no command);
  `is_active` exists for that later.
