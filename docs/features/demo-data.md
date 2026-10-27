# Demo data

Requirements: BR-09, NFR-031 · Acceptance tests: T-13 (flag only; reports do not exist
yet) · Issues: S1-18 (#22), #63 (demo driver profile and zone)

## 1. Overview and purpose

One command seeds a small, clearly labelled dataset so the team can sign in as
each role and demo the customer-to-admin slice without database edits. Demo
data must never be mistaken for real pilot data (BR-09): demo orders carry
`is_simulated = true`, and demo accounts are recognizable by a reserved phone
block plus a "Demo" name.

## 2. Feature workflow

```
python -m app.modules.demo.seed
  APP_ENV=production?                -> refuse, exit 1 (before prompting)
  prompt for password (twice)        -> mismatch or bad length: exit 1
  seed_demo_data(session, password)
    for every reserved demo phone: look up the account
      exists but not the expected demo account -> DemoSeedError, nothing changed
    create missing demo accounts (existing ones keep their password)
    for each demo customer with no orders:
      validate each demo order with OrderCreate (the API's rules)
      orders.service.create_order(..., is_simulated=True)
    a zone named "Demo zone" exists?   -> reuse it
      else pricing.service.create_zone(actor = Demo Dispatcher)
    the demo driver has a driver profile? -> leave it unchanged
      else dispatch.service.create_vehicle_profile (demo tanker, 4,000 L)
           dispatch.service.set_driver_vehicle (approved, tanker,
             DEMO-001, 1,000 gal declared, Demo zone)
  print summary: counts, new references, zone and driver profile, demo phones
```

## 3. Important files

| File | Responsibility |
| --- | --- |
| `backend/app/shared/demo_accounts.py` | The demo-account rule: `DEMO_PHONE_PREFIX`, `DEMO_NAME_PREFIX`, `is_demo_phone`, `is_demo_identity` (shared by the seed and orders) |
| `backend/app/modules/demo/seed.py` | Dataset, `is_demo_account`, `seed_demo_data`, command |
| `backend/app/modules/orders/service.py` | `create_order(..., is_simulated=False)`; the seed passes True |
| `backend/app/modules/orders/router.py` | `POST /orders` passes `is_simulated=True` when the customer is a demo account |
| `backend/app/modules/auth/service.py` | `get_user_by_phone` (used to detect existing or conflicting accounts) |
| `backend/app/modules/pricing/service.py` | `list_zones`, `create_zone` (the demo zone) |
| `backend/app/modules/dispatch/service.py` | `list_driver_profiles`, `create_vehicle_profile`, `set_driver_vehicle` (the demo driver's profile; `declared_capacity_gallons` and `zone_id` added for #63) |
| `backend/tests/test_demo_seed.py` | Dataset and safety rules (no database) |
| `backend/tests/test_demo_seed_integration.py` | Seeding, re-running and conflicts against a real database |
| `README.md` | "Demo data" section |

## 4. Database models and relationships

No new tables or migrations. The seed writes ordinary rows:

| Data | How it is marked as demo |
| --- | --- |
| `users` | Phone in the reserved block `+23480000900NN` **and** name starting with `Demo ` (accounts have no simulated column) |
| `orders` | `is_simulated = true`; contact name, address, landmark and instructions start with "Demo" |
| `order_events` | One creation event per order, actor = the demo customer |
| `service_zones` | Named "Demo zone": active, centre 6.45, 7.51 (roughly central Enugu), no boundary, no delivery fees |
| `audit_logs` | `service_zone_created` for the demo zone, actor = Demo Dispatcher |
| `vehicle_profiles` | Type "Demo tanker, 1,000 gal (4,000 L)", safe payload 4,000 L |
| `driver_profiles` | The demo driver's: `approved`, available, `tanker`, plate `DEMO-001`, 1,000 gal declared, no transfer methods |
| `driver_service_zones` | The demo driver in "Demo zone" |

The dataset:

| Role | Name | Phone (local) | Orders |
| --- | --- | --- | --- |
| admin | Demo Dispatcher | 08000090001 | none |
| driver | Demo Driver | 08000090002 | none; approved tanker, see below |
| customer | Demo Customer One | 08000090011 | 1,200 L (preferred tomorrow, landmark), 600 L |
| customer | Demo Customer Two | 08000090012 | 2,000 L for "Demo Receiver Two" (preferred in 2 days, instructions), 3,000 L |

Demo customers are marked phone-verified, because orders need a verified
phone (FR-003) and their fictional numbers cannot receive SMS; customers
seeded earlier are marked verified on the next run.

Quantities are approved presets (SRS v0.2, FR-021). A database seeded before
that change keeps its older 25-500 L demo orders: customers who already have
orders are skipped.

Preferred dates are relative to today in Lagos, so they are never in the past.

The demo driver's details were chosen for #63 by @Bonvee120 (2026-10-27). A
tanker with a 4,000 L payload can carry every demo order (600 to 3,000 L), so
dispatch can offer them any of them. 1,000 local gallons is 4,000 L, the
mock's demo tanker. The payload is a demo value, not one staff verified
(FR-013); the vehicle's name says so. Transfer methods stay empty: an admin
sets them at approval (docs/api/partners.md, question 4), and dispatch does
not read them.

## 5. API endpoints

None. The data is visible through the existing endpoints: staff see
`is_simulated: true` and can filter on it (`GET /admin/orders?is_simulated=true`);
customers never see the flag (docs/api/orders.md), so demo text is labelled.

Orders a demo account sends through the app during a demo (`POST /orders`) are
also stored as simulated, so a live demo never adds "real" orders.

## 6. Important business rules

- **Never mistaken for real data (BR-09, NFR-031):** seeded orders are
  flagged, and so are orders a demo account places through the app; clients
  can never set the flag. Accounts need both markers: a real person who
  registers a reserved number does not become "demo" because their name fails
  the check, so their orders stay real.
- **No invented business state:** all demo orders are `quote_requested` with no
  price, because no later transitions or prices exist yet. Seeding other
  statuses would fake an order history.
- **Same rules as the API:** each demo order is validated with `OrderCreate`.
- **Idempotent:** existing demo accounts are reused and keep their passwords;
  demo customers that already have orders get none. A zone already named
  "Demo zone" (any case) is reused. A demo driver who already has a driver
  profile keeps it exactly as it is, even if it is offline or pending.
- **Demo zone, vehicle and plate are labelled by name:** these rows have no
  simulated flag, so each name starts with "Demo" or "DEMO".

## 7. Authentication and authorization requirements

The command needs direct database access (`DATABASE_URL`); it is a developer
tool, not an endpoint. The password is prompted for, never passed as an
argument or stored in code. Demo accounts sign in like any other account.

## 8. Error handling and edge cases

| Case | Result |
| --- | --- |
| `APP_ENV=production` | Refuses before prompting; exit 1 |
| Passwords differ or are outside 8-128 characters | Exit 1, nothing written |
| A reserved phone belongs to another account (wrong name or role) | `DemoSeedError`, nothing written, exit 1 |
| Run twice | Second run creates nothing and says so |
| Seed interrupted part-way | Re-run completes it (accounts are reused; customers without orders get them) |
| A reserved phone registered between the check and the insert | 409 from account creation, printed as an error |
| An admin already made a zone called "Demo zone" | Reused, never changed, even if inactive |
| The demo driver already has a profile (for example from `set-driver`) | Left unchanged; no demo vehicle is created |

## 9. Testing instructions

From `backend/` with the virtualenv active:

```bash
pytest tests/test_demo_seed.py
TEST_DATABASE_URL="$(grep '^DATABASE_URL=' ../.env | cut -d= -f2-)" pytest tests/test_demo_seed_integration.py
```

The integration tests delete every account in the reserved block (with its
orders, driver profile and audit entries), the demo vehicle and "Demo zone"
before and after each test. Re-run the seed afterwards if you use your local
database.

Manual check: run the seed twice and compare the summaries, then sign in to
the admin app as `08000090001` and filter on Simulated. Sign in to the
partner app as `08000090002`: it opens the tanker app, approved, with plate
`DEMO-001` and "Demo zone".

## 10. Known limitations

- Accounts have no `is_simulated` column; they are identified by phone block
  and name. Nothing stops a real person registering a reserved number (they are
  still not treated as demo, but the seed will refuse to run). Blocking
  reserved numbers at registration would change the auth contract.
- Reports that exclude simulated orders (FR-052, T-13) do not exist yet.
- No command to remove demo data; delete the reserved-block accounts and their
  orders by hand if needed.
- "Demo zone" is a normal active zone, so `GET /service-zones` lists it to
  anyone on a seeded database. Seed only demo and development databases.
- The demo driver is a tanker driver. The Keke rider app has no demo
  account on the real API; mock mode still covers it.
- Zones have no demo marker, so a real zone that someone named "Demo zone"
  would be reused.
- Only `quote_requested` orders, until transitions exist.
