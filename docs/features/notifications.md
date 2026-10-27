# In-app notifications (customers)

Issue: #82 (part 2 of 4) · Contract:
[customer-account.md](../api/customer-account.md#notifications) (agreed
2026-10-27, #11 and #48) · Requirements: FR-001, FR-027, FR-032, FR-037,
FR-050

Partners' in-app messages are in [partners.md](partners.md); both apps use
the same table and the same notification shape. This document covers the
customer side.

## 1. Overview and purpose

The customer app's notification list shows what happened to their orders.
FR-050 (P1) asks for configurable event messages; the SRS `notifications`
entity holds one row per message. These messages are the **in-app** channel
only: SMS messages (FR-050 P0, built in the messaging module) are separate
and unchanged.

## 2. Feature workflow

1. An order is created, or its status changes (`orders.service.create_order`
   and `transition_order`).
2. In the same transaction, `notifications.customer_messages.notify_status`
   adds the customer's message if that status has one. If the change is
   rolled back, so is the message.
3. The customer app reads `GET /me/notifications` (newest first, with the
   unread count for the badge) and marks messages read with
   `POST /me/notifications/read`.

## 3. Important files and their responsibilities

| File | Responsibility |
| --- | --- |
| `backend/app/modules/notifications/customer_messages.py` | Which status creates which message, and its text; the support number from `SUPPORT_PHONE` (FR-055) |
| `backend/app/shared/phone.py` | `format_phone_national`: the support number as the app writes it (`0813 377 4902`) |
| `backend/app/modules/notifications/router.py` | `GET /me/notifications`, `POST /me/notifications/read` (customer only) |
| `backend/app/modules/notifications/schemas.py` | `NotificationRead`, `NotificationPageRead`, `MarkReadRequest`, shared with `/driver/notifications` |
| `backend/app/modules/notifications/service.py` | Add, list (with unread count), mark read |
| `backend/app/modules/orders/service.py` | Calls `notify_status` when an order is created and on every applied transition |
| `backend/tests/test_customer_messages.py` | The status table, texts, the configured support number and the "received only at creation" rule (no database) |
| `backend/tests/test_customer_notifications_api.py` | Roles, CSRF, page body against the contract example, mark-read validation |
| `backend/tests/test_customer_notifications_integration.py` | Real orders: creation, confirm, offer, accept, repeat, cancel, mark read |

## 4. Database models and relationships

No migration. Rows go in the existing `notifications` table (channel
`in_app`), with `user_id` the order's customer and `order_id` the order.
Both foreign keys cascade, so messages go with their order or account.

## 5. API endpoints and request/response behavior

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/me/notifications` | none (`limit`, `offset`) | 200 page plus `unread_count`, newest first | 422 `validation_error` |
| POST | `/me/notifications/read` | `{"ids": [...]}`, `{}` or none | 204 | 422 `validation_error` (not UUIDs, over 100 ids, unknown field) |

Both also return the shared 401 and 403 (and 403 `csrf_failed` on the
POST). The page equals `docs/api/examples/customer-notifications-page.json`
in the API tests.

## 6. Important business rules

| Order moves to | `kind` | Title |
| --- | --- | --- |
| Created as `quote_requested` | `order_received` | Request received |
| Created as `awaiting_confirmation` (with a quote) | `order_received` | Order received |
| `confirmed` | `order_confirmed` | Order confirmed |
| `accepted` | `rider_assigned` | Rider assigned / Driver assigned |
| `en_route` | `on_the_way` | On the way |
| `delivered` | `delivered` | Delivered |
| `cancelled` | `cancelled` | Order cancelled |
| `failed` | `delivery_failed` | Delivery not completed |

- **No message for `assigned`** (FR-032): the customer does not learn of an
  offer before the driver accepts it. Every other status adds nothing.
- **`order_received` only at creation.** A priced order passes through
  `quote_requested` to `awaiting_confirmation` in one transaction and gets
  one message; a manual quote recorded at confirmation (row 26) adds none.
- **Text rules:** written on the server; never a water-quality claim or a
  delivery promise (FR-050), never a request worded as a confirmed delivery
  (FR-027), no time or live position (FR-037), never the delivery code (SRS
  §5). "Rider" for Keke orders, "driver" for tanker orders and for orders
  from before #21 that have no delivery type. The reference is shortened to
  7 characters ("MO-7KQ2"), as the app does. The request and delivered
  texts are the contract example's.
- **Support number (FR-055).** The cancelled and not-completed messages end
  with the support number, read from the `SUPPORT_PHONE` setting through
  `get_settings()` (never hard-coded) and written as the app writes it
  (`format_phone_national`): "Your order MO-7KQ2 was cancelled. Questions?
  Call 0813 377 4902." and "We could not deliver your order MO-7KQ2. Call
  0813 377 4902 to arrange another delivery." Changing the setting changes
  new messages only; stored messages keep the number they were sent with.
- A message never changes the order (FR-050). A harmless repeat of a
  transition (the same change by the same actor) writes no event and no
  second message.

## 7. Authentication and authorization requirements

Customer session only (FR-001); admins and drivers get 403 `forbidden`.
Each customer reads and marks only their own rows; unknown ids and other
people's ids in a mark-read request are ignored, so nothing can be probed.

## 8. Error handling and edge cases

- An idempotent retry of `POST /orders` returns the existing order and adds
  no message.
- A failed transition (invalid, or rolled back) leaves no message.
- Clients must show an unknown `kind` with a neutral icon and never fail on
  it (contract).

## 9. Testing instructions

```bash
cd backend
pytest tests/test_customer_messages.py tests/test_customer_notifications_api.py
# with the fork's test database (never the dev database; see docs/log):
TEST_DATABASE_URL=<mmirioma_fork_test URL> pytest tests/test_customer_notifications_integration.py
```

## 10. Known limitations

- The texts are fixed in code, not configurable by staff (FR-050 says
  "configurable"; no screen or contract covers editing them yet).
- No customer message for `departed`, `collected`, `arrived`, `unloading`
  or `disputed`: the contract lists none.
- Orders made before this change have no messages for their earlier steps.
- The customer screens still use their mocks until the lane B link issue.
