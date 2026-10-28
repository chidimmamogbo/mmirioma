# Customer account (profile, addresses, feedback, support and deletion requests)

Issue: #82 (parts 1, 3 and 4) · Contract:
[customer-account.md](../api/customer-account.md) (agreed 2026-10-27, #11 and
#48) · Requirements: FR-001, FR-010, FR-020, FR-024, FR-026, FR-051, FR-055,
NFR-002, NFR-004, NFR-005

Part 1 builds the profile read and saved addresses, part 3 order feedback,
part 4 support requests and the account deletion request (with the privacy
tool's new steps). Customer notifications (part 2) have their own document,
[notifications.md](notifications.md).

## 1. Overview and purpose

Customers keep delivery addresses to reuse when they order (SRS §5
`addresses`, §6 quotes take an `address_id`), each with the service zone
they picked (FR-020). The profile shows the account's name, phone,
verification and two counts. The customer app's Profile and Saved addresses
screens read these endpoints once their link issue is done.

## 2. Feature workflow

1. The customer opens the profile: `GET /me/profile` returns the name,
   phone, whether it is verified, when the account was made, and how many
   orders and saved addresses it has.
2. They add an address with a label, the address text, an optional
   landmark and a zone from `GET /service-zones`: `POST /me/addresses`. The
   first address becomes the default.
3. They edit one (`PATCH`), choose another default
   (`POST /me/addresses/{id}/default`) or remove one (`DELETE`).
4. Placing an order copies the address text into the order, so later edits
   never change it (FR-024).
5. After delivery, the customer rates the order:
   `PUT /orders/{reference}/feedback`; the order detail then shows it.
6. "Report a problem" sends `POST /me/support-requests`; the Help screen
   lists them with `GET /me/support-requests`. Staff follow up by phone.
7. "Delete my account" sends `POST /me/deletion-request`; the screen shows
   "Request received" with the acknowledge-by date while
   `GET /me/deletion-request` returns it. Staff call back, run the privacy
   tool and record the outcome (`set-deletion-status`).

## 3. Important files and their responsibilities

| File | Responsibility |
| --- | --- |
| `backend/app/modules/customers/models.py` | `CustomerAddress` (`customer_addresses`), shared with the admin side (#45) |
| `backend/app/modules/customers/schemas.py` | `AddressInput`, `AddressRead`, `AddressPageRead`, `CustomerProfileRead` |
| `backend/app/modules/customers/service.py` | The address rules, locking, audit rows, profile counts |
| `backend/app/modules/customers/router.py` | `/me/profile` and `/me/addresses` endpoints (customer only) |
| `backend/app/modules/customers/retention.py` | Deletes saved addresses for the privacy tool |
| `backend/app/modules/orders/service.py` | `count_customer_orders` for the profile |
| `backend/alembic/versions/20261027_0019_add_customer_addresses.py` | The table and its indexes |
| `backend/tests/test_customer_account_api.py` | Roles, CSRF, validation, bodies against the contract examples (no database) |
| `backend/tests/test_customer_account_integration.py` | Every rule against a real database |
| `backend/app/modules/orders/models.py` | `OrderFeedback` (`feedback`), part 3 |
| `backend/app/modules/orders/schemas.py` | `FeedbackInput`, `FeedbackRead`; `OrderRead` (customer) gains `feedback`, the shared fields move to `OrderBaseRead` so staff views stay without it |
| `backend/app/modules/orders/service.py` | `put_feedback`; `feedback_by_order` and `read_lookups(..., with_feedback=True)` for the customer views |
| `backend/app/modules/orders/router.py` | `PUT /orders/{reference}/feedback` |
| `backend/app/modules/orders/retention.py` | Blanks the feedback message when an order is anonymized |
| `backend/alembic/versions/20261027_0020_add_order_feedback.py` | The `feedback` table |
| `backend/tests/test_order_feedback_api.py`, `backend/tests/test_order_feedback_integration.py` | Feedback without and with a database |
| `backend/app/modules/customers/requests.py` | Support requests (idempotent send, list), deletion requests (one open, acknowledge-by date), the deletion status rules (part 4) |
| `backend/app/modules/customers/retention.py` | Also: request texts removed at anonymization, requests of deleted accounts, complaints resolved over 3 years ago |
| `backend/app/modules/privacy/` | `set-deletion-status`; anonymizing also clears request texts and deletes notifications |
| `backend/alembic/versions/20261027_0021_add_support_and_deletion_requests.py` | The two tables |
| `backend/tests/test_customer_requests_api.py`, `backend/tests/test_customer_requests_integration.py` | Requests without and with a database; the acknowledge-by date |

## 4. Database models and relationships

`customer_addresses` (migration `0019`):

| Column | Rule |
| --- | --- |
| `customer_id` | → `users`, RESTRICT, indexed |
| `zone_id` | → `service_zones`, RESTRICT, indexed. Required (FR-020) |
| `label` | 1-50 characters |
| `address` | 5-500 characters |
| `landmark` | Up to 200 characters, nullable |
| `is_default` | Partial unique index `uq_customer_addresses_one_default` on `customer_id` where `is_default`: never two defaults |

`feedback` (migration `0020`, SRS §5):

| Column | Rule |
| --- | --- |
| `order_id` | → `orders`, unique (one per order), CASCADE: feedback goes with its order |
| `rating` | SMALLINT, CHECK 1-5 (`ck_feedback_rating_range`) |
| `poured_by_partner` | Required boolean |
| `on_time`, `quantity_as_ordered`, `would_reorder` | Optional booleans |
| `message` | Up to 500 characters, nullable |

`support_requests` (migration `0021`): `reference` (`SR-` + 8, unique),
`user_id` and `order_id` (RESTRICT), `type` and `status` (CHECKs),
`message` (up to 1000), `idempotency_key` (unique per customer),
`resolved_at`, `resolved_by`, `resolution_note` (for the admin endpoints of
`admin-operations.md`, #22).

`deletion_requests` (migration `0021`): `reference` (`DR-` + 8, unique),
`user_id` (RESTRICT), `reason`, `status` (CHECK), `acknowledge_by` (date),
`acknowledged_at`, `completed_at`, `refused_at`, `refusal_reason`,
`handled_by`. `uq_deletion_requests_one_open`: at most one `received` or
`acknowledged` request per customer. `created_at` is `requested_at`.
`refused_at` and `refusal_reason` are not in the contract's "Data needed"
list; they record decision 10's "refused with a reason".

Latitude and longitude (SRS §5, optional) are not stored until a screen
collects them. The privacy tool deletes a customer's addresses before it
deletes or anonymizes the account, so the RESTRICT key never blocks it
([privacy tool](privacy-tool.md)).

## 5. API endpoints and request/response behavior

All under `/api/v1`, customer session only, CSRF on unsafe methods.

| Method | Path | Success | Errors |
| --- | --- | --- | --- |
| GET | `/me/profile` | 200 `CustomerProfileRead` | shared only |
| GET | `/me/addresses` | 200 page (`limit`, `offset`), default first, then newest | 422 `validation_error` |
| POST | `/me/addresses` | 201 address | 404 `service_zone_not_found`, 409 `address_limit_reached`, 422 `validation_error` |
| PATCH | `/me/addresses/{id}` | 200 address | 404 `address_not_found`, 404 `service_zone_not_found`, 422 `validation_error` |
| POST | `/me/addresses/{id}/default` | 200 address | 404 `address_not_found` |
| DELETE | `/me/addresses/{id}` | 204 | 404 `address_not_found`, 409 `default_address` |
| PUT | `/orders/{reference}/feedback` | 201 `Feedback` the first time, 200 when replaced | 404 `order_not_found`, 409 `order_not_delivered`, 422 `validation_error` |
| GET | `/me/support-requests` | 200 page, newest first | 422 `validation_error` |
| POST | `/me/support-requests` | 201 request; 200 on an idempotent retry | 404 `order_not_found`, 409 `idempotency_key_reused`, 422 `validation_error` |
| POST | `/me/deletion-request` | 202 new request; 200 with the open one | 422 `validation_error` |
| GET | `/me/deletion-request` | 200 the open request | 404 `deletion_request_not_found` |

`Feedback` is the body plus `submitted_at` (first submission) and
`updated_at`. The customer's `OrderRead` (`GET /orders`,
`GET /orders/{reference}`, `POST /orders`) carries it as `feedback`, or
null. Staff order views do not (the contract leaves staff views to #22,
which did not add it).

Bodies match the contract examples (`customer-profile.json`,
`saved-addresses-page.json`, `address-create-request.json`,
`error-default-address.json`); the API tests compare them field by field.
`PATCH` takes the whole `AddressInput`, as the contract says.

## 6. Important business rules

- **One default** whenever the customer has an address. The first address
  is the default whatever `make_default` says; `make_default: true` moves
  the default in the same transaction; `make_default: false` on the
  current default does not clear it.
- **The default cannot be removed while other addresses exist** (409
  `default_address`); the last remaining address can be removed (contract
  decision 5).
- **At most 20 addresses** (decision 6).
- **Zones:** an unknown zone is 404; an inactive one is accepted, and the
  quote refuses it (`outside_service_zone`, FR-010). The server never works
  a zone out from the address text.
- **Orders keep their copy** of the address (FR-024).
- **Audit** (NFR-004): `customer_address_added`, `customer_address_updated`
  (with the names of the changed fields), `customer_address_default_set`,
  `customer_address_removed`. Metadata holds ids and field names only,
  never the address text. Setting the current default again, or saving an
  address unchanged, writes no row.

**Order feedback** (FR-051, contract "Order feedback"):

- Only a `delivered` order can be rated (409 `order_not_delivered`); no time
  limit after delivery (decision 7).
- One feedback per order: `PUT` again replaces it (FR-051 duplicate
  protection). The order row is locked first, so two requests at once
  cannot both insert; the unique `order_id` is the last defence.
- `rating` (1-5) and `poured_by_partner` are required; the other three
  answers are optional, with no screen change now (decision 7). Strict
  types: `"5"` or `"yes"` is refused. A blank message becomes null.
- Never shown to drivers. Anonymizing the order (privacy tool) blanks the
  message and keeps the answers, which hold no personal data.

**Support requests** (contract "Support requests", decision 9):

- `type` is `late`, `wrong_quantity`, `payment`, `rider` or `other`;
  `message` 3-1000 characters; `order_reference` optional and must be the
  customer's own order (else 404 `order_not_found`).
- A retry with the same `idempotency_key` and details returns the stored
  request with 200; the same key with other details is 409
  `idempotency_key_reused` (the FR-026 pattern).
- A support request never changes the order. Staff resolve it through the
  admin endpoints of [admin-operations.md](../api/admin-operations.md),
  not built yet; until then every request stays `open`.

**Deletion requests** (contract "Account deletion", decisions 10 and 11;
privacy notice §9):

- The request deletes nothing; the account stays active and signed in.
- The privacy tool's monthly review deletes a request 3 years after it was
  completed or refused (#118); open requests are kept.
- Asking again while a request is `received` or `acknowledged` returns that
  request with 200.
- `acknowledge_by` is the Lagos date 3 working days later, Monday to Friday,
  public holidays ignored (a Monday request by Thursday; Friday or weekend
  by Wednesday). It is stored, so the date shown never changes.
- Audited as `deletion_requested`, without the reason.
- Staff record the outcome with the privacy tool's `set-deletion-status`
  (technical lead, 2026-10-27, #82): `received` → `acknowledged` →
  `completed`, or `refused` (with a reason) from either open status.
  `completed` is accepted only once `anonymize-customer --apply` has run, so
  the app never records a deletion that did not happen. After a refusal the
  customer can ask again.

## 7. Authentication and authorization requirements

Customer session only (FR-001): admins and drivers get 403 `forbidden`.
Every query filters on the signed-in customer, so another customer's
address answers 404 `address_not_found`, the same as one that does not
exist.

## 8. Error handling and edge cases

- **Concurrent writes** by the same customer (a double tap, two tabs) run
  one after the other: each write locks the customer's `users` row first,
  so the limit and the first-default rule cannot be raced. The partial
  unique index is the last defence.
- The old default is cleared in its own statement before the new one is
  written, because the unique index is checked per statement.
- Unknown fields, a label over 50 characters, a non-boolean `make_default`
  or a non-UUID id are 422 `validation_error`.
- A double tap on "Report a problem" sends the same `idempotency_key`
  twice: one request, the second answer 200. Two "Delete my account" taps
  give one request: the customer row is locked, and the partial unique
  index allows one open request.
- An anonymized customer's support request messages are replaced and the
  deletion reason blanked; the rows stay as records. Requests of an account
  deleted by the monthly review go with it; support requests resolved over
  3 years ago are deleted by the review (privacy notice §8).

## 9. Testing instructions

```bash
cd backend
pytest tests/test_customer_account_api.py tests/test_order_feedback_api.py tests/test_customer_requests_api.py tests/test_privacy.py
# with the fork's test database (never the dev database; see docs/log):
TEST_DATABASE_URL=<mmirioma_fork_test URL> pytest tests/test_customer_account_integration.py tests/test_order_feedback_integration.py tests/test_customer_requests_integration.py tests/test_privacy_integration.py
```

## 10. Known limitations

- Staff cannot resolve support requests in the app yet: the admin
  endpoints of [admin-operations.md](../api/admin-operations.md) need their
  own build issue.
- The customer is not notified in the app when staff acknowledge, complete
  or refuse a deletion request; staff tell them (privacy notice §9).
- The customer screens still use their mocks until the lane B link issue.
- No latitude or longitude on addresses yet (road distance needs them,
  SRS §12.1).
