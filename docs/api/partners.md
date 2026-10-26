# Partner account contract

Requirements: FR-001, FR-002, FR-013, FR-031, FR-032, FR-050, NFR-002, NFR-004 · Issue: #14 ·
Built in: not yet

**Status: proposed** on 2026-10-26 by @Bonvee120 (+ Claude Code), for review by
@nnamdi-security (backend, contract owner) and @chidimmamogbo (frontend). Not
agreed, not built. It becomes `Status: agreed` when both have approved it
(CLAUDE.md, "Team fork workflow").

The partner sign-up endpoint is also a **proposed amendment to the agreed
[auth contract](auth.md)**, which today says "There is no self-registration
for staff." That part needs @chidimmamogbo as the auth owner (lane A, #8) as
well as @nnamdi-security.

Conventions (errors, formats, phone numbers, pagination) are in
[README.md](README.md). Paths below omit `/api/v1`.

## What this covers

The partner apps (Keke rider and tanker driver, one `driver` role,
[api-mapping.md](../architecture/api-mapping.md#names)) call nine functions in
`frontend/src/features/partner/partnerApi.ts` that have no endpoint. This
contract covers six of them:

| Function | Endpoint | In this contract |
| --- | --- | --- |
| `partnerSignup` | `POST /auth/partner-register` | Yes, as an auth amendment |
| `getPartnerProfile` | `GET /driver/profile` | Yes |
| `updatePartnerProfile` | `PATCH /driver/profile` | Yes |
| `setOnline` | `PUT /driver/availability` | Yes |
| `listPartnerNotifications` | `GET /driver/notifications` | Yes |
| `markPartnerNotificationsRead` | `POST /driver/notifications/read` | Yes |
| `uploadDocument` | none | No: [open question 6](#open-questions) |
| `getEarnings` | none | No: [open question 7](#open-questions) |
| `requestPayout` | none | No: [open question 7](#open-questions) |

The last three stay on mocks. With the real API they keep showing "not
connected yet", and the earnings screens keep their "Sample" labels.

## Where this comes from

| Source | What it gives |
| --- | --- |
| `frontend/src/domain/partner.ts` | `PartnerProfile`, `PartnerNotification`, `PartnerSignupInput`, `ApprovalStatus` |
| `frontend/src/mocks/partnerMock.ts` | Behavior: only approved partners go online; sign-up starts `pending`; email and phone checks; the refusals `partner_not_approved` and `phone_already_registered` |
| `frontend/src/domain/tankCapacity.ts` | Tanker capacity typed at sign-up: 500 to 20,000 gallons |
| [handoff-v1.md](../design/handoff-v1.md) | Decision 6 (optional email), 9 and 9a (self sign-up with a vehicle type), 11c (capacity in gallons), 16 (wallet, payouts and rider pay are SAMPLE) |
| `backend/app/modules/dispatch/models.py` | `DriverProfile.is_available` (FR-031 availability), `VehicleProfile.safe_payload_litres` (FR-013) |
| SRS v0.3 | Every business rule below. Where the SRS is silent, the rule is an open question |

## Approval status

A partner account has an **approval status**, separate from the account's
`is_active` flag:

| Status | Meaning | Sign in | Go online | Offered jobs |
| --- | --- | --- | --- | --- |
| `pending` | Signed up; admin has not checked the vehicle yet | Yes | No | No |
| `approved` | Admin checked the vehicle and the partner may work | Yes | Yes | Yes, when eligible (FR-031) |
| `suspended` | Admin stopped the partner taking work | Yes | No | No |

`is_active = false` stays what it is today (FR-002, [auth.md](auth.md#roles)):
the account cannot sign in and its sessions stop working. Approval status
only applies to active accounts.

Rules:

- A new partner from `POST /auth/partner-register` starts `pending`, with
  `is_available = false`.
- Moving a partner to `pending` or `suspended` also sets `is_available =
  false`, so they drop out of dispatch at once.
- Only an admin changes approval status. The admin endpoint belongs to the
  riders contract in #18; this contract only defines the states.
- Existing drivers, created with the command-line tool, are backfilled as
  `approved` by the migration, so nothing changes for them.
- **Dispatch (amendment to [deliveries.md](deliveries.md#assignment-statuses-built-in-s1-07)):**
  row 8 eligibility gains the reason `not_approved` ("The partner's approval
  status is not `approved`"). This is additive. A pending or suspended
  partner is never offered a job, so their `GET /driver/jobs` lists are empty.

The SRS has no approval state. FR-002 only says "Admin can activate/deactivate
partner accounts", so this whole section is [open question 1](#open-questions).

## Partner object (`PartnerProfileRead`)

Returned by `GET /driver/profile`, `PATCH /driver/profile` and
`PUT /driver/availability`. Example:
[examples/partner-profile.json](examples/partner-profile.json) (approved Keke
rider), [examples/partner-profile-pending.json](examples/partner-profile-pending.json)
(tanker driver just after sign-up).

```json
{
  "id": "4a2e8c1d-6b3f-4e7a-9c15-2d8f0b6a7e31",
  "name": "Sample Rider",
  "phone": "+2348000000301",
  "email": null,
  "approval_status": "approved",
  "is_available": true,
  "partner_since": "2026-08-14",
  "vehicle": {
    "kind": "keke",
    "plate": "ENU-123-AB",
    "description": "Tricycle with 1,000 L tank",
    "declared_capacity_gallons": null,
    "declared_capacity_litres": null,
    "safe_payload_litres": 1000,
    "transfer_methods": ["ground"]
  },
  "service_zones": [{ "id": "8d0b2f4e-1c7a-4b9e-a3f6-5e2d9c8b7a10", "name": "GRA" }],
  "preferences": { "new_order_alerts": true, "sms_updates": true, "offers_and_news": false }
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `name`, `phone` | as the [User object](auth.md#user-object) | The signed-in partner's own account |
| `email` | string or `null` | Optional (decision 6). SRS §5 `users` has "phone/email". Used for updates and, only with `offers_and_news`, newsletters |
| `approval_status` | `pending`, `approved`, `suspended` | See [Approval status](#approval-status). Clients must not fail on a value they do not know |
| `is_available` | boolean | `DriverProfile.is_available` (FR-031 "availability"). The design calls it "online" |
| `partner_since` | `YYYY-MM-DD` (Africa/Lagos) | The day the account was created |
| `vehicle.kind` | `keke`, `tanker` | Chosen at sign-up (decision 9). Picks the app and the word "rider" or "driver". Named `kind` because `vehicle_profiles.vehicle_type` is already free text |
| `vehicle.plate` | string | As entered at sign-up, trimmed and upper-cased |
| `vehicle.description` | string or `null` | The vehicle profile's `vehicle_type` text, set by admin. `null` until admin links a vehicle profile |
| `vehicle.declared_capacity_gallons` | integer or `null` | Tanker only: what the driver typed at sign-up. `null` for Keke |
| `vehicle.declared_capacity_litres` | integer or `null` | `declared_capacity_gallons × 4` (1 local gallon = 4 L, [api-mapping.md](../architecture/api-mapping.md#quantities)). A claim, not a verified payload |
| `vehicle.safe_payload_litres` | integer or `null` | The **verified** safe payload from the vehicle profile (FR-013). `null` until admin verifies it. The design shows `[SAFE LOAD]` while it is `null` |
| `vehicle.transfer_methods` | list of strings | FR-013 "whether the operator can handle a given transfer method". Set by admin; empty until then. Values follow `tank_type` in [order-details-and-price.md](order-details-and-price.md#delivery-details): `ground`, `overhead`. See [open question 4](#open-questions) |
| `service_zones` | list of `{id, name}` | Zones the partner works in (FR-031 "service area"). Zones are defined by the zones contract in #30, not here. Empty until #30 is built |
| `preferences` | object of three booleans | See [Preferences](#preferences) |

Not in this object: documents ([open question 6](#open-questions)) and the
payout account ([open question 7](#open-questions)).

### Capacity: declared and verified

A tanker driver types their capacity in gallons at sign-up (design answer
11c). That figure is a **declaration**. An admin checks the vehicle and
records the verified safe payload in litres on the vehicle profile
(FR-013: "each vehicle's verified safe usable water payload in litres").
Dispatch uses only `safe_payload_litres` (BR-03, deliveries.md row 8
`over_payload`). A partner can never set or change the verified payload.

### Preferences

| Field | Default at sign-up | Meaning |
| --- | --- | --- |
| `new_order_alerts` | `true` | Tell me when a job is offered to me |
| `sms_updates` | `true` | Send job updates by SMS as well as in the app |
| `offers_and_news` | `false` | Newsletters and offers to my email (decision 6). Marketing consent, so it starts off |

The defaults are the mock's. The SRS has nothing on partner preferences
([open question 5](#open-questions)). Turning a preference off never stops
messages the SRS requires.

## `POST /auth/partner-register`

Proposed amendment to [auth.md](auth.md#endpoints). Partner self sign-up
(decision 9). Like `POST /auth/register`, it needs no session and no CSRF
token, and starts a session.

**Request** ([examples/partner-register-request.json](examples/partner-register-request.json))

```json
{
  "name": "Sample Driver",
  "phone": "08000000302",
  "password": "sample-password",
  "vehicle_kind": "tanker",
  "plate": "enu 456 cd",
  "declared_capacity_gallons": 4000,
  "service_zone_id": "8d0b2f4e-1c7a-4b9e-a3f6-5e2d9c8b7a10"
}
```

| Field | Rule |
| --- | --- |
| `name`, `phone`, `password` | As `POST /auth/register` ([auth.md](auth.md#identifier-and-password-rules)) |
| `vehicle_kind` | `keke` or `tanker` |
| `plate` | Trimmed and upper-cased. At least 4 characters (the mock's check). Format: [open question 3](#open-questions) |
| `declared_capacity_gallons` | Tanker: required, a whole number from 500 to 20,000 (`tankCapacity.ts`: 500 is the smallest tanker order; 20,000 only catches typos). Keke: must be `null` or absent |
| `service_zone_id` | An active zone from `GET /service-zones` (#30, [open question 2](#open-questions), decided) |

**201** `Session` with the session cookie, as `POST /auth/register`. The user
has `role: "driver"` and `phone_verified: false`. The partner starts
`pending` and unavailable.

**What the server records**

- The `users` row (`role = driver`, `is_active = true`) and a driver profile
  with `approval_status = pending`, `is_available = false`, the vehicle kind,
  plate, declared capacity and zone.
- No vehicle profile link yet: admin links or creates one when approving.
  `DriverProfile.vehicle_profile_id` is `NOT NULL` today, so the build needs a
  migration that makes it nullable (see [open question 8](#open-questions)).
- An audit log entry (NFR-004) and a notice for admin that a partner is waiting.

**Errors**

| Status | `code` | When |
| --- | --- | --- |
| 409 | `phone_already_registered` | The phone already has an account (any role) |
| 422 | `validation_error` | Any field rule above; `loc` names the field, for example `["body", "declared_capacity_gallons"]` |
| 429 | `too_many_attempts` | Shares the registration limit: 20 per IP per hour, whatever the outcome ([auth.md](auth.md#behavior-notes)) |

## `GET /driver/profile`

Driver session. **200** `PartnerProfileRead`.

| Status | `code` | When |
| --- | --- | --- |
| 401 | `not_authenticated` | No valid session |
| 403 | `forbidden` | The account is not a driver |

## `PATCH /driver/profile`

Driver session and CSRF. Changes the optional email and the preferences. Every
other field is admin-managed or fixed at sign-up.

**Request** ([examples/partner-profile-update-request.json](examples/partner-profile-update-request.json))

```json
{ "email": "rider@example.com", "preferences": { "offers_and_news": true } }
```

- Both fields are optional. An absent field is left as it is.
- `email`: `null` or `""` removes it. Otherwise trimmed and lower-cased, at
  most 254 characters, must look like `name@domain.tld` (as
  [public-site.md](public-site.md#post-newslettersubscriptions)). No
  confirmation email: none is sent (no email provider yet, SRS §12).
- `preferences`: any subset of the three booleans; the rest keep their value.

**200** `PartnerProfileRead`.

| Status | `code` | When |
| --- | --- | --- |
| 401 | `not_authenticated` | No valid session |
| 403 | `forbidden` | Not a driver |
| 403 | `csrf_failed` | Missing or wrong CSRF token |
| 422 | `validation_error` | Bad email or a non-boolean preference; `loc` `["body", "email"]` or `["body", "preferences", "<name>"]` |

## `PUT /driver/availability`

Driver session and CSRF. Going online or offline (FR-031 "availability").
Today the command-line tool sets `is_available`; this lets the partner set it.

**Request** ([examples/partner-availability-request.json](examples/partner-availability-request.json))

```json
{ "is_available": true }
```

**200** `PartnerProfileRead`. Setting the value it already has is not an
error.

Rules:

- Going **online** needs an active account (FR-002) and `approval_status =
  approved` ([Approval status](#approval-status)). Otherwise 403
  `partner_not_approved`.
- Going **offline** is always allowed, also for pending and suspended
  partners.
- Going offline does not touch a job the partner already holds: an offered
  job stays offered and an accepted job stays accepted (deliveries.md). It
  only stops new offers (row 8 `unavailable`).

| Status | `code` | When |
| --- | --- | --- |
| 401 | `not_authenticated` | No valid session |
| 403 | `forbidden` | Not a driver |
| 403 | `csrf_failed` | Missing or wrong CSRF token |
| 403 | `partner_not_approved` | Going online while `pending` or `suspended`. Example: [examples/error-partner-not-approved.json](examples/error-partner-not-approved.json) |
| 422 | `validation_error` | `is_available` missing or not a boolean |

## `GET /driver/notifications`

Driver session. The partner's in-app messages, newest first. FR-050 (P1,
SHOULD): "configurable event messages", with the `notifications` entity in
SRS §5 (`order_id or user_id`). The backend has **no notifications table
yet**; building this adds one.

Query: `limit` and `offset` ([pagination](README.md#pagination)).

**200** ([examples/partner-notifications.json](examples/partner-notifications.json))

```json
{
  "items": [
    {
      "id": "c3e1a9b0-5d7f-4a2c-8e6b-1f0d9a3c5b72",
      "kind": "assigned",
      "title": "Admin assigned you an order",
      "body": "MO-3HT8WQ2KZP · 600 L · Independence Layout",
      "reference": "MO-3HT8WQ2KZP",
      "created_at": "2026-10-26T09:12:00Z",
      "read_at": null
    }
  ],
  "unread": 1,
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

| Field | Notes |
| --- | --- |
| `kind` | One of the values below. Clients must not fail on one they do not know; they show its `title` and `body` |
| `title`, `body` | Written by the server from a template. Templates must not promise unverified delivery or water quality (FR-050) |
| `reference` | The order's public reference when the message is about one order, else `null`. Never the delivery code (SRS §5 `notifications`) |
| `read_at` | UTC timestamp, or `null` while unread |
| `unread` | Count of unread messages for the menu badge, across all pages |

Proposed `kind` values, from the mock:

| `kind` | Sent when | Source |
| --- | --- | --- |
| `assigned` | Admin offers the partner a job | FR-031, FR-032 |
| `reassigned` | Admin withdraws or cancels a job the partner held | deliveries.md rows 10 and 11 |
| `account` | Approval status changes (approved, suspended, back to approved) | [Approval status](#approval-status) |
| `new_orders` | New jobs near the partner | The design's job pool. No endpoint offers a pool yet ([api-mapping.md](../architecture/api-mapping.md#open-questions), question 6, #12), so this is not sent for now |
| `station_closed` | A refill station closes | Stations contract in #18 |
| `papers_due` | A partner document is about to expire | Not sent while documents are out ([open question 6](#open-questions)) |
| `payout` | A payout is sent | Not sent while payouts are out ([open question 7](#open-questions)) |

`sms_updates` and `new_order_alerts` decide whether a message also goes out
by SMS or push. The in-app message is always stored. A failed SMS or push
never changes an order's status (FR-050).

| Status | `code` | When |
| --- | --- | --- |
| 401 | `not_authenticated` | No valid session |
| 403 | `forbidden` | Not a driver |
| 422 | `validation_error` | Bad `limit` or `offset` |

## `POST /driver/notifications/read`

Driver session and CSRF. No body. Marks every unread message of the partner
as read, as the screen does when it opens. **204**.

| Status | `code` | When |
| --- | --- | --- |
| 401 | `not_authenticated` | No valid session |
| 403 | `forbidden` | Not a driver |
| 403 | `csrf_failed` | Missing or wrong CSRF token |

## Mapping to the design types

For the #12 and #13 adapters. Rules follow
[api-mapping.md](../architecture/api-mapping.md); any change to that file
goes in its own PR.

| Design (`domain/partner.ts`) | Contract |
| --- | --- |
| `PartnerProfile.approval` | `approval_status` |
| `PartnerProfile.online` | `is_available` |
| `PartnerProfile.vehicle.type` | `vehicle.kind` |
| `PartnerProfile.vehicle.tank_gallons` | `vehicle.declared_capacity_gallons` |
| `PartnerProfile.vehicle.safe_load_litres` | `vehicle.safe_payload_litres` (`null` shows `[SAFE LOAD]`) |
| `PartnerProfile.vehicle.can_pour_into` | Built from `vehicle.transfer_methods` |
| `PartnerProfile.vehicle.description` | `vehicle.description`; when `null`, the adapter builds it from `kind` and the declared capacity |
| `PartnerProfile.service_areas` | `service_zones[].name` |
| `PartnerProfile.documents` | Not returned. The adapter returns `[]`, and the papers screen keeps "not connected yet" for uploads |
| `PartnerProfile.payout_account_ending` | Not returned. The adapter returns `null` |
| `PartnerNotification.at` | `created_at` |
| `PartnerNotification.read` | `read_at !== null` |
| `PartnerSignupInput.vehicle_type` | `vehicle_kind` |
| `PartnerSignupInput.tank_gallons` | `declared_capacity_gallons` |
| `PartnerSignupInput.service_area` (free text) | `service_zone_id`; the sign-up screen needs a zone list from #30 |

## Open questions

Recommendations are proposals, not decisions.

1. **Approval status (FR-002).** The SRS defines only activate and
   deactivate. This contract adds `pending`, `approved` and `suspended`,
   separate from `is_active`, as decided by @Bonvee120 on 2026-10-26 for the
   proposal. Needs the owner to confirm that a pending or suspended partner
   may sign in, and what `suspended` means next to deactivation. For
   @nnamdi-security and @chidimmamogbo.
2. ~~**Zone at sign-up.**~~ **Decided** (@nnamdi-security, technical lead,
   2026-10-26): `GET /service-zones`
   ([admin-directory.md](admin-directory.md#get-service-zones), built in #30)
   needs no session, so sign-up can list the active zones (`id` and `name`
   only). Sign-up can be linked once #30 is built.
3. **Plate format.** The SRS has no rule. The mock asks for at least 4
   characters. Should the server check the Nigerian plate format, and how
   long can a plate be?
4. **Transfer methods (FR-013).** Who sets them, and which values? The design
   says Keke riders pour into "Drums, ground tanks" and tankers into "Ground
   and overhead tanks (pump)", but orders only know `ground` and `overhead`
   (#10). **Recommended:** admin sets them while approving, with the two
   `tank_type` values only, until the business adds drums.
5. **Preferences.** The SRS has no partner preferences, and FR-050 is P1.
   Which ones are kept, and what may `sms_updates` turn off? The P0 SMS
   messages in FR-050 go to customers, not partners, so none of them is
   affected.
6. **Documents.** Driver papers (licence, vehicle papers, training) are not in
   the SRS: its `documents` entity is for suppliers and sources only. A real
   upload needs private file storage (NFR-006), which is new infrastructure
   and needs approval first (CLAUDE.md). Decided by @Bonvee120 on 2026-10-26:
   no endpoint here; uploads stay "not connected yet". Needs the owner to
   decide whether driver documents are in the MVP at all.
7. **Earnings, wallet and payouts.** No SRS requirement covers partner pay,
   a wallet, payouts or a partner bank account. Design decision 16 marks
   them SAMPLE, "may be kept or removed", and PRD §3.2 lists wallets as a
   non-goal. Decided by @Bonvee120 on 2026-10-26: left out. The screens stay
   "not connected yet" with their "Sample" labels. The admin rider payouts in
   #22 should match. Needs the owner to decide whether partner pay is in the
   MVP.
8. **Pending partners and vehicle profiles.** A pending partner has no
   verified vehicle, but `DriverProfile.vehicle_profile_id` is `NOT NULL`.
   **Recommended:** make it nullable in the build migration and keep the
   declared vehicle on the driver profile. Dispatch already rejects a driver
   without a usable vehicle (`no_driver_profile`, `vehicle_inactive`). For
   @nnamdi-security.
9. **Partner phone verification.** FR-003 covers customers only, and
   [auth.md](auth.md#phone-verification-fr-003-fr-004) gives drivers 403 on
   the code endpoints. Should admin check a partner's phone before approval,
   by SMS code or by hand?

## Changes

| Date | Change | Agreed by |
| --- | --- | --- |
| 2026-10-26 | Proposed: partner sign-up (auth amendment), approval status, profile read and update, availability, notifications. Documents, earnings and payouts left out | Not yet |
