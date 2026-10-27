# Admin operations (backend)

Issue: #102 (part 1: PR #115; part 2: the dashboard, live map, activity
and reports) · Contract: [admin-operations.md](../api/admin-operations.md)
(agreed 2026-10-27, #22, PR #71 and #81) · Requirements: FR-001, FR-030,
FR-031, FR-032, FR-034, FR-035, FR-037, FR-041, FR-052, FR-053, FR-055,
BR-09, NFR-003, NFR-004

The endpoints behind the admin shell badges, dashboard, live map, recent
activity, Reports page, Support page, audit log, header bell and read-only
Settings page. The admin screens are linked to them in a later link issue.

## 1. Overview and purpose

Staff need to see what waits on them and act on it: orders to confirm or
assign, customer support requests, and events from drivers and partners. The
contract gives each mock function in `frontend/src/features/admin/adminApi.ts`
an endpoint, or says why it gets none (payouts, points, refund as points and
saving settings are out of the MVP).

## 2. Feature workflow

1. **Something happens that staff must know about.** In the same
   transaction as the action, `notifications.admin_messages` adds one row
   per active admin:
   - a driver declines an offer (`dispatch.service.decline_assignment`);
   - a job goes on hold: a pickup at another source or with a safety
     concern, an unsafe incident, or alternative proof
     (`deliveries.service`);
   - a partner signs up (`partners.service.register_partner`);
   - a customer files a support request
     (`customers.requests.create_support_request`).
2. **The admin app polls the shell**, `GET /admin/shell`, for the sidebar
   badges and the bell count, and lists messages with
   `GET /admin/notifications`. Messages are marked read with
   `POST /admin/notifications/read`.
3. **Support.** Staff list requests (`GET /admin/support-requests`, open
   first), open one with the people to call, take any action the request
   needs through its own endpoint (alternative proof, withdraw, cancel),
   then resolve it with a note. The customer sees it as resolved.
4. **Audit and settings.** The Settings page reads the audit log
   (`GET /admin/audit-logs`) and the read-only settings
   (`GET /admin/settings`).
5. **Dashboard and reports.** The dashboard reads `GET /admin/dashboard`
   (one Lagos date), `GET /admin/live-map` and `GET /admin/activity`; the
   Reports page reads `GET /admin/reports` (today, 7 or 30 days) and builds
   its CSV from the response. Both count real records unless
   `simulated=only` is sent, and then simulated records only (BR-09).

## 3. Important files and their responsibilities

| File | Responsibility |
| --- | --- |
| `backend/app/modules/notifications/admin_messages.py` | The admin kinds, their texts, and one row per active admin |
| `backend/app/modules/notifications/admin_router.py` | `GET /admin/notifications`, `POST /admin/notifications/read` |
| `backend/app/modules/notifications/service.py` | `unread_count`, shared by the list and the shell |
| `backend/app/modules/customers/requests.py` | Admin list (search, open first), detail with contacts, resolve (audited, final), open count |
| `backend/app/modules/customers/admin_router.py`, `admin_schemas.py` | The three `/admin/support-requests` endpoints and their bodies |
| `backend/app/modules/audit/service.py`, `router.py`, `schemas.py` | `GET /admin/audit-logs`, one record's log with `target_type` and `target_id` |
| `backend/app/modules/reporting/` | New module, no table: shell, settings, dashboard, live map, activity and reports, reading other modules through their services |
| `backend/app/modules/orders/reporting.py` | Order counts (by status, delivery type, zone; "including open"), deliveries with on-time counts, recent events, all real or simulated (BR-09) |
| `backend/app/modules/dispatch/service.py` (part 2) | Oldest waiting order, available drivers, jobs on the road, deliveries per driver |
| `backend/app/modules/deliveries/holds.py`, `deliveries/service.py` | Open holds count; pickups per source |
| `backend/app/modules/payments/service.py` | `cash_totals`: cash collected and reconciled in a range |
| `backend/app/modules/sources/service.py` | `source_usability` (FR-012) and `source_names` |
| `backend/app/modules/customers/requests.py` (part 2) | `recent_support_requests` for the activity list |
| `backend/app/modules/dispatch/service.py` | `count_orders_needing_action` (shell) and `accepted_driver` (support contacts) |
| `backend/app/modules/auth/service.py` | `list_staff`: active admins with `last_sign_in_at` |
| `backend/app/modules/dispatch/service.py`, `deliveries/service.py`, `partners/service.py`, `customers/requests.py` | Call `admin_messages` before their commit |
| `backend/tests/test_admin_operations_api.py` | Roles, CSRF, validation, error codes, bodies against the contract examples, message texts (no database) |
| `backend/tests/test_admin_operations_integration.py` | Messages from real actions, support list, search, contacts and resolve, audit filter, shell and staff |
| `backend/tests/test_admin_reports_api.py` | Dashboard, reports, live map and activity: roles, query rules, bodies against the examples (no database) |
| `backend/tests/test_admin_reports_integration.py` | Real against simulated counts, ranges, on time, cash, buckets, per driver and per source, holds, live map, activity |

## 4. Database models and relationships

No migration. Part 1 uses existing tables:

- `notifications` (channel `in_app`): admin rows have `user_id` the admin
  and `order_id` the order, or null for `partner_pending` and a support
  request without an order. They go with their user and order (`ON DELETE
  CASCADE`).
- `support_requests` (revision `0021`, #82 part 4): `status`,
  `resolved_at`, `resolved_by` (an admin, `RESTRICT`) and `resolution_note`
  (up to 500 characters) are set by the resolve endpoint.
- `audit_logs`: one `support_request_resolved` row per resolution, with the
  request id and empty metadata.
- Read only: `orders`, `order_events`, `assignments`, `order_exceptions`,
  `cash_collections`, `pickup_records`, `driver_profiles`, `water_sources`
  with their category activations, `service_zones`, `users`,
  `user_sessions`.
- **Indexes checked** (the contract asks the build to): `orders` has
  `(status, created_at)` and `(customer_id, created_at)`. There is no index
  on `cash_collections.collected_at`, `order_events (to_status,
  created_at)` or `pickup_records.picked_up_at`, so those range filters
  scan the table. At pilot volumes (tens of orders a day) that is fast, and
  #102 adds migrations only if needed, so none is added; see Known
  limitations.

## 5. API endpoints and request/response behavior

All under `/api/v1`. Bodies are the contract's; each test compares the
response with its example in `docs/api/examples/`.

| Method | Path | Success | Errors |
| --- | --- | --- | --- |
| GET | `/admin/shell` | 200 `orders_needing_action`, `support_requests_open`, `notifications_unread` | shared only |
| GET | `/admin/settings` | 200 support contact, `delivery_code_validity_minutes`, staff | shared only |
| GET | `/admin/support-requests` | 200 page; `status` (`open`, `resolved`), `q` (1-100), `limit`, `offset` | 422 `validation_error` |
| GET | `/admin/support-requests/{reference}` | 200 the request plus `contacts` | 404 `support_request_not_found` |
| POST | `/admin/support-requests/{reference}/resolve` | 200 the resolved request (no `contacts`) | 404 `support_request_not_found`, 409 `support_request_already_resolved`, 422 `validation_error` |
| GET | `/admin/audit-logs` | 200 page, newest first; `target_type` with `target_id` | 422 `validation_error` (only one of them) |
| GET | `/admin/notifications` | 200 page plus `unread_count`, newest first | 422 `validation_error` (paging) |
| POST | `/admin/notifications/read` | 204; `{"ids": [...]}` (up to 100), `{}` or no body | 422 `validation_error` |
| GET | `/admin/dashboard` | 200; `date` (Lagos, default today, not in the future), `simulated` (`exclude` default, `only`) | 422 `validation_error` |
| GET | `/admin/reports` | 200; `range` (`today`, `7d`, `30d`; required), `simulated` | 422 `validation_error` |
| GET | `/admin/live-map` | 200 jobs on the road and every source; no GPS, no customer data | shared only |
| GET | `/admin/activity` | 200 newest order status changes and support requests; `limit` 1-20, default 5 | 422 `validation_error` |

Shared errors on every endpoint: 401 `not_authenticated`, 403 `forbidden`,
403 `csrf_failed` (POST), 422 `validation_error`.

## 6. Important business rules

- **Who is told (contract open question 1, built as proposed).** Every
  active admin gets their own row, with their own read state. Kinds:
  `driver_declined` (FR-032), `hold_opened` (FR-034, FR-035),
  `partner_pending`, `support_request`. A pickup that opens two holds sends
  one message. An offer, an incident that does not stop the job, and an
  idempotent retry of a support request send none.
- **Texts.** `driver_declined`, `partner_pending` and `support_request`
  match the contract example word for word. `hold_opened` is "An order is
  on hold" / "MO-… needs your review before the driver continues." No text
  has a customer phone, an address or a delivery code (SRS §5); staff
  messages use the full order reference.
- **Orders needing action** (shell): orders in `quote_requested`,
  `awaiting_confirmation` or `confirmed` with no offered or accepted
  assignment (FR-030, FR-031). Simulated orders are counted, since staff act
  on them too.
- **Support search.** `q` matches the request reference, the order
  reference or the customer name, ignoring case; `%` and `_` are matched
  literally. Open requests come first, then newest first.
- **Contacts.** The order's receiver (`contact_name`, `contact_phone`) and
  the driver of its current or last accepted assignment: `accepted`,
  `completed`, or `withdrawn` after acceptance. Without an order, the
  customer who wrote the request. Staff only (NFR-003).
- **Resolving** sets the status, time, admin and note, and changes nothing
  on the order (customer-account.md decision 9). It is final: no reopen
  (open question 5). The audit row has no note (NFR-004, audit module
  rule).
- **Real or simulated, never both** (BR-09). The dashboard and reports
  count orders whose `is_simulated` matches `simulated` (`exclude`: real,
  the default; `only`: simulated) and say which in `is_simulated`. Cash,
  pickups and deliveries follow their order. "Now" values (open holds, open
  support requests, available drivers, usable sources) are the same for
  both. The live map and activity are operational lists: every record,
  each with its flag.
- **Lagos days.** An order belongs to a day by `created_at`, a delivery by
  its first `delivered` event, cash by `collected_at`, a pickup by
  `picked_up_at`. `7d` is the 7 Lagos days ending today.
- **Dashboard orders** are those created on the date plus older ones still
  open (not delivered, cancelled or failed). `oldest_waiting_minutes`
  counts whole minutes, rounded down, from the oldest order waiting on
  staff.
- **On time** (FR-052): delivered at or before the confirmed window's end;
  an order without a window is never on time. The screen computes the rate
  (`on_time / with_window`).
- **Buckets, never guessed.** Orders without a delivery type count as
  `not_recorded`; orders without a zone go in one `by_zone` row with `null`
  id and name, left out when empty. `by_zone[].delivered` counts the
  zone's deliveries in the range by delivery time, so the rows add up to
  `deliveries.delivered`.
- **Per driver and per source.** A delivery's driver is the one on the
  order's `completed` assignment. Pickups at another source (no
  `source_id`) are not counted in `by_source`. No pay, refunds, costs or
  contribution are returned (F6, F7; partner pay is out of the MVP).
- **Usable sources** (FR-012): at least one category activation passes the
  shared eligibility check today.
- **Live map** (FR-037): orders with an accepted assignment in `accepted`
  through `unloading`, oldest first, placed by source and zone. No customer
  name, phone or address.
- **Activity:** order status changes and new support requests, newest
  first. The actor is the staff member or driver; `null` for the system
  and customers, so no customer name reaches the dashboard.
- **Settings are read only** (decision 4): `SUPPORT_PHONE` and
  `SUPPORT_WHATSAPP_ENABLED` (FR-055), the delivery code's 10 minutes
  (FR-035), and active admins by name. `last_sign_in_at` is the newest
  session's creation time; sessions do not record later use.

## 7. Authentication and authorization requirements

Every endpoint needs a signed-in, active `admin` (`CurrentAdmin`); customers
and drivers get 403 `forbidden` (FR-001). POST requests need the
`X-CSRF-Token` header. Each admin reads and marks only their own
notifications; unknown ids and other people's ids are ignored.

## 8. Error handling and edge cases

- Two admins resolving one request at once: the row is locked, so the second
  gets 409 `support_request_already_resolved`.
- A message is added in the action's transaction: if the decline, hold,
  sign-up or request is rolled back, so is the message, and adding one
  never changes an order (FR-050).
- An admin who is deactivated gets no new messages; their old rows stay.
- A request whose order has no accepted assignment lists only the receiver.
- Errors use the standard envelope; no message text, SQL or stack trace
  leaks.

## 9. Testing instructions

From `backend/` with the virtualenv:

```bash
ruff check . && ruff format --check .
pytest tests/test_admin_operations_api.py tests/test_admin_reports_api.py
TEST_DATABASE_URL=... pytest tests/test_admin_operations_integration.py tests/test_admin_reports_integration.py
```

The integration tests need a migrated test database (`alembic upgrade
head`). They check only rows for the admins they create, and the report
tests compare numbers before and after adding their own rows, so other data
in the database does not affect them.

## 10. Known limitations

- **`assignment_expired` is not created.** Offers never expire in the
  backend (admin dispatch decision 1; nothing sets the `expired` assignment
  status), so the contract's "an offer times out" message has no trigger.
  Whoever builds offer expiry adds it to `admin_messages` (technical lead,
  2026-10-27).
- `range` on `GET /admin/reports` has no default (the contract names
  none), so it is required.
- `by_zone[].delivered` counts deliveries in the range (see section 6);
  the contract does not define it further.
- `simulated=only` stays available in every deployment until open
  question 6 is decided.
- No index on `cash_collections.collected_at`, `order_events (to_status,
  created_at)` or `pickup_records.picked_up_at` (section 4). Add them in a
  reviewed migration if report queries slow down as data grows.
- The contract's open questions stay open: which events notify admins (1),
  urgent support requests (2), an order-level CSV (3), support hours (4),
  reopening a resolved request (5).
- The admin screens still run on their mocks until the link issue.
