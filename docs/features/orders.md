# Orders

Requirements: FR-001, FR-020, FR-021 (partial), FR-026, FR-027, FR-030 (creation-date
filter), FR-033 (statuses and creation only), NFR-004 (creation event), NFR-011, BR-09 ·
Acceptance tests: T-06, T-07 ·
Contract: [docs/api/orders.md](../api/orders.md) (`Status: agreed`, S1-16) · Issue: S1-03 (#4) ·
Order details (delivery type, details, source preference, zone; FR-010, FR-020, FR-021):
[order-details-and-price.md](../api/order-details-and-price.md) (`Status: agreed`, #42), built in #21

## 1. Overview and purpose

Customers submit water order requests and read their own orders. Admins
(dispatchers) see every order, filter the queue, and see who placed each one.

An order sent **without** a quote is a price-less request: it starts in
`quote_requested` and holds no amount until a dispatcher confirms it with a
manual total. An order sent **with** a server quote (`quote_id`, #21; see
[pricing.md](pricing.md)) goes straight to `awaiting_confirmation` with the
quote frozen on it; the dispatcher then confirms the quote's total.

Part 1 (#28) added persistence: tables, statuses, the public reference,
database-enforced idempotency and ownership rules. Part 2 adds the five HTTP
endpoints from the agreed contract.

## 2. Feature workflow

```
POST /api/v1/orders            (customer, X-CSRF-Token)
  OrderCreate validation        trim, phone -> E.164, limits, date >= today (Lagos)
  service.create_order
    look up (customer_id, idempotency_key)
      found, same details       -> 200 existing order
      found, different details  -> 409 idempotency_key_reused
      not found -> unknown zone? 404
                   quote_id? check it (404 / 409 expired / 422 mismatch /
                   409 no_eligible_source)
                   insert order (quote_requested, MO-XXXXXXXXXX)
                   + order_events row
                   + with a quote: row 3 -> awaiting_confirmation
                     (second event), commit -> 201
      IntegrityError (concurrent retry won / reference collision)
                   -> rollback, look up again (max 3 attempts)

GET /api/v1/orders              (customer)  own orders, newest first, paged
GET /api/v1/orders/{reference}  (customer)  own order, else 404 order_not_found

GET /api/v1/admin/orders        (admin)     all orders, filters, with customer and
                                      hold (deliveries admin router, admin-hold-review.md)
GET /api/v1/admin/orders/{reference} (admin) any order, with customer, its
                                      assignment and hold (deliveries admin router)
```

## 3. Important files

| File | Responsibility |
| --- | --- |
| `backend/app/modules/orders/models.py` | `Order`, `OrderEvent`, `OrderStatus`, field limits |
| `backend/app/modules/orders/service.py` | `NewOrder`, `generate_order_reference`, `create_order`, customer reads, staff reads (`StaffOrder`) |
| `backend/app/modules/orders/schemas.py` | `OrderCreate`, `OrderRead`, `AdminOrderRead`, page models, `PageParams`, `AdminOrderFilters` |
| `backend/app/modules/orders/quantities.py` | Quantity rules (FR-021): local gallon = 4 litres, 600-litre minimum, approved presets, gallon-to-litre conversion |
| `backend/app/modules/orders/router.py` | The three customer endpoints; role guards. The admin list and detail are served by `deliveries/admin_router.py`, which adds each order's hold (#93) |
| `backend/app/modules/auth/service.py` | `get_users_by_ids`, used for the staff view's customer details |
| `backend/app/shared/lagos_time.py` | Today in Lagos; start of a Lagos day in UTC |
| `backend/app/api/v1/router.py` | Registers the orders router |
| `backend/alembic/versions/20261015_0003_add_orders_and_order_events.py` | Migration `0003` |
| `backend/tests/test_orders.py` | Model and reference unit tests |
| `backend/tests/test_orders_api.py` | Endpoint unit tests (fake session and service) |
| `backend/tests/test_orders_integration.py` | Database and HTTP tests, including T-06 and T-07 |

## 4. Database models and relationships

Migration `0003` (revises `0002`). Part 2 adds no migration.

```
users 1 ──< orders 1 ──< order_events >── 0..1 users (actor)
```

**`orders`**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | Internal; only staff responses include it |
| `reference` | varchar(13), unique | `MO-` + 10 Crockford base32 characters (FR-027) |
| `customer_id` | UUID FK `users.id` ON DELETE RESTRICT | The ordering customer |
| `idempotency_key` | UUID | Unique together with `customer_id` (`uq_orders_customer_idempotency`) |
| `status` | varchar(30) + CHECK | One of the 15 statuses in [deliveries.md](../api/deliveries.md#statuses) (11 until migration `0005`) |
| `quantity_litres` | integer, CHECK 1–100000 | Whole litres. New orders must be 600 or more (request schema, FR-021); the wider CHECK keeps older, smaller requests valid |
| `contact_name` | varchar(100) | |
| `contact_phone` | varchar(16) | E.164 |
| `delivery_address` | varchar(500) | Free text |
| `landmark` | varchar(200), nullable | |
| `delivery_instructions` | varchar(500), nullable | |
| `preferred_delivery_date` | date, nullable | Preference only, not a slot |
| `is_simulated` | boolean, default false | Demo/test data (BR-09) |
| `created_at`, `updated_at` | timestamptz | Database `now()` |
| `source_id` | UUID FK `water_sources.id`, nullable | Since `0007`, for driver jobs ([driver-jobs.md](driver-jobs.md)) |
| `delivery_window_start_at`, `delivery_window_end_at` | timestamptz, nullable | Since `0007`. Confirmed window; both or neither, end after start. Stands in for a slot until FR-025 |
| `delivery_type` | varchar(10) + CHECK, nullable | Since `0016` (#21): `keke` or `tanker`; null on quantity-only requests |
| `keke_can_size_litres`, `keke_can_count` | integer, nullable | Keke only: 25 or 50 litres, and the number of jerrycans |
| `tanker_tank_type`, `tanker_quantity_local_gallons` | varchar(10) + CHECK / integer, nullable | Tanker only: `ground` or `overhead`, and the gallons sent |
| `water_source` | varchar(12) + CHECK, nullable | Tanker only: `ninth_mile` or `borehole`, a **preference** |
| `service_zone_id` | UUID FK `service_zones.id` RESTRICT, nullable, indexed | The zone the customer picked (FR-020) |
| `quote_id` | UUID FK `quotes.id` RESTRICT, nullable, indexed | Since `0017` (#21): the quote the order was placed with, frozen (FR-024) |

Indexes: `(customer_id, created_at)` for a customer's list, `(status,
created_at)` for the dispatcher queue, `source_id`, `service_zone_id`.

CHECK `ck_orders_delivery_details_shape` (since `0016`) allows three shapes:
no details (quantity-only), Keke details with `quantity_litres` = size x
count, or Tanker details with `quantity_litres` = gallons x 4 and a source
preference. No code path can store details that disagree with the litres.

**`order_events`**: `id`, `order_id` (FK `orders`, RESTRICT), `actor_id`
(FK `users`, RESTRICT, nullable for system actions), `from_status` (nullable
on creation), `to_status`, `reason_code` (varchar(40) + CHECK, nullable;
since `0005`), `note` (varchar(500), nullable; named `reason` before `0005`),
timestamps. Append-only. Transitions after creation are applied by
`service.transition_order` ([delivery-state-machine.md](delivery-state-machine.md)).

**Statuses (FR-033):** `quote_requested`, `awaiting_confirmation`,
`confirmed`, `assigned`, `accepted`, `collected`, `en_route`, `delivered`,
`cancelled`, `failed`, `disputed`. `draft` is not stored.

## 5. API endpoints

All under `/api/v1`; full contract in [docs/api/orders.md](../api/orders.md).

| Method | Path | Role | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | `/orders` | customer | 201 `OrderRead`; 200 on idempotent retry | 404 `service_zone_not_found`, 404 `quote_not_found`, 409 `idempotency_key_reused`, 409 `quote_expired`, 409 `no_eligible_source`, 422 `quote_mismatch`, 422 |
| GET | `/orders` | customer | 200 `{items: OrderRead[], total, limit, offset}` | 422 |
| GET | `/orders/{reference}` | customer | 200 `OrderRead` | 404 `order_not_found` |
| GET | `/admin/orders` | admin | 200 `{items: AdminOrderRead[], total, limit, offset}`; filter `on_hold` | 422 |
| GET | `/admin/orders/{reference}` | admin | 200 `AdminOrderDetail` (`AdminOrderRead` plus `assignment`; [admin-dispatch.md](admin-dispatch.md)) | 404 `order_not_found` |

`AdminOrderRead` carries `hold` (`id`, `kind`, `since`, or null) since #93;
see [admin-hold-review.md](admin-hold-review.md).

Every endpoint also returns 401 `not_authenticated` and 403 `forbidden`;
`POST` also 403 `csrf_failed`.

- **`OrderCreate`** (unknown fields rejected) comes in two shapes:
  - **Delivery details** (#21): `delivery_type` `keke` with
    `keke {can_size_litres: 25 | 50, can_count}`, or `tanker` with
    `tanker {tank_type: ground | overhead, quantity_local_gallons: 150–25000}`
    and `water_source` (`ninth_mile` | `borehole`). The details are the only
    source of the quantity: Keke size x count, Tanker gallons x 4, at least
    600 litres (422 on `keke.can_count` or `tanker.quantity_local_gallons`).
    Sending a quantity too, the wrong details for the type, or a source on a
    Keke order is 422.
  - **Quantity only** (the older shape, still accepted):
  exactly one of `quantity_litres` (JSON integer 600–100000) or
  `quantity_local_gallons` (150–25000, converted to litres × 4; FR-021);
  strings, decimals and booleans are rejected; `contact_name` (trimmed, 1–100), `contact_phone` (Nigerian mobile,
  normalized to E.164), `delivery_address` (trimmed, 5–500), optional
  `landmark` (≤200), `delivery_instructions` (≤500), `preferred_delivery_date`
  (today or later in Lagos). Optional text that is blank after trimming is
  stored as `null`.
  - Either shape may send `service_zone_id` (FR-020): an unknown id is 404
    `service_zone_not_found`; an inactive zone is accepted.
  - The details shape may send `quote_id` (#21), the quote from
    `POST /quotes`. Without `delivery_type` it is 422.
- **`OrderRead`**: `reference`, `status`, the request fields, `created_at`,
  `updated_at`, and (since #21) `delivery_type`, `keke`, `tanker`,
  `water_source` as sent and `service_zone` (`id`, current `name`); all
  null on quantity-only requests. `quote` (`currency`, `total_minor_units`,
  `water_category {label, supported_uses}`) is the quote the order was
  placed with, or null: the total only, never the breakdown. No ID,
  customer or `is_simulated`. The views get zone names and quote summaries
  from the pricing module through `service.read_lookups`.
- **`AdminOrderRead`**: `OrderRead` plus `id`, `customer` (`id`, `name`,
  `phone`, `phone_verified`) and `is_simulated`.
- **Paging:** `limit` 1–100 (default 50), `offset` ≥ 0.
- **Admin filters:** `status` (repeatable), `created_from` / `created_to`
  (inclusive Lagos dates; reversed range is 422 on `created_to`),
  `is_simulated` (`true`, `false`, or omitted for both).

## 6. Business rules

- **Quantity (FR-021, SRS v0.2):** stored in whole litres. A request gives
  litres or local gallons (1 local gallon = 4 litres), never both; the server
  converts and requires at least 600 litres. Idempotent retries compare the
  converted litres. With delivery details the server derives the litres:
  any can count that reaches 600 L is accepted (decision 4), and the tank
  type changes nothing (decision 5).
- **Water source preference (decision 10):** Tanker only. A preference for
  where the water is collected, never a quality claim (FR-014); the
  dispatcher still picks an eligible source at confirmation (FR-012).
- **Zone (FR-010, FR-020):** the customer picks it; the server never derives
  it from the address. An inactive zone is accepted on a request, because a
  quote request is FR-010's request-assistance path. The zone is kept when it
  is later switched off (FR-024). Names come through
  `pricing.service.zone_names`, not by reading the zones table.

- **No price column (FR-021, FR-022, SRS §12):** no amount column on
  orders; a quoted order points at its quote (`quote_id`), and the confirmed
  price is the confirmation's snapshot. A unit test fails if a money-like
  column is added to these tables, and `OrderCreate` rejects price fields.
- **Ordering with a quote (#21, contract "POST /orders changes"):** on a
  new key only, the quote is checked in this order: it exists and is this
  customer's (else 404 `quote_not_found`), it is unexpired (409
  `quote_expired`), it matches the order (422 `quote_mismatch`, `details`
  naming each field: type, Keke or Tanker details, `water_source`,
  `service_zone_id`, and the address ignoring case and spacing), and a
  source of the preferred kind is still eligible (409
  `no_eligible_source`). The order is created by row 1 and moved by row 3
  (the customer accepted a valid quote, pay on delivery, dispatcher check
  needed) in one transaction, with two events in order. A refusal writes
  nothing.
- **Idempotency (FR-026, NFR-011, T-06):** at most one order per
  `(customer_id, idempotency_key)`, enforced by a unique constraint so it holds
  under concurrent retries. A retry with identical details returns the
  existing order with 200. The same key with different details is 409
  `idempotency_key_reused`. "Same details" compares every field after
  normalization, so `08000000001` and `+2348000000001` are the same phone,
  and includes the delivery details, the zone and `quote_id` (#21). A retry
  runs before any quote check, so it returns the original order even after
  the quote expired.
  Keys are scoped per customer.
- **Reference (FR-027):** 10 characters from `secrets.choice` over Crockford
  base32 (about 50 bits), unrelated to the ID or time.
- **Ownership (FR-001, T-07):** customer reads filter by reference **and**
  customer, so another customer's order and a missing order give the same
  404. Admins read all orders. Drivers have no order access in Sprint 1.
- **Lagos dates (SRS §2.1):** `preferred_delivery_date` and the admin date
  filters are Africa/Lagos calendar dates. Lagos is a fixed UTC+1 with no
  daylight saving, so `lagos_time` uses a fixed offset rather than a time zone
  database. A `created_to` day ends at the start of the next Lagos day
  (23:00 UTC), exclusive.
- **Audit (NFR-004):** creation writes an `order_events` row in the same
  transaction as the order.
- **Simulated data (BR-09):** `is_simulated` defaults to false, cannot be set
  through the API, appears only in admin responses, and can be filtered there.
  The server sets it in two cases: the demo seed
  (`create_order(..., is_simulated=True)`), and `POST /orders` by a demo
  account, which the router detects with `is_demo_identity`
  (`app/shared/demo_accounts.py`; see [demo data](demo-data.md)).

## 7. Authentication and authorization requirements

- `POST /orders`, `GET /orders`, `GET /orders/{reference}`: `CurrentCustomer`.
- `GET /admin/orders`, `GET /admin/orders/{reference}`: `CurrentAdmin`.
- Session cookie required everywhere (401 otherwise); `POST` also needs the
  `X-CSRF-Token` header (403 `csrf_failed`). See
  [authentication](authentication.md).

## 8. Error handling and edge cases

| Case | Result |
| --- | --- |
| Same key, same details (sequential or concurrent) | 200 with the existing order; exactly one row |
| Same key, different details | 409 `idempotency_key_reused`; no new row |
| Another customer's reference, or unknown | 404 `order_not_found` (identical bodies) |
| Invalid body or query | 422 `validation_error`; `details[].loc` names the field or parameter |
| `created_from` after `created_to` | 422 on `created_to` |
| Keke or Tanker details below 600 L | 422 on `keke.can_count` or `tanker.quantity_local_gallons` |
| Unknown `service_zone_id` | 404 `service_zone_not_found` (after the idempotency lookup, so a retry still gets its order) |
| Unknown or another customer's `quote_id` | 404 `quote_not_found` (identical) |
| Expired quote; no eligible source of the preferred kind | 409 `quote_expired`; 409 `no_eligible_source` |
| Order differs from its quote | 422 `quote_mismatch`, `details[].loc` per field |
| `quote_id` without `delivery_type` | 422 `validation_error` |
| Details that disagree with the litres (any code path) | Refused by `ck_orders_delivery_details_shape` |
| Preferred date before today (Lagos) | 422 on `preferred_delivery_date` |
| Driver, or wrong role | 403 `forbidden` |
| Deleting a user who has orders | Blocked by RESTRICT foreign keys |

## 9. Testing

From `backend/` with the virtualenv active:

```bash
pytest tests/test_orders.py tests/test_orders_api.py   # no database
alembic upgrade head
TEST_DATABASE_URL="$(grep '^DATABASE_URL=' ../.env | cut -d= -f2-)" pytest tests/test_orders_integration.py
```

- `test_orders_api.py`: 401/403 for every role on every endpoint, CSRF, every
  field rule, 201 vs 200, query validation and response shapes.
- `test_t06_*`: sequential retry, 5 concurrent submissions, and the HTTP flow
  (201, 200, 409, one row).
- `test_t07_*`: identical 404 for someone else's and a non-existent reference,
  at service level and over HTTP; drivers get 403.
- `test_admin_filters_by_status_lagos_dates_and_simulated_flag`: orders
  back-dated to either side of a Lagos midnight, plus status, simulated and
  paging filters.
- `test_order_details_api.py` (no database): both delivery types and their
  litres, any can count reaching 600 L, the older shape with a zone, every
  validation rule with its `loc`, `service_zone_not_found` passing through,
  and `OrderRead` with details and zone.
- `test_order_details_integration.py`: details stored and read with the
  zone's name; the database CHECK refusing a mismatch; unknown zone refused,
  inactive accepted; retries comparing the details (T-06).
- `test_order_details_api.py` also passes `quote_id` through and lets each
  quote refusal through; `test_quotes_integration.py` covers ordering with a
  quote against the database ([pricing.md](pricing.md)).

Migration check (part 1): `alembic upgrade head && alembic downgrade -1 &&
alembic upgrade head && alembic check`.

## 10. Known limitations

- Transitions after creation are checked and recorded by
  `service.transition_order`, but no endpoint calls it yet (admin confirm,
  cancel and the delivery phase come with their features;
  [delivery-state-machine.md](delivery-state-machine.md)).
- Customer cancellation is defined (SRS v0.2 FR-044, deliveries contract
  row 22) but not built.
- The customer screens (#9) do not send `quote_id` yet. Water category and
  slots are set only at confirmation.
- The #99 fields of `OrderRead` (`delivery_window`, `price`,
  `water_category`) are agreed in `orders.md` but not built in the fork.
- `order_events` has no event type or metadata column, and customers cannot
  see the history yet.
- Admin date filters use creation date; a delivery-date filter waits for slots.
