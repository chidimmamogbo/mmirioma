# Service zones and zone delivery fees

Requirements: FR-010, FR-014, FR-020, FR-022, BR-01, NFR-004 · Acceptance
tests: T-02 (unsupported zone: no instant price), T-18 (no road distance:
zone price or manual quote) · Contract:
[admin-directory.md](../api/admin-directory.md#service-zones), "Service
zones" (agreed 2026-10-26, PR #38 and PR #41) · Issue: #30

## 1. Overview and purpose

FR-010: administrators configure the service zones customers order in, and
each zone carries delivery rates used as the FR-022 fallback when road
distance is unavailable. Road distance needs OSRM, whose hosting is still
open (SRS §12.1), so in the pilot the zone's fee **is** the delivery cost.

This feature stores zones with their coordinates, optional boundary and one
delivery fee per water category; lets administrators list, create and change
them; lets anyone list the active zones to pick from (FR-020); and gives the
quote (#21) a service function that returns a zone's delivery cost, or the
reason there is none.

## 2. Feature workflow

1. An administrator creates a zone (`POST /admin/service-zones`): name,
   active flag, centre (latitude and longitude typed in; no map provider is
   approved), optional boundary polygon, and a fee per water category.
2. The administrator changes it later (`PATCH /admin/service-zones/{id}`):
   only the fields sent change; a sent fee list replaces the whole list. A
   zone is never deleted, only switched off.
3. A customer (address step) or a partner (sign-up) loads the active zones
   (`GET /service-zones`, no session) and picks one. The server never works
   out a zone from address text (contract, "Which zone an address is in").
4. When #21 prices a quote, it calls
   `pricing.service.delivery_cost_from_zone(zone_id, water_category_id)`:
   - active zone with a fee for the category: that fee, once per order;
   - active zone without one: `delivery_cost_unavailable` (T-18);
   - no zone (area not listed) or an inactive zone: `outside_service_zone`
     (T-02).

   The quote then adds handling and margin from the price lists (#37) and
   answers `manual_quote_required` with the reason when there is no cost.

## 3. Important files

| File | Responsibility |
| --- | --- |
| `backend/app/modules/pricing/models.py` | `ServiceZone`, `ServiceZoneDeliveryFee`, the case-insensitive name index |
| `backend/app/modules/pricing/service.py` | List, create and update zones (with checks and audit rows); `list_active_zones`; `delivery_cost_from_zone` |
| `backend/app/modules/pricing/schemas.py` | Request validation (name, ranges, GeoJSON ring, fees) and response bodies |
| `backend/app/modules/pricing/router.py` | The four endpoints; thin |
| `backend/app/api/v1/router.py` | Registers the pricing router |
| `backend/alembic/versions/20261026_0014_add_service_zones_and_zone_delivery_fees.py` | The two tables and the name index |
| `backend/tests/test_service_zones_api.py` | Endpoint tests, no database |
| `backend/tests/test_service_zones_integration.py` | Service tests against PostGIS |

## 4. Database models and relationships

- `service_zones`: `name` (unique ignoring case through the expression
  index `uq_service_zones_name_lower` on `lower(name)`), `is_active`,
  `centre` (`geography(POINT, 4326)`, required), `boundary`
  (`geography(POLYGON, 4326)`, nullable), timestamps. No spatial index:
  nothing searches zones by location yet.
- `service_zone_delivery_fees`: `zone_id` → `service_zones`,
  `water_category_id` → `water_categories` (both RESTRICT),
  `fee_minor_units` (`BIGINT`, CHECK `>= 0`), unique (`zone_id`,
  `water_category_id`).

Nothing refers to zones yet. Saved addresses (customer and admin contracts),
driver zones and orders (`service_zone_id`, #21) will.

## 5. API endpoints and request/response behavior

| Method | Path | Who | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/admin/service-zones` | admin | 200 `{items: [ServiceZone], pilot_water_category}`, every zone by name, plus the pilot category (`{id, label}` or `null`, the one quotes price; #109) | shared 401/403 |
| POST | `/api/v1/admin/service-zones` | admin + CSRF | 201 `ServiceZone` | 404 `water_category_not_found`, 409 `service_zone_name_taken`, 422 `validation_error` |
| PATCH | `/api/v1/admin/service-zones/{id}` | admin + CSRF | 200 `ServiceZone` | 404 `service_zone_not_found`, 404 `water_category_not_found`, 409 `service_zone_name_taken`, 422 `validation_error` |
| GET | `/api/v1/service-zones` | anyone, no session | 200 `{items: [{id, name}]}`, active zones by name | 503 only |

`ServiceZone` has `id`, `name`, `is_active`, `centre {latitude, longitude}`,
`boundary` (GeoJSON `Polygon` or `null`), `fallback_delivery_fees`
(`[{water_category: {id, label}, fee_minor_units}]`, by label),
`created_at`, `updated_at`. Examples:
[admin-service-zones.json](../api/examples/admin-service-zones.json),
[admin-service-zone-write-request.json](../api/examples/admin-service-zone-write-request.json),
[service-zones.json](../api/examples/service-zones.json).

## 6. Important business rules

- **One fee per zone and category, per order** (contract open question 13,
  decided 2026-10-26): charged once whatever the number of trips. Integer
  kobo, 0 or more (BR-01). No fee for a category means no fallback for it.
- **Never an estimate** (FR-022): no other zone's fee, no distance guess,
  no admin-typed distance (open question 14: `distance_km` and `station_id`
  dropped).
- **The customer picks the zone** (FR-020, open question 6); no geocoding.
- **Eligibility** (FR-010) has no separate field: in the pilot a zone
  delivers a category when it has a fee for it (open question 15). SRS §5's
  "default pricing zone" is not stored; a `zone_id: null` price rule does
  that job (#37).
- **Switching a zone off** removes it from `GET /service-zones` and makes
  its quotes `outside_service_zone`; it never changes existing orders
  (FR-024). Zones are never deleted.
- **Names** are trimmed, 2-100 characters, unique ignoring case
  (`lower()`). Renaming a zone to its own name in another case is allowed.
- **Coordinates**: only the normal ranges are checked (latitude -90..90,
  longitude -180..180), no "inside Enugu" bound. A boundary is one closed
  outer ring of at least 4 positions (`[longitude, latitude]`); holes are
  refused, and PostGIS `ST_IsValid` refuses a ring whose edges cross.
- An **inactive water category** may still have a fee; whether a category is
  offered is checked when quoting (FR-014).

## 7. Authentication and authorization requirements

- Admin endpoints: signed-in, active `admin` (`CurrentAdmin`); customers and
  drivers get 403 `forbidden` (FR-001, T-07). `POST` and `PATCH` need the
  `X-CSRF-Token` header (403 `csrf_failed`).
- `GET /service-zones` needs no session (PR #41): partner sign-up runs
  before an account exists. It returns only active zone ids and names: no
  fees (customers see the total only), coordinates or boundary.
- Audit (NFR-004): `service_zone_created` (details: the fee category ids)
  and `service_zone_updated` (details: the names of the fields sent), in
  the same transaction as the change. An empty `PATCH` changes and records
  nothing.

## 8. Error handling and edge cases

- **Concurrent creates with one name:** the unique index decides; one
  succeeds, the others get 409 `service_zone_name_taken`. The early name
  check only gives a friendly answer; the commit turns an `IntegrityError`
  into the same 409.
- **Fee-only change:** the zone row itself does not change, so `updated_at`
  is set explicitly; a zone's "last changed" covers its fees.
- **PATCH nulls:** `null` clears `boundary`; `null` for `name`,
  `is_active`, `centre` or `fallback_delivery_fees` is 422 (send `[]` to
  remove every fee).
- **Validation:** a category listed twice, a fractional or negative fee, an
  unclosed or short ring, more than one ring, an out-of-range position and
  unknown fields are 422 `validation_error` with `loc`.
- **Unknown zone id** in `delivery_cost_from_zone`: 404
  `service_zone_not_found`, as `POST /quotes` answers for an unknown
  `service_zone_id`.

## 9. Testing instructions

```bash
cd backend && source .venv/bin/activate
ruff check . && ruff format --check .
pytest tests/test_service_zones_api.py
# With a separate test database, after alembic upgrade head:
TEST_DATABASE_URL=... pytest tests/test_service_zones_integration.py
```

- `test_service_zones_api.py` (no database, service faked): the examples
  validate against the schemas and match the response shape; 401 signed
  out, 403 for customers and drivers on every admin endpoint (T-07); CSRF;
  the public list with and without a session, `id` and `name` only;
  create and update arguments (which fields a PATCH sent); every validation
  rule; service error codes passing through.
- `test_service_zones_integration.py` (PostGIS): point and polygon round
  trip, fees with labels, audit rows; names unique ignoring case (create,
  rename, own name in another case); four concurrent creates with one name
  give one zone; unknown category; a crossing ring; partial updates, clearing
  the boundary, replacing and removing fees, `updated_at` on a fee-only
  change; the active list; `delivery_cost_from_zone` for a fee, T-18 (no fee
  for the category), T-02 (no zone, inactive zone) and an unknown zone.
- Migration: `alembic upgrade head`, `alembic downgrade -1`, `alembic upgrade
  head` and `alembic check` run on a local PostGIS database (2026-10-26).

Manual check: sign in as an admin, `POST /api/v1/admin/service-zones` with
the write example, then `GET /api/v1/service-zones` signed out.

## 10. Known limitations

- No quote uses the fee yet: `POST /quotes` is #21, and handling and margin
  need price lists (#37).
- No screen is linked: the admin Service areas screen has no latitude and
  longitude inputs (a G2 change in its link issue), and the customer and
  partner screens need a zone picker (#9, #14).
- No road distance (OSRM, SRS §12.1); the centre is stored for it but
  unused, and there is no spatial index.
- Zones cannot be deleted, by design; a mistaken zone is switched off.
- `GET /service-zones` has no rate limit; it is a small read of public
  names.
