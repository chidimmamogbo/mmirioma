# Order (delivery) state machine

Requirements: FR-031-FR-036, FR-038, FR-044, BR-06, BR-12, BR-13, NFR-004 ·
Acceptance tests: T-07 (driver and customer ownership), T-08 (no
`delivered` without proof), T-25 (unreachable conditions) · Contract:
[docs/api/deliveries.md](../api/deliveries.md) (agreed 2026-10-19) · Issue:
S1-06 (#7) · Design: none needed (SRS-derived)

## 1. Overview and purpose

Every order moves through the statuses of SRS v0.2 FR-033, from
`quote_requested` to `delivered` (or `cancelled`, `failed`, `disputed`).
This feature is the single place that decides whether a move is allowed:
by the actor's role, the order's current status, conditions recorded by
other features, and a reason where one is needed. It records every move.

It has **no endpoints**. Features that need transitions (driver assignment
S1-07, the driver workflow, proof of delivery, cancellation, payments) call
the service; their endpoints are agreed with them.

## 2. Feature workflow

```
caller feature (e.g. assignments) ─> service.transition_order(order_id, target, actor,
                                         satisfied, reason_code, note, assigned_driver_id)
  1. SELECT order FOR UPDATE                       (serializes concurrent requests)
  2. ownership: customer's own order / assigned driver, else 404 order_not_found
  3. already in target by the same actor's last event? return unchanged (no event)
  4. transitions.check_transition: status → actor → reason → conditions
  5. order.status = target; INSERT order_events (actor, from, to, reason_code, note)
  6. COMMIT
```

## 3. Important files

| File | Responsibility |
| --- | --- |
| `backend/app/modules/orders/transitions.py` | The transition table (`RULES`, one per contract row and actor), `Actor`, `Requirement`, `check_transition` |
| `backend/app/modules/orders/service.py` | `transition_order`: lock, ownership, harmless repeats, audit event |
| `backend/app/modules/orders/models.py` | `OrderStatus` (15 statuses), `TransitionReason`, `OrderEvent.reason_code` and `note` |
| `backend/alembic/versions/20261019_0005_add_delivery_statuses_and_event_reasons.py` | Migration `0005` |
| `docs/api/deliveries.md` | The contract this code follows |

## 4. Database models and relationships

Migration `0005` (revises `0004`):

- `orders.status` and `order_events.from_status` / `to_status` CHECK
  constraints allow the four new statuses `awaiting_payment`, `departed`,
  `arrived`, `unloading`.
- `order_events.reason_code`: varchar(40), nullable, CHECK against the
  reason codes (`ck_order_events_transition_reason`).
- `order_events.reason` renamed to `note`, now varchar(500).

No new tables. Assignment records (`assignments`) come with S1-07.

## 5. API endpoints

None. Planned endpoints and the rows they use are listed in
[deliveries.md](../api/deliveries.md#planned-endpoints-not-agreed). Errors
the service raises, which those endpoints will return:

| Status | Code | When |
| --- | --- | --- |
| 404 | `order_not_found` | Missing order, another customer's order, or a driver not assigned to it |
| 409 | `invalid_order_transition` | No rule from the current status to the target (`details.from`, `details.to`) |
| 403 | `forbidden` | A rule exists for that move, but not for this actor |
| 422 | `validation_error` | Reason code missing, not allowed for the row, `other` without a note, note over 500 characters |
| 409 | `transition_requirements_unmet` | A condition is not met (`details.missing`) |

## 6. Business rules

- **Status and payment are separate (BR-12).** Nothing here reads or sets
  payment status; conditions such as `payment_verified` are confirmed by
  the payments feature.
- **Prepaid orders only enter `awaiting_payment`** (rows 2, 5, 6); pay on
  delivery goes to `awaiting_confirmation` or straight to `confirmed`
  (rows 3, 4).
- **Only the assigned driver** accepts, declines and records the driver's
  steps. A dispatcher may record a step for an offline driver with reason
  `recorded_for_driver` (SRS §8), but never completes a delivery without
  approved alternative proof (rows 17-18, BR-13).
- **`delivered` needs proof (BR-06, T-08):** delivered quantity, unloading
  confirmed, and a verified delivery code or approved alternative proof.
- **Customer unreachable (FR-038):** the driver may fail the attempt only
  after two recorded contact attempts and 10 minutes since arrival.
- **Cancellation (FR-044):** a customer can cancel up to `arrived`, once the
  cancellation feature has worked out the charge; from `unloading` only an
  admin cancels, after review. `cancelled` is terminal; `failed` can be
  rescheduled; `disputed` resolves back to `delivered`.
- **Trust boundary.** `satisfied` holds conditions the calling feature
  confirmed from its own records. It must never come from a client.

## 7. Authentication and authorization requirements

Actors are derived from the signed-in user's role (`customer`, `admin`,
`driver`) or `system` when no user acts. Roles are checked per rule;
ownership by the service. Endpoints that call it will use the existing
`CurrentCustomer` / `CurrentAdmin` / `CurrentDriver` guards and CSRF.

## 8. Error handling and edge cases

| Case | Result |
| --- | --- |
| Driver taps the same step twice | Second call returns the order unchanged; one event |
| Driver accepts while the offer expires | Row lock: the second sees the new status and fails (409 or 403); one event from `assigned` |
| Skipping a step (`en_route` → `delivered`) | 409 `invalid_order_transition` |
| Customer cancels during `unloading` | 403 `forbidden` (admin review) |
| Same target, different actor | Not a repeat: checked as a move from the status to itself, so 409 |
| Downgrading `0005` after new statuses are used | Fails on the CHECK constraint; downgrade only before use |

## 9. Testing

```bash
cd backend && source .venv/bin/activate
pytest tests/test_order_transitions.py            # table rules, no database
TEST_DATABASE_URL=... pytest tests/test_order_transitions_integration.py
```

- `test_order_transitions.py`: the code has the same rows as the contract
  (parsed from deliveries.md); one rule per status pair and actor; every
  status reachable and only `cancelled` terminal; the driver's progression;
  T-08 (missing proof named, alternative proof accepted, admin needs
  override); skipped steps; wrong actors; reasons per actor, `other` needs a
  note; offline driver steps; T-25 conditions; reschedule and disputes;
  prepaid versus pay on delivery.
- `test_order_transitions_integration.py` (database): transitions applied
  and recorded with actor, reason code and note; T-07 for drivers and
  customers; repeats write one event; T-08 leaves the order unchanged;
  accept versus expiry race (stable over repeated runs); the database
  accepts the new statuses and rejects unknown reason codes.
- `test_orders.py`: the status list matches the contract.

## 10. Known limitations

- **The driver job endpoints (#75) now produce `departed`, `arrived` and
  `unloading`** (rows 9, 12-17, 19; see [driver-jobs.md](driver-jobs.md)).
  The admin screens label them; the customer app does not yet (its labels
  come with the customer progress design, Q3).
- **Three open questions** remain in the contract (early "unreachable",
  loaded vehicles skipping `collected`, dispute window); the offer timeout
  was decided (no automatic expiry for now).
- **Cancellation outcomes and approved alternative proof do not exist
  yet**, so rows 18 and 22 cannot happen until those features are built.
  Pickup records, delivery attempts, contact attempts and delivery proofs
  exist ([driver-jobs.md](driver-jobs.md)), as do assignments
  ([driver-assignment.md](driver-assignment.md)).
- Order history is recorded but not yet shown to customers or staff.
