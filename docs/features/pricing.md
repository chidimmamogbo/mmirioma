# Pricing: price lists

Requirements: FR-021, FR-022, FR-024, BR-01, NFR-004 · Acceptance tests:
T-09 (a later price change never changes an order) · Contract:
[admin-directory.md](../api/admin-directory.md#price-lists), "Price lists"
(agreed 2026-10-26) · Issue: #37 · Related:
[service-zones.md](service-zones.md) (#30, the zone delivery fee)

## 1. Overview and purpose

FR-022 prices a quote as **water cost + delivery cost + handling cost +
MmiriOma margin**. The water cost is the supplier's cost per litre, recorded
on the source's activation (FR-011, [water-sources.md](water-sources.md)).
Every other rate is admin-configured and lives in a **price list**: base
delivery fee, distance rate, additional-trip charge, handling and margin, by
zone, water category and quantity band.

This feature stores price lists as versions, lets administrators read and
save them, and gives the quote (#21) a function that picks the one rule that
prices a quote. It computes no quote itself.

## 2. Feature workflow

1. An administrator reads the current list (`GET /admin/price-lists/current`)
   and edits it.
2. They save the **whole** set of rules with the version they edited
   (`POST /admin/price-lists`, `base_version`). The server checks the rules,
   saves version n + 1, records what changed and takes it into use at once
   (open question 16: no future dating).
3. If another administrator saved first, nothing is saved (409
   `price_list_changed`, `details.current_version`); the screen reloads.
4. When #21 prices a quote, it calls
   `pricing.price_lists.match_price_rule(zone_id, water_category_id, litres)`
   and keeps the version it used on the quote (FR-024).

## 3. Important files

| File | Responsibility |
| --- | --- |
| `backend/app/modules/pricing/models.py` | `PriceListVersion`, `PriceRule`, `MarginType` |
| `backend/app/modules/pricing/price_lists.py` | Save (checks, changes, audit), read, `match_price_rule` |
| `backend/app/modules/pricing/schemas.py` | `PriceListCreate` (validation), `PriceListRead`, `PriceListPage` |
| `backend/app/modules/pricing/router.py` | The three endpoints; thin |
| `backend/alembic/versions/20261026_0015_add_price_lists.py` | The two tables |
| `backend/tests/test_price_lists_api.py` | Endpoint tests, no database |
| `backend/tests/test_price_lists_integration.py` | Service tests against PostGIS |

## 4. Database models and relationships

- `price_list_versions`: `version` (unique, 1 or more), `effective_from`
  (save time, UTC), `created_by` → `users`, `reason` (up to 500), `changes`
  (JSONB, worked out once at save).
- `price_rules`: `price_list_version_id` → `price_list_versions`, `position`
  (unique per version, the rule's index), `zone_id` → `service_zones` and
  `water_category_id` → `water_categories` (both nullable: "all"),
  `min_litres` (600 or more, FR-021), `max_litres` (nullable: no upper end,
  else at least `min_litres`), the four amounts in kobo (`BIGINT`, 0 or
  more), `margin_type` (`fixed` or `percentage`) with
  `margin_amount_minor_units` or `margin_basis_points` (0-10,000), CHECK
  `ck_price_rules_margin_shape`. All foreign keys RESTRICT.

Versions are never edited or deleted.

## 5. API endpoints and request/response behavior

| Method | Path | Success | Errors |
| --- | --- | --- | --- |
| GET | `/api/v1/admin/price-lists?limit=&offset=` | 200 page of `PriceList`, newest first | 422 `validation_error` |
| GET | `/api/v1/admin/price-lists/current` | 200 `PriceList` | 404 `price_list_not_found` |
| POST | `/api/v1/admin/price-lists` | 201 `PriceList` | 404 `service_zone_not_found`, 404 `water_category_not_found`, 409 `price_list_changed`, 409 `price_list_unchanged`, 422 `price_rules_overlap`, 422 `validation_error` |

`PriceList`: `version`, `effective_from`, `created_by {id, name}`, `reason`,
`rules[]` (with `id` and `margin` as `{"type": "fixed",
"amount_minor_units"}` or `{"type": "percentage", "basis_points"}`), and
`changes[]` (`path`, `from`, `to`; `from` is `null` for an added rule, `to`
`null` for a removed one; empty on version 1). Examples:
[admin-price-list.json](../api/examples/admin-price-list.json),
[admin-price-list-create-request.json](../api/examples/admin-price-list-create-request.json).

## 6. Important business rules

- **Matching** (contract, "Matching a quote to a rule"): a rule matches when
  its zone is the quote's or `null`, its category is the quote's or `null`,
  and the litres are inside its band (inclusive). The most specific wins: a
  zone's own rule beats an every-zone rule, then a category's own rule beats
  an every-category rule. **No match: a manual quote, never a guessed
  price** (FR-021, FR-022).
- **No overlaps:** two rules with the same zone and category cannot share
  litres (422 `price_rules_overlap`, `details` names each later rule), so
  matching never ties.
- **Handling is per order** (open question 18). The distance rate is stored
  but unused until OSRM exists; how the distance is rounded stays open
  (open question 17).
- **A percentage margin** applies to water + delivery + handling cost, in
  basis points (1 % = 100). Rounding to whole kobo and up to whole naira is
  the quote's job (#21, FR-022).
- **Unchanged rules** are refused (409 `price_list_unchanged`).
- Inactive zones and categories may have rules; whether they are offered is
  checked when quoting.

## 7. Authentication and authorization requirements

Admin only (`CurrentAdmin`): customers and drivers get 403 `forbidden`
(FR-001). `POST` needs the `X-CSRF-Token` header. Each save records an audit
row `price_list_saved` (NFR-004) with the version number and rule count only.

## 8. Error handling and edge cases

- **Concurrent saves:** the unique `version` decides; one succeeds, the
  others get 409 `price_list_changed` with the current version. A stale
  `base_version` gets the same answer before anything is written.
- **First list:** `base_version` must be `null`; it is required, so a client
  cannot save over a version it never saw.
- **Validation (422):** a band below 600 L or reversed, a negative or
  fractional amount, a margin over 10,000 basis points or with the wrong
  field, no rules, more than 100 rules, a reason over 500 characters,
  unknown fields (including a rule `id`).
- **Before the first save:** `current` is 404 and `match_price_rule`
  returns no match.

## 9. Testing instructions

```bash
cd backend && source .venv/bin/activate
ruff check . && ruff format --check .
pytest tests/test_price_lists_api.py
# With a separate test database, after alembic upgrade head:
TEST_DATABASE_URL=... pytest tests/test_price_lists_integration.py
```

- `test_price_lists_api.py`: the examples against the schemas; 401, 403 for
  customers and drivers (T-07), CSRF; paging and its limits; the margin
  shapes; the save arguments (trimmed or empty reason, both margin types);
  every validation rule; every service error code passed through.
- `test_price_lists_integration.py` (clears price lists in the test
  database): first list and a new version with its `changes` and audit rows;
  every refusal; four concurrent saves give one version; matching by zone,
  category and band; no list or no band gives no match.
- Migration: `alembic upgrade head`, `alembic downgrade -1`, `alembic upgrade
  head` and `alembic check` run on a local PostGIS database (2026-10-26).

## 10. Known limitations

- No quote uses price lists yet: `POST /quotes` is #21.
- No screen: the fork's admin Pricing page still shows the old flat prices
  on mocks and needs a redesign around FR-022 rates (G2) before it can link
  to these endpoints.
- The distance rate is unused until OSRM exists (SRS §12.1).
- Versions take effect when saved; scheduling a future version is not
  supported.
