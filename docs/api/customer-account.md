# Customer account contract

Requirements: FR-001, FR-003, FR-004, FR-020, FR-027, FR-032, FR-050,
FR-051, FR-055, NFR-002, NFR-004, NFR-005 · Issue: #11 · Built in: not yet
(a build issue follows agreement)

**Status: agreed** (G3) on 2026-10-27 by @nnamdi-security (technical lead,
backend, contract owner) and @chidimmamogbo (frontend), on PR #60. Proposed
on 2026-10-26 by @Daveoski (+ Claude Code). Not built: a build issue follows.

**Brought to agreement (#48, 2026-10-26):** every open question decided by
@chidimmamogbo and applied; one notification shape shared with
[partners.md](partners.md#notifications) (#47). No question is left open. See
[Changes](#changes).

Covers the customer screens that run on mocks with no backend: profile, saved
addresses, order feedback, notifications, support requests, account deletion
and points. Fork functions (`frontend/src/features/customer/customerApi.ts`):
`getProfile`, `updateProfile`, `listAddresses`, `addAddress`,
`updateAddress`, `setDefaultAddress`, `removeAddress`, `submitFeedback`,
`listNotifications`, `markNotificationsRead`, `listTickets`, `createTicket`,
`requestAccountDeletion`, `getPoints`.

## Where this comes from

| Source | What it gives |
| --- | --- |
| `frontend/src/domain/orders.ts` | `CustomerProfile`, `SavedAddress`, `CustomerNotification`, `SupportTicket`, `ProblemType`, `PointsSummary` |
| `frontend/src/mocks/customerMock.ts` | Each function's behavior and refusals (`address_not_found`, `default_address`, `order_not_delivered`, field limits) |
| [handoff-v1.md](../design/handoff-v1.md) | Decision 6 (optional email for updates, newsletters and promo alerts), decision 16 (points are SAMPLE) |
| [PRIVACY_NOTICE.md](../../PRIVACY_NOTICE.md) | What the app collects (§3: **no email, no photographs**), how deletion is requested and handled (§9), retention (§8) |
| [privacy-tool.md](../features/privacy-tool.md) | How staff complete a verified deletion today (command line, no endpoint) |
| SRS v0.3 | Every business rule below; it is normative where it differs from the mocks |

### Where the design goes beyond the SRS or the privacy notice

| Design element | Conflict | This contract |
| --- | --- | --- |
| Optional **email** on the profile (decision 6) | The published privacy notice says "We do **not** collect your email address" (§3). There is no email provider (SRS §12.13) | **Left out of the pilot** ([decision 1](#decisions)). Adding it later needs a notice update first (NFR-005) |
| Profile **photo** (`photo_url`) | The notice says the app takes no photographs; the stack has no file storage | **Dropped.** The profile shows initials ([decision 2](#decisions)) |
| **SMS / WhatsApp / offers** switches | P0 SMS messages must be sent whatever the setting (FR-050, FR-035); WhatsApp is confirmed active on the support number (FR-055, [public-site.md](public-site.md), #8), and the switches stay out of the pilot all the same; offers and news are marketing, which the notice does not cover | **Left out of the pilot** ([decision 3](#decisions)) |
| **Points** and rewards (decision 16: SAMPLE) | Neither the SRS nor the PRD defines loyalty points | **Out of the MVP**, no endpoint ([decision 12](#decisions), [Points](#points)) |
| Notification kinds `points` and `payment` | Points: as above. Payment: the customer payment status has no design or contract yet (`orders.md`, decided question 3) | Left out; order kinds only |

## Common rules

- **Customer only.** Every endpoint needs a customer session (FR-001); staff
  and drivers get 403 `forbidden`. Each reads or changes only the signed-in
  customer's own records.
- **Not probeable.** Another customer's address, request or order gives the
  same 404 as one that does not exist, as `order_not_found` does
  ([orders.md](orders.md#behavior-notes)).
- **CSRF** on every unsafe request, and the shared 401, 403, 422 and 503
  errors from the [README](README.md#errors).
- **Lists** use the shared page shape and `limit` / `offset`
  ([README](README.md#pagination)), newest first unless stated.
- **Audit** (NFR-004): changes to the account and to addresses are recorded
  in `audit_logs` with no personal data in the metadata (field names only).
- **Unknown fields** in a body are 422 `validation_error`, as `OrderCreate`
  does today.

## Profile

### `GET /me/profile`

200 `CustomerProfile` ([customer-profile.json](examples/customer-profile.json)):

```json
{
  "name": "Sample Customer",
  "phone": "+2348000000001",
  "phone_verified": true,
  "customer_since": "2026-10-14T09:30:00Z",
  "stats": { "orders": 3, "addresses": 2 }
}
```

| Field | Rule |
| --- | --- |
| `name`, `phone`, `phone_verified` | As on the [User object](auth.md#user-object) |
| `customer_since` | `users.created_at` (UTC) |
| `stats.orders` | Count of this customer's orders, every status |
| `stats.addresses` | Count of saved addresses |

The design's `email`, `photo_url`, `preferences` and `stats.points` are not
returned ([decisions 1-3 and 12](#decisions)).

### Changing profile details

There is **no** `PATCH /me/profile` in the pilot, because every field above
already has its own route or rule:

- **Phone:** `POST /auth/phone-change` and `.../verify`, agreed in
  [auth.md](auth.md#phone-verification-fr-003-fr-004) (FR-004).
- **Name:** staff only, corrected after a request through the privacy tool
  (privacy notice §9, `correct-name` in
  [privacy-tool.md](../features/privacy-tool.md); [decision 4](#decisions)).
- **Email, photo and message preferences:** left out of the pilot
  ([decisions 1-3](#decisions)).

## Saved addresses

The SRS data model gives orders a "customer/address" and quotes an
`address_id` (SRS §5, §6), so customers keep addresses to reuse. A saved
address is profile data: kept while the account is open and removed with it
(privacy notice §8). An order copies the address text when it is placed, so
editing or removing a saved address never changes an order (FR-024 freezes
the order's inputs).

### Address object

([saved-addresses-page.json](examples/saved-addresses-page.json))

```json
{
  "id": "4e2a9c1b-7f3d-4b6e-a508-1c9d2e3f4a5b",
  "label": "Home",
  "address": "12 Sample Close, Independence Layout, Enugu",
  "landmark": "Opposite the blue gate",
  "zone": { "id": "9e8d7c6b-5a4f-4e3d-8c1b-0a9f8e7d6c5b", "name": "Independence Layout", "is_active": true },
  "is_default": true,
  "created_at": "2026-10-14T09:31:00Z",
  "updated_at": "2026-10-14T09:31:00Z"
}
```

| Field | Rule |
| --- | --- |
| `label` | Trimmed, 1–50 characters ("Home", "Office", "Mum's house"). The same rule as the admin side, since both write `customer_addresses` ([decision 13](#decisions)) |
| `address` | Trimmed, 5–500 characters, free text; same rule as `OrderCreate.delivery_address` |
| `landmark` | Optional, up to 200 characters; same as `OrderCreate.landmark`. Empty becomes `null` |
| `zone` | The service zone the customer picked for this address (FR-020), from [`GET /service-zones`](admin-directory.md#get-service-zones). `is_active` is read live: an address in a zone switched off stays saved, and its quote answers `outside_service_zone` (FR-010) |
| `is_default` | Exactly one address is the default whenever the customer has any |

Every saved address has a service zone, as on the admin side
([admin-directory.md](admin-directory.md#customers) `Address`, SRS §5
`addresses.zone_id`, FR-020). The customer picks it; the server never works it
out from the address text
([Which zone an address is in](admin-directory.md#which-zone-an-address-is-in),
agreed for #30). A customer whose area is not listed can still order with no
zone (a quote request), but cannot save that address.

### Endpoints

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/me/addresses` | none | 200 page of addresses, default first, then newest | 422 `validation_error` (query) |
| POST | `/me/addresses` | `AddressInput` | 201 address | 404 `service_zone_not_found`, 409 `address_limit_reached`, 422 `validation_error` |
| PATCH | `/me/addresses/{id}` | `AddressInput` | 200 address | 404 `address_not_found`, 404 `service_zone_not_found`, 422 `validation_error` |
| POST | `/me/addresses/{id}/default` | none | 200 address | 404 `address_not_found` |
| DELETE | `/me/addresses/{id}` | none | 204 | 404 `address_not_found`, 409 `default_address` |

`AddressInput` ([address-create-request.json](examples/address-create-request.json)):

```json
{ "label": "Office", "address": "4 Sample Road, GRA, Enugu", "landmark": null, "zone_id": "8d0b2f4e-1c7a-4b9e-a3f6-5e2d9c8b7a10", "make_default": false }
```

Rules (from the mock, plus the zone):

- `zone_id` is required; an unknown zone is 404 `service_zone_not_found`.
  As on the admin side, an inactive zone is not refused here: the quote
  checks the zone (`outside_service_zone`).
- The **first** address is always the default, whatever `make_default` says.
- `make_default: true` makes this address the default and clears the old
  one, in one transaction (on create or update).
- `make_default: false` on the current default does **not** clear it:
  change the default by choosing another address.
- The **default cannot be removed while other addresses exist**: 409
  `default_address` ("Choose another default address before removing this
  one"). The **last remaining** address may be removed, and the customer then
  has none ([decision 5](#decisions); the mock is stricter).
- At most **20** addresses per customer (409 `address_limit_reached`;
  [decision 6](#decisions)). The mock has no limit.

## Order feedback

FR-051: "Customer SHOULD be able to rate timeliness, unloading experience,
received quantity and willingness to reorder. Feedback SHALL be linked to
order and protected against trivial duplicate spam." SRS §5 `feedback`: id,
order_id, rating, timeliness, handling, reorder intent, message.

### `PUT /orders/{reference}/feedback`

One feedback per order. `PUT` (the SRS §6 path, with `PUT` instead of the
illustrative `POST`) creates it or replaces it, so a double tap or a later
edit never adds a second row; that is the duplicate protection FR-051 asks
for, as in the mock ([order-feedback-request.json](examples/order-feedback-request.json)):

```json
{
  "rating": 5,
  "poured_by_partner": true,
  "on_time": true,
  "quantity_as_ordered": true,
  "would_reorder": true,
  "message": "Very polite rider."
}
```

| Field | Rule | Source |
| --- | --- | --- |
| `rating` | Required, integer 1–5 | Design; SRS §5 `rating` |
| `poured_by_partner` | Required, boolean: did the rider or driver unload the water | Design; FR-051 "unloading experience", BR-04 |
| `on_time` | Optional boolean or `null` | FR-051 "timeliness" |
| `quantity_as_ordered` | Optional boolean or `null` | FR-051 "received quantity" |
| `would_reorder` | Optional boolean or `null` | FR-051 "willingness to reorder" |
| `message` | Optional, trimmed, up to 500 characters; empty becomes `null` | SRS §5 `message` |

The design asks only for `rating` and `poured_by_partner`. The other three
stay **optional** API fields, with **no screen change now** and **no time
limit** for feedback after delivery ([decision 7](#decisions)).

Success: 201 on first submission, 200 on replacement, with the `Feedback`
object (the body plus `submitted_at` and `updated_at`).

Errors:

| Status | `code` | When |
| --- | --- | --- |
| 404 | `order_not_found` | Not this customer's order, or none |
| 409 | `order_not_delivered` | The order's status is not `delivered` (mock rule: rate after delivery) |
| 422 | `validation_error` | Rating outside 1–5, message too long, unknown field |

`OrderRead` gains `feedback` (the `Feedback` object or `null`), additive, so
the order detail can show it. Feedback is never shown to drivers in this
contract; staff views are for #22.

## Notifications

What the app's notification list shows. The SRS `notifications` table holds
one row per message (order or user, template, channel, status, provider
reference, sent_at; SRS §5). This contract adds the in-app list as **channel
`in_app`** in that table, so there is one record of what was told to the
customer, whichever the channel.

**One shape for customers and partners** (#48, with @Bonvee120 on #47): the
notification object, the page and the mark-read request below are the same
as in [partners.md](partners.md#notifications); only the path (`/me/...`
here, `/driver/...` there) and the `kind` values differ.

### What creates a notification

Only order events the customer may know about, with template text written
on the server (FR-050: "Template language must not promise unverified
delivery or water quality"):

| `kind` | Created when the order moves to | Note |
| --- | --- | --- |
| `order_received` | `quote_requested` or `awaiting_confirmation` (created) | FR-027: never worded as guaranteed fulfilment |
| `order_confirmed` | `confirmed` | New kind; the design has no confirmed notice |
| `rider_assigned` | `accepted` | **Not** `assigned`: the customer must not learn of an assignment before the driver accepts (FR-032) |
| `on_the_way` | `en_route` | No live-tracking claim |
| `delivered` | `delivered` | |
| `cancelled` | `cancelled` | New kind |
| `delivery_failed` | `failed` | New kind |

The design's `points` and `payment` kinds are not created
([Where the design goes beyond](#where-the-design-goes-beyond-the-srs-or-the-privacy-notice)).
Clients show unknown kinds with a neutral icon and never fail on them.
Creating an in-app notification never changes order status (FR-050:
"Channel failure SHALL not mutate actual order status").

### Endpoints

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/me/notifications` | none | 200 page plus `unread_count`, newest first | 422 `validation_error` (bad `limit` or `offset`) |
| POST | `/me/notifications/read` | optional `{ "ids": [...] }`; no body or `{}` | 204 | 422 `validation_error` (`ids` not a list of UUIDs, or more than 100) |

Page ([customer-notifications-page.json](examples/customer-notifications-page.json)):

```json
{
  "items": [
    {
      "id": "9b1c2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e",
      "kind": "order_received",
      "title": "Request received",
      "body": "We have your request MO-7KQ2. We will confirm the price and time with you.",
      "reference": "MO-7KQ2M9XH4T",
      "created_at": "2026-10-26T12:35:00Z",
      "read_at": null
    }
  ],
  "unread_count": 1,
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

| Field | Rule |
| --- | --- |
| `kind` | One of the values above. Clients must not fail on one they do not know |
| `title`, `body` | Written by the server from a template (FR-050: no promise of unverified delivery or water quality) |
| `reference` | The order's public reference when the message is about one order, else `null`. Never the delivery code (SRS §5 `notifications`) |
| `read_at` | UTC timestamp, or `null` while unread |
| `unread_count` | Unread messages across **all** pages, for the badge |

`POST /me/notifications/read`:

- With `ids` (up to 100), marks those as read. Unknown ids, and ids of other
  people's messages, are ignored, so nothing can be probed.
- With no body or `{}`, marks every unread message of the customer as read.

Notification rows follow the **order's retention** (privacy notice §8) and
are removed when the account is anonymized. There is no separate 12-month
rule, so the notice needs no change ([decision 8](#decisions)).

## Support requests

What the "Report a problem" and "Help" screens send. The SRS has no support
ticket feature: the support number (FR-055) is the channel, and staff record
incidents and disputes on orders. This proposal stores a customer's written
message for staff to follow up, which the privacy notice already covers as
"complaints" (§8: kept 3 years after resolution).

### Support request object

([support-requests-page.json](examples/support-requests-page.json))

```json
{
  "reference": "SR-4K7M2Q9X",
  "type": "late",
  "message": "The water has not arrived yet.",
  "order_reference": "MO-7KQ2M9XH4T",
  "status": "open",
  "created_at": "2026-10-26T13:10:00Z",
  "resolved_at": null
}
```

| Field | Rule |
| --- | --- |
| `reference` | `SR-` and 8 random Crockford base32 characters, not sequential, so requests cannot be counted or probed (NFR-002, as FR-027 does for orders). The design's `#CP-004` style number is not used |
| `type` | `late`, `wrong_quantity`, `payment`, `rider`, `other` (the design's `ProblemType`) |
| `message` | Trimmed, 3–1000 characters (mock minimum 3; the maximum is a proposal) |
| `order_reference` | Optional; must be this customer's order, else 404 `order_not_found` |
| `status` | `open` or `resolved`; staff resolve requests (admin screens in #22) |

### Endpoints

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/me/support-requests` | none | 200 page, newest first | 422 `validation_error` (query) |
| POST | `/me/support-requests` | `{type, message, order_reference, idempotency_key}` | 201 request; 200 on idempotent retry | 404 `order_not_found`, 409 `idempotency_key_reused`, 422 `validation_error` |

([support-request-create-request.json](examples/support-request-create-request.json)).
`idempotency_key` works as on `POST /orders` (FR-026 pattern), so a retry
after a dropped connection does not file the same report twice.

A support request **is not a dispute**. Disputing a delivered order is the
separate `delivered → disputed` transition (row 24 in
[deliveries.md](deliveries.md#transitions), 48 hours, BR-16), not built yet.
A support request **never changes the order**; staff open the dispute (row
24) when a report needs one ([decision 9](#decisions)). Rows of support
requests carry personal
messages: staff see them, drivers never do.

## Account deletion

The privacy notice (§9) says how deletion works: the customer asks, staff
confirm the request comes from them "normally by calling back the phone
number on your account", acknowledge it within **3 working days**, aim to
finish within **14 calendar days**, check for open orders, unsettled cash,
refunds and disputes, then close and anonymize the account with the privacy
tool. Today the request can only be made by phone or email. This endpoint
adds the app as a third way to **ask**; it deletes nothing.

### `POST /me/deletion-request`

Body: `{ "reason": "Moving away" }` (optional, trimmed, up to 500 characters).

202 ([deletion-request.json](examples/deletion-request.json)):

```json
{
  "reference": "DR-8H3N6P2W",
  "status": "received",
  "requested_at": "2026-10-26T13:20:00Z",
  "acknowledge_by": "2026-10-29"
}
```

| Field | Rule |
| --- | --- |
| `reference` | `DR-` and 8 random Crockford base32 characters, to quote when staff call back |
| `status` | `received` from this endpoint. Staff then set `acknowledged`, `completed`, or `refused` with a reason, through the privacy tool, which records the outcome on the request ([decision 10](#decisions)) |
| `acknowledge_by` | Lagos date 3 working days after the request (privacy notice §9). Working days are **Monday to Friday, ignoring public holidays**, so the date is never later than the notice promises ([decision 11](#decisions)) |

Rules:

- The account **stays active** and the customer stays signed in: nothing is
  deleted until staff verify the request and run the privacy tool.
- A second request while one is open returns the **open** request with 200,
  never a second one.
- The request is recorded in `audit_logs` (NFR-004) with no reason text in
  the metadata.

### `GET /me/deletion-request`

200 with the open request, or 404 `deletion_request_not_found` when there is
none, so the screen can show "Request received" instead of the button.

## Points

**No endpoint is proposed.** Points and rewards are SAMPLE in the design
(decision 16) and neither the SRS nor the PRD defines them: how points are
earned, what they are worth, when they expire and how they are redeemed are
all business rules (CLAUDE.md: never invent them). `getPoints` stays on its
mock, and in real-API mode the Points screen shows its "not connected yet"
state, as the linking plan says for screens without a contract.

Points are **out of the MVP** until the business adds those rules to the SRS
([decision 12](#decisions)).

## Errors added by this contract

| Status | `code` | Where |
| --- | --- | --- |
| 404 | `address_not_found` | Address endpoints |
| 409 | `address_limit_reached` | `POST /me/addresses` |
| 409 | `default_address` | `DELETE /me/addresses/{id}` |
| 409 | `order_not_delivered` | `PUT /orders/{reference}/feedback` |
| 404 | `deletion_request_not_found` | `GET /me/deletion-request` |

Existing codes reused: `order_not_found`, `idempotency_key_reused`,
`validation_error`, `forbidden`, `not_authenticated`, `csrf_failed`.
Example: [error-default-address.json](examples/error-default-address.json).

## Data needed (for the build issue)

- `customer_addresses`: **the same table** as
  [admin-directory.md](admin-directory.md#data-needed) (one table, two sets
  of endpoints): the customer's user (RESTRICT), `zone_id` (required, foreign
  key to `service_zones`), `label`, `address`, `landmark`, `is_default`,
  timestamps; a partial unique index on the customer where `is_default`, so a
  customer can never have two defaults. `label` is 1–50 characters on both
  sides ([decision 13](#decisions)).
- `feedback` (SRS §5): `order_id` (unique), `rating`, `poured_by_partner`,
  `on_time`, `quantity_as_ordered`, `would_reorder`, `message`, timestamps.
- `notifications` (SRS §5) with channel `in_app` and a `read_at`: one table
  for customers and partners ([partners.md](partners.md#notifications)).
- `support_requests`: `reference` (unique), `user_id`, `order_id`
  (nullable), `type`, `message`, `status`, `idempotency_key` (unique per
  customer), `resolved_at`, `resolved_by`, timestamps.
- `deletion_requests`: `reference` (unique), `user_id`, `reason`, `status`,
  `requested_at`, `acknowledged_at`, `completed_at`, `handled_by`.
- **Privacy tool changes, part of the same build issue:**
  `anonymize-customer` also removes saved addresses, notifications, support
  request messages and the deletion reason, and blanks feedback `message`
  (privacy notice §9). Its retention review adds support requests resolved
  over 3 years ago (§8). A new step sets a deletion request's status
  (`acknowledged`, `completed`, or `refused` with a reason) and records the
  outcome on the request ([decision 10](#decisions)). The retention review
  also deletes deletion requests completed or refused over 3 years ago
  (privacy contact, 2026-10-27, #118; the same period as complaints);
  requests still `received` or `acknowledged` are never deleted.

All reviewed Alembic migrations; no new library.

## Mapping to the design types

For the linking adapters (`frontend/src/features/customer/real/`):

| Backend | Design (`domain/orders.ts`) |
| --- | --- |
| `CustomerProfile` | `CustomerProfile`: `email` `null`, `photo_url` `null`; `preferences` and `stats.points` have no backend value. The design type requires them, so linking needs a small type and screen change (switches and the points stat hidden), never a filled-in `false` or `0` that would look real |
| Address object | `SavedAddress`: same fields; `created_at` / `updated_at` dropped; `zone` dropped until the screen shows it. Adding and editing an address needs a zone picker on the screen (G2) |
| `Feedback` | `CustomerOrder.feedback` `{rating, poured_by_partner}` |
| Notification object | `CustomerNotification`: `created_at` → `at`; `read` = `read_at !== null`; `order_confirmed`, `cancelled`, `delivery_failed` are new kinds for the design to give icons |
| Support request object | `SupportTicket`: `reference` → `number`, `PROBLEM_LABEL[type]` → `title`, `status` same, `kind` `problem` |
| Deletion request | `requestAccountDeletion` returns a `SupportTicket`: `reference` → `number`, "Delete my account" → `title`, `kind` `question`, `status` `open` |

Where the design type needs a value the backend does not send, the adapter
shows it as missing, never a sample value (api-mapping.md, "Money": "A
missing price is shown as missing, never filled in", applied to every field).

## Decisions

All of the proposal's open questions were decided by @chidimmamogbo on
2026-10-26 (#48). The numbers are kept so review comments still match. No
question is left open.

1. **Email:** left out of the pilot. The privacy notice (§3) says the app
   does not collect email, and there is no email provider (SRS §12), so an
   email field has no use yet. Adding it later needs a notice update first
   (NFR-005). The same applies to partners (#47).
2. **Profile photo:** dropped; the profile shows initials.
3. **Message preferences:** all three switches (SMS, WhatsApp, offers and
   news) left out of the pilot.
4. **Name:** staff only, through the privacy tool (`correct-name`).
5. **Last address:** removing the last remaining address is allowed (the
   customer then has none); a default cannot be removed while other
   addresses exist (409 `default_address`).
6. **Address limit:** 20 per customer (409 `address_limit_reached`).
7. **Extra feedback questions:** no screen change now. The API keeps
   `on_time`, `quantity_as_ordered` and `would_reorder` as optional fields;
   no time limit for feedback.
8. **Notification retention:** notifications follow the order's retention
   (privacy notice §8) and are removed at anonymization. No separate
   12-month rule, so the notice needs no change.
9. **Support request vs dispute:** a support request never changes the
   order; staff open the dispute (row 24) when needed.
10. **Deletion request statuses:** staff set `acknowledged`, `completed` or
    `refused` (with a reason) through the privacy tool, which records the
    outcome on the request.
11. **Working days:** Monday to Friday, ignoring public holidays.
12. **Points:** out of the MVP until the business adds rules to the SRS.
13. **Address label:** 1–50 characters, trimmed. `admin-directory.md` uses
    the same rule (#43), since both write `customer_addresses`.

## Changes

| Date | Change | Agreed by |
| --- | --- | --- |
| 2026-10-27 | "Data needed": the retention review deletes deletion requests completed or refused over 3 years ago (#118) | @nnamdi-security (privacy contact), decided on the PR #106 review |
| 2026-10-27 | Agreed (G3); the switches row's WhatsApp reason updated (support WhatsApp was confirmed on #8), as @chidimmamogbo noted on PR #60 | @nnamdi-security (technical lead) and @chidimmamogbo, PR #60 |
| 2026-10-26 | Brought to agreement (#48): open questions 1-13 decided and recorded as "Decisions", and applied in the body (no email, photo or switches; name staff only; last address removable; 20-address limit; feedback fields optional, no time limit; notifications follow order retention; deletion statuses through the privacy tool; Monday-Friday working days; points out of the MVP; label 1-50); notification object, page and mark-read made one shape with partners.md (`read_at`, `unread_count`, optional `ids`); no later `PATCH /me/profile`; privacy tool changes named in "Data needed" | Decisions by @chidimmamogbo; contract not yet agreed |
| 2026-10-26 | Saved addresses carry the zone the customer picked (`zone`, required `zone_id`), one `customer_addresses` table shared with admin-directory.md, as agreed for #30; open question 13 added | Not yet |
| 2026-10-26 | Proposed: profile read, saved addresses, order feedback, in-app notifications, support requests, account deletion request; no points endpoint | Not yet |
