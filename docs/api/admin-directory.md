# Admin directory contract: customers, drivers, service zones, price lists

**Status: proposed** on 2026-10-26 by @Cloudcrackamara (+ Claude Code), for
review by @nnamdi-security or @chidimmamogbo (#18). Not agreed, not built.
It becomes `Status: agreed` when one reviewer other than its author has agreed
it (CLAUDE.md, "Team fork workflow", since 2026-10-27).

**Amended 2026-10-26 for #30** (service zones): open questions 5, 6, 13, 14
and 15 decided by @nnamdi-security; the zone's fallback rate is now one fee
per water category; customers list active zones with `GET /service-zones`.
See [Changes](#changes).

**[Service zones](#service-zones): `Status: agreed`** on 2026-10-26 by
@nnamdi-security (technical lead, sole approver under PR #36), so #30 can
build it. **[Price lists](#price-lists): `Status: agreed`** on 2026-10-26 by
@nnamdi-security (technical lead, #36), so #37 can build it. The rest of this
contract is still proposed.

The fork's admin Customers, Riders, Service areas and Pricing screens run on
mocks (`frontend/src/mocks/adminMock.ts`) and show "not connected yet" against
the real API. This contract proposes the endpoints that would let them leave
mocks. Conventions (base path `/api/v1`, formats, error envelope, CSRF,
pagination) are in the [README](README.md#conventions-apply-to-every-endpoint).

## What this covers

The fork functions `listCustomers` through `savePriceList` in
`frontend/src/features/admin/adminApi.ts`:

| Fork function | In this contract |
| --- | --- |
| `listCustomers`, `getCustomer`, `createCustomer`, `addCustomerAddress` | [Customers](#customers) |
| `verifyCustomerPhone` | **Not proposed**: FR-003 verification is by SMS code ([decision 4](#decisions-taken-in-18)) |
| `adjustPoints` | **Not proposed**: points belong to #11 ([decision 3](#decisions-taken-in-18)) |
| `listRiders`, `getRider`, `setRiderApproval`, `addRider` | [Drivers](#drivers) |
| `listStations`, `setStationOpen`, `saveStation`, `uploadStationPapers` | **Not proposed**: sources stay on the command-line tool ([decision 5](#decisions-taken-in-18)) |
| `listAreas`, `saveArea` | [Service zones](#service-zones) (built in #30) |
| `listPriceLists`, `savePriceList` | [Price lists](#price-lists) |

Functions that are not proposed keep their mocks and keep showing "not
connected yet" in real-API mode.

## Where this comes from

| Source | Used for |
| --- | --- |
| `frontend/src/mocks/adminMock.ts` | What each screen reads and writes, validation, error codes |
| `frontend/src/domain/admin.ts` | `AdminCustomer`, `AdminRider`, `ServiceArea`, `PriceList` and the input types |
| [handoff-v1.md](../design/handoff-v1.md) | Decisions 9, 10, 10a, 10b, 11c, 16 |
| SRS v0.3 | FR-001 to FR-004, FR-010 to FR-013, FR-020 to FR-024, FR-031, FR-042, BR-01, BR-09, §5 data model, §12, NFR-004 |
| [order-details-and-price.md](https://github.com/chidimmamogbo/mmirioma/pull/28) (#10, PR #28, proposed) | Decided there: FR-022 pricing only, "the admin Pricing screen is redesigned around FR-022 rates in #18"; one fixed pilot category |
| [auth.md](auth.md), [deliveries.md](deliveries.md#admin-dispatch-endpoints), [water-sources.md](../features/water-sources.md) | Existing accounts, driver profiles, vehicle profiles, eligibility, audit |

## Decisions taken in #18

Agreed with the lane owner (@Cloudcrackamara, 2026-10-26) before writing:

1. **Pricing follows FR-022.** The price list is a versioned set of FR-022
   rates, not the mock's flat per-can and per-tank prices. The Pricing screen
   needs a redesign (G2) in its own issue; this contract does not change it.
2. **Service zones are written here**, not in a separate #30 contract. #30
   builds them (comment on #30, 2026-10-26).
3. **Rider pay and points are not proposed.** The SRS has no rule for either;
   design decision 16 calls them "SAMPLE mocks; may be kept or removed later".
   Customer points stay with #11 ([open question 10](#open-questions)); rider
   pay is [open question 11](#open-questions).
4. **No staff phone verification.** FR-003 phone verification by SMS code is
   built (Termii, [auth.md](auth.md#phone-verification-fr-003-fr-004)). A
   customer created by staff starts unverified and verifies by SMS code before
   their first order. Whether staff may send that code for a caller is
   [open question 3](#open-questions).
5. **No admin endpoints for water sources.** Sources (the design's "refill
   stations") stay on the command-line tool (pilot fallback F1,
   [water-sources.md](../features/water-sources.md)).
6. **Driver approval follows FR-002**: an admin activates or deactivates a
   partner account (`users.is_active`). The design's `pending` state is
   [open question 7](#open-questions), with #14 (partner sign-up).
7. **Saved addresses are proposed here** for the admin side, following the SRS
   §5 `addresses` entity (with a zone, from this contract). #11 should reuse
   the same address shape for the customer side.

## Access rules

- Every endpoint requires a signed-in, active `admin` ([auth.md](auth.md)).
  Customers and drivers get 403 `forbidden` (FR-001). The one exception is
  [`GET /service-zones`](#get-service-zones), which needs no session.
- Unsafe requests (`POST`, `PATCH`) need the `X-CSRF-Token` header (403
  `csrf_failed`).
- Every write records an audit row (NFR-004) with the actor, the action, the
  target and ids only; never phones, addresses or notes in `details`
  (`backend/app/modules/audit/service.py`). Actions are listed in
  [Data needed](#data-needed).
- Responses here return phones and addresses to staff only (NFR-003: access
  to contact and address information is restricted to admins).

## Customers

### Objects

`AdminCustomerSummary`, one row of the customer list:

```json
{
  "id": "0b8f1c5e-2a7d-4d3e-9a51-6f0c2b7e9d14",
  "name": "Sample Customer",
  "phone": "+2348000000001",
  "phone_verified": true,
  "is_active": true,
  "orders_count": 3,
  "created_at": "2026-10-17T08:00:00Z"
}
```

| Field | Rule |
| --- | --- |
| `phone_verified` | `users.phone_verified_at` is set (FR-003) |
| `is_active` | `users.is_active` (FR-002) |
| `orders_count` | Every order of the customer, any status |
| `created_at` | The account's creation time; the design's "Customer since" |

`AdminCustomer`, the detail: `AdminCustomerSummary` plus:

```json
{
  "paid_total_minor_units": 4500000,
  "addresses": [ { "...": "Address" } ],
  "recent_orders": [
    {
      "reference": "MO-7KQ2M9XH4T",
      "created_at": "2026-10-24T09:30:00Z",
      "status": "delivered",
      "quantity_litres": 3000,
      "delivery_type": "tanker"
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `paid_total_minor_units` | Sum of the price snapshot totals (FR-024) of the customer's orders whose `payment_status` is `paid` ([payments.md](payments.md)). Integer kobo (BR-01). Paid only by staff or provider confirmation (BR-07), never by the customer's word |
| `addresses` | The customer's saved addresses, default first, then newest first |
| `recent_orders` | The 5 newest orders. `status` is the backend order status ([orders.md](orders.md#order-statuses-fr-033)); the adapter maps it with [api-mapping.md](../architecture/api-mapping.md#admin-order-status). `delivery_type` is `"keke"`, `"tanker"` or `null` for orders created before #21 |

The mock's `points` and `complaints` have no source: points are #11
([open question 10](#open-questions)) and the backend has no support tickets
yet (#22). The mock's `email` has no column; it stays out until #11 adds one.

`Address`, one saved address (SRS §5 `addresses`):

```json
{
  "id": "5c2d9e1a-7b3f-4a6e-8d0c-1f2e3a4b5c6d",
  "label": "Home",
  "address": "12 Sample Street, Independence Layout",
  "landmark": "Opposite the sample church",
  "zone": { "id": "9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b", "name": "Independence Layout", "is_active": true },
  "is_default": true,
  "created_at": "2026-10-20T10:00:00Z"
}
```

| Field | Rule |
| --- | --- |
| `label` | Trimmed, 2-50 characters. Design field ("Home", "Shop") |
| `address` | Trimmed, 5-500 characters, free text, as `delivery_address` in [orders.md](orders.md#order-object) |
| `landmark` | Optional, up to 200 characters, as in orders.md |
| `zone` | The service zone the address is in (SRS §5 `addresses.zone_id`, FR-020). `is_active` is read live; an address in an inactive zone stays saved, but orders to it are refused (FR-010) |
| `is_default` | `true` on exactly one address when the customer has any. The first address saved becomes the default (as the mock) |

### Endpoints

| Method | Path | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/admin/customers` | `q`, `limit`, `offset` | 200 `AdminCustomerPage` | 422 `validation_error` |
| GET | `/admin/customers/{id}` | none | 200 `AdminCustomer` | 404 `customer_not_found` |
| POST | `/admin/customers` | `CustomerCreate` | 201 `AdminCustomer` | 409 `phone_already_registered`, 422 `validation_error` |
| POST | `/admin/customers/{id}/addresses` | `AddressCreate` | 201 `AdminCustomer` | 404 `customer_not_found`, 404 `service_zone_not_found`, 422 `validation_error` |

All endpoints also return the shared 401, 403 and 422 errors from the
[README](README.md#errors).

#### GET /admin/customers

Accounts with role `customer`, newest first.

| Query | Rule |
| --- | --- |
| `q` | Optional, trimmed, 1-100 characters. Matches a part of the name (case-insensitive), or, with 4 or more digits, a part of the phone in E.164 or local `0…` form (as the mock) |
| `limit`, `offset` | [Pagination](README.md#pagination) |

`AdminCustomerPage` is the standard page plus one count for the list header:

```json
{ "items": [], "total": 0, "limit": 50, "offset": 0, "ordered_last_7_days": 0 }
```

`total` counts the customers matching `q`. `ordered_last_7_days` counts every
customer (not only the matches) with at least one real order created in the
last 7 × 24 hours; simulated orders are left out (BR-09). The mock calls it
`ordered_this_week`; whether the screen means a calendar week is
[open question 4](#open-questions).

#### GET /admin/customers/{id}

An id that is not a customer account is 404 `customer_not_found`, so staff
pages cannot read drivers or admins through it.

#### POST /admin/customers

Creates a customer account for someone who phoned in (design `a-create`
"+ New customer"). `CustomerCreate`:

```json
{ "name": "Sample Customer", "phone": "08000000001" }
```

| Field | Rule |
| --- | --- |
| `name` | Trimmed, 1-100 characters, as registration ([auth.md](auth.md#behavior-notes)) |
| `phone` | A Nigerian mobile, normalized to E.164 by the server ([auth.md](auth.md#identifier-and-password-rules)) |

- The account has role `customer`, `is_active: true` and **no verified
  phone**: it must verify by SMS code before its first order (FR-003,
  decision 4).
- It has no usable password. How the customer signs in later is
  [open question 2](#open-questions); until it is decided the account can
  only be ordered for by staff, if [open question 3](#open-questions) allows it.
- A phone that already has an account is 409 `phone_already_registered`
  (as registration).

#### POST /admin/customers/{id}/addresses

Saves an address on the customer (design `a-create` "+ Add address").
`AddressCreate`:

```json
{
  "label": "Home",
  "address": "12 Sample Street, Independence Layout",
  "landmark": "Opposite the sample church",
  "zone_id": "9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b"
}
```

`zone_id` is required: an address must have a zone (SRS §5, FR-020). An
unknown zone is 404 `service_zone_not_found`. An inactive zone is allowed
(staff may record the address); ordering checks the zone. Staff pick the zone
([Which zone an address is in](#which-zone-an-address-is-in), open question 6
decided). Returns the
whole customer, so the page redraws without a second request.

Editing, deleting and changing the default address are not proposed (no
admin design for them).

## Drivers

The design says "rider" (Keke) and "driver" (Tanker), together "partner"; the
server role is `driver` for both ([api-mapping.md](../architecture/api-mapping.md#names)).
Paths use `drivers`.

### Objects

`AdminDriver`:

```json
{
  "id": "7d1f4e8a-b6c9-4a1b-9c3d-4e5f0b8f1c5e",
  "name": "Sample Driver One",
  "phone": "+2348000000011",
  "is_active": true,
  "is_available": true,
  "vehicle": {
    "id": "3a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d",
    "type": "Tanker truck",
    "delivery_type": "tanker",
    "safe_payload_litres": 12000
  },
  "zones": [ { "id": "9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b", "name": "Independence Layout" } ],
  "live_jobs": 1,
  "completed_jobs": 42,
  "created_at": "2026-10-10T08:00:00Z"
}
```

| Field | Rule |
| --- | --- |
| `is_active` | `users.is_active`: the account may sign in and be assigned work (FR-002, FR-031) |
| `is_available` | `driver_profiles.is_available`: can take new work now (FR-031 availability). The design's "Online". Set by the driver (#14) or the command-line tool, not here |
| `vehicle` | The driver's vehicle profile (FR-013), or `null` if the driver has no profile. `delivery_type` is new (`"keke"` or `"tanker"`, [Data needed](#data-needed)); it picks the design's word and app (design decision 9). `safe_payload_litres` is the verified safe payload per trip; the design shows a tanker's as gallons (÷ 4, [api-mapping.md](../architecture/api-mapping.md#quantities)) |
| `zones` | The service zones the driver serves (FR-031 "service area"), by name |
| `live_jobs` | The driver's assignments with status `offered` or `accepted` ([deliveries.md](deliveries.md#assignment-statuses-built-in-s1-07)). The design's "active orders" |
| `completed_jobs` | Assignments with status `completed`. The design's "trips" |
| `created_at` | The design's "Partner since" |

Not in `AdminDriver`, because the SRS has no rule or the backend no record
for them: `code` (fleet code), `vehicle.plate`, `rating`,
`today_minor_units`, `payout_due_minor_units`, `documents_note`,
`reported_issues` ([open questions 8, 9 and 11](#open-questions)).

### Endpoints

| Method | Path | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/admin/drivers` | `delivery_type`, `is_active`, `q`, `limit`, `offset` | 200 `AdminDriverPage` | 422 `validation_error` |
| GET | `/admin/drivers/{id}` | none | 200 `AdminDriver` | 404 `driver_not_found` |
| POST | `/admin/drivers` | `DriverCreate` | 201 `AdminDriver` | 404 `service_zone_not_found`, 409 `phone_already_registered`, 422 `validation_error` |
| POST | `/admin/drivers/{id}/activation` | `ActivationChange` | 200 `AdminDriver` | 404 `driver_not_found`, 422 `validation_error` |

All endpoints also return the shared 401, 403 and 422 errors from the
[README](README.md#errors).

#### GET /admin/drivers

Accounts with role `driver`, by name.

| Query | Rule |
| --- | --- |
| `delivery_type` | Optional, `keke` or `tanker` (design pills "Keke", "Tanker") |
| `is_active` | Optional boolean. `false` is the design's "Suspended" pill |
| `q` | As for customers, also matching the vehicle type |
| `limit`, `offset` | [Pagination](README.md#pagination) |

`AdminDriverPage` is the standard page plus counts over every driver, ignoring
the filters, for the pills and the header:

```json
{
  "items": [], "total": 0, "limit": 50, "offset": 0,
  "counts": { "all": 0, "keke": 0, "tanker": 0, "inactive": 0, "available": 0 }
}
```

The design's "Pending" pill and count have no source until
[open question 7](#open-questions) is settled.

#### POST /admin/drivers

Adds a Keke rider or tanker driver from the office (design "+ Add rider").
`auth.md` says staff accounts are created only with the command-line tool;
this endpoint changes that for drivers and needs the reviewers' agreement.
`DriverCreate`:

```json
{
  "name": "Sample Driver Three",
  "phone": "08000000013",
  "delivery_type": "tanker",
  "tank_capacity_local_gallons": 3000,
  "zone_ids": ["9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b"]
}
```

| Field | Rule |
| --- | --- |
| `name` | Trimmed, 1-100 characters |
| `phone` | Nigerian mobile, normalized to E.164 |
| `delivery_type` | `keke` or `tanker` |
| `tank_capacity_local_gallons` | Tanker only (required), integer 500-20,000 (handoff answer 11c, `frontend/src/domain/tankCapacity.ts`). The server stores `safe_payload_litres` = gallons × 4 (FR-021, #21 scope). `null` or absent for Keke |
| `zone_ids` | At least one existing service zone (FR-031). An unknown id is 404 `service_zone_not_found` |

- The account has role `driver`, a driver profile with a new vehicle profile
  (`vehicle_type` "Keke" or "Tanker truck", the `delivery_type`, the safe
  payload) and the zones.
- The staff member who saves the form confirms the capacity was checked:
  FR-013 needs a **verified** safe payload, and the app cannot verify it.
- How a Keke's safe payload is set is [open question 8](#open-questions);
  until then a Keke is created with no vehicle profile (`vehicle: null`) and
  dispatch lists it with `no_driver_profile`.
- It starts **inactive** (`is_active: false`) until an admin activates it,
  so no work is offered before the checks in [open question 7](#open-questions).
- It has no usable password ([open question 2](#open-questions)).

#### POST /admin/drivers/{id}/activation

Activates or deactivates a partner account (FR-002). `ActivationChange`:

```json
{ "is_active": false, "reason": "Vehicle papers expired" }
```

| Field | Rule |
| --- | --- |
| `is_active` | The new state |
| `reason` | Trimmed. Required, 5-500 characters, to deactivate (NFR-004 audit; the mock asks for at least 5). Optional, up to 500, to activate |

- **Deactivate:** the account's sessions stop working and it cannot sign in
  ([auth.md](auth.md#roles)). It cannot see future job data (FR-002), so a live
  `offered` assignment is withdrawn as in
  [withdraw](deliveries.md#post-adminordersreferencewithdraw) (the order
  returns to `confirmed`, reason `reassigned`). What happens to an
  `accepted` job is [open question 12](#open-questions); until it is
  decided, deactivation is refused with 409 `driver_has_accepted_job` while
  the driver holds one.
- **Activate:** the driver can sign in and be offered work again. Their
  availability is unchanged.
- Asking for the state the driver is already in returns 200 with the driver
  unchanged and writes no audit row.

## Service zones

FR-010: administrators configure service zones, each with a name,
coordinates, an optional polygon, an active flag and eligibility; customers
order only inside an active zone; each zone carries delivery-zone rates used
as the FR-022 fallback when road distance is unavailable. The design calls
them "service areas".

**Status: agreed** (2026-10-26, @nnamdi-security, technical lead; PR #36).
Built in #30.

### Object

`ServiceZone`:

```json
{
  "id": "9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b",
  "name": "Independence Layout",
  "is_active": true,
  "centre": { "latitude": 6.4447, "longitude": 7.5108 },
  "boundary": null,
  "fallback_delivery_fees": [
    {
      "water_category": { "id": "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b", "label": "Potable Water" },
      "fee_minor_units": 300000
    }
  ],
  "created_at": "2026-10-20T10:00:00Z",
  "updated_at": "2026-10-20T10:00:00Z"
}
```

| Field | Rule |
| --- | --- |
| `name` | Trimmed, 2-100 characters, unique ignoring case |
| `is_active` | FR-010. The design's "enabled". New orders need an active zone; switching a zone off never changes existing orders (FR-024) |
| `centre` | The zone's coordinates (FR-010, required). WGS 84 decimal degrees (SRID 4326, CLAUDE.md): `latitude` -90 to 90, `longitude` -180 to 180; no other bound. Typed in by the admin, since no map provider is approved ([open question 5](#open-questions), decided). Stored for road distance later (OSRM, SRS §12.1); the pilot does not use it to match addresses ([Which zone an address is in](#which-zone-an-address-is-in)) |
| `boundary` | Optional GeoJSON `Polygon`, SRID 4326 (FR-010 "optional geographic polygon"), or `null`. A closed ring of at least 4 positions |
| `fallback_delivery_fees` | The zone's delivery rates (FR-010), used as the delivery cost when no road distance is available (FR-022): **one fee per water category, per order** ([open question 13](#open-questions), decided), whatever the number of trips. Integer kobo, at least 0. Each category at most once. An empty list means no fallback ([Delivery cost from the zone](#delivery-cost-from-the-zone)). The design's "fixed fee per area" |
| `fallback_delivery_fees[].water_category` | `id` and current `label` of a water category (FR-014). Written as `water_category_id` |

Not in `ServiceZone`, by decision (@nnamdi-security, 2026-10-26):

- The design's `distance_km` (decision 10a, a road distance typed by an
  admin): FR-022 takes the distance from OSRM and forbids fabricated route
  estimates, and the per-zone fee makes it unnecessary
  ([open question 14](#open-questions)).
- The design's `station_id`: sources stay on the command-line tool
  ([decision 5](#decisions-taken-in-18)), and the source is chosen at
  confirmation, not per zone.
- FR-010's "eligibility": no separate field. In the pilot, a zone delivers a
  category when it has a fee for it
  ([open question 15](#open-questions)). Revisit when OSRM is added, since a
  road-distance price would not need a fee.
- SRS §5's "default pricing zone": no column. A price rule with
  `zone_id: null` already applies to every zone without a rule of its own
  ([Price lists](#price-lists)), so a default zone would be a second way to
  say the same thing.

### Which zone an address is in

FR-020: the customer submits the service zone with the address; a map pin is
optional. **Decided** ([open question 6](#open-questions)): the customer
picks the zone from the active zones ([`GET /service-zones`](#get-service-zones));
staff pick it for an address they record. The server never guesses a zone
from address text and never geocodes. An address in no listed zone is sent
with no zone, and its quote is `manual_quote_required` /
`outside_service_zone` (FR-010, T-02; see
[order-details-and-price.md](order-details-and-price.md#post-quotes)).

### Delivery cost from the zone

Until OSRM exists (SRS §12.1), the delivery cost of a quote with an address
is the zone's fee for the quote's category (FR-022 fallback). The quote side
is built in #21:

| Zone and fee | Quote |
| --- | --- |
| Active zone with a fee for the category | Delivery cost = that fee, once per order. Handling and margin still come from the price list (FR-022) |
| Active zone, no fee for the category | `manual_quote_required` / `delivery_cost_unavailable` (FR-022, T-18) |
| No zone, or an inactive zone | `manual_quote_required` / `outside_service_zone` (FR-010, T-02) |

Never a distance guess or another zone's fee ("No fabricated route
estimates", FR-022).

### Endpoints

| Method | Path | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/admin/service-zones` | none | 200 `{ "items": [ServiceZone] }` | none beyond shared |
| POST | `/admin/service-zones` | `ServiceZoneWrite` | 201 `ServiceZone` | 404 `water_category_not_found`, 409 `service_zone_name_taken`, 422 `validation_error` |
| PATCH | `/admin/service-zones/{id}` | `ServiceZoneWrite`, fields optional | 200 `ServiceZone` | 404 `service_zone_not_found`, 404 `water_category_not_found`, 409 `service_zone_name_taken`, 422 `validation_error` |
| GET | `/service-zones` | none | 200 `{ "items": [ServiceZoneOption] }` | 503 `service_unavailable` only (no session) |

`GET /admin/service-zones` returns every zone, active or not, by name, with
no pagination: a pilot has a handful of zones. `ServiceZoneWrite` is the
object without `id`, `created_at` and `updated_at`, with each fee written as
`{ "water_category_id": "…", "fee_minor_units": 300000 }`
([admin-service-zone-write-request.json](examples/admin-service-zone-write-request.json)).
In `POST`, `fallback_delivery_fees` may be omitted (empty list). In `PATCH`,
an absent field is unchanged, `null` clears `boundary`, and a sent
`fallback_delivery_fees` replaces the whole list (`[]` removes every fee).
A category listed twice is 422 `validation_error`. Zones are never deleted
(orders and addresses refer to them); switch one off instead.

The mock's 409 `area_exists` becomes `service_zone_name_taken`.

#### Proposed amendment (#74): the pilot category in the admin zone list

**Status: proposed** on 2026-10-27 by @Cloudcrackamara (+ Claude Code), for
review by @nnamdi-security and @chidimmamogbo. Not agreed, not built. The
rest of [Service zones](#service-zones) stays agreed as it is.

**Gap.** The Service areas screen edits one fee per area: the pilot water
category's ([Mapping to the design types](#mapping-to-the-design-types)).
The pilot category is the server setting `PILOT_WATER_CATEGORY`, a category
code (`utility` by default; [order-details-and-price.md](order-details-and-price.md),
open question 2). No admin endpoint returns that code, or the category's id:
`fallback_delivery_fees[].water_category` has `id` and `label` only. So a
client cannot tell which fee is the pilot one, and cannot write one for a
zone that has none, without guessing from the label.

**Proposal.** `GET /admin/service-zones` also returns the pilot category, as
the same `{ id, label }` the fees use:

```json
{
  "items": [ServiceZone],
  "pilot_water_category": { "id": "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b", "label": "Utility Water" }
}
```

| Field | Rule |
| --- | --- |
| `pilot_water_category` | The water category whose `code` is the `PILOT_WATER_CATEGORY` setting, read when the list is requested; the same lookup quotes use. `null` when no category has that code (quotes then have no category either) |

Additive: `items` is unchanged, and a client that ignores the new field keeps
working. No new rule, setting or table: the server already resolves this
category for every quote.

Until this is agreed and built, the Service areas link (#74) shows the fee
as empty and refuses to write one ("not connected"), rather than guess.

#### GET /service-zones

The zones a customer can pick for an address (FR-020,
[Which zone an address is in](#which-zone-an-address-is-in)), and a partner
at sign-up ([partners.md](partners.md#post-authpartner-register), open
question 2). **No session needed** (amended 2026-10-26): partner sign-up runs
before there is one. Any role may call it, and it needs no CSRF token (a
`GET`). Active zones only, by name, no pagination
([service-zones.json](examples/service-zones.json)):

```json
{ "items": [ { "id": "9e8d7c6b-5a4f-4e3d-8c1b-0a9f8e7d6c5b", "name": "Independence Layout" } ] }
```

`ServiceZoneOption` is `id` and `name` only: no fees (customers see the
total only, [order-details-and-price.md](order-details-and-price.md#response-200-quoteread)),
no coordinates or boundary, so nothing in it needs a session to protect.
Inactive zones are never listed.

## Price lists

FR-022: the server computes every quote as **water cost + delivery cost +
handling cost + MmiriOma margin**. Water cost is the supplier's cost per litre
for the category (FR-011) and is recorded on the source's activation by the
command-line tool ([water-sources.md](../features/water-sources.md)), not
here. Every other rate is admin-configured and lives in a **price list**.
SRS §5 `pricing_rules`: version, zone, quantity band, source/category, base
delivery fee, distance rate, additional-trip charge, handling rates, margin
type and value, zone fallback rates, effective dates.

**Status: agreed** (2026-10-26, @nnamdi-security, technical lead; #36).
Built in #37. Open questions 16 and 18 decided; 17 stays open until OSRM
exists (no road distance is priced before then).

Saving creates a new **version**; versions are never edited. A quote records
the version it used and orders keep their quote (FR-024, T-09).

### Object

`PriceList`:

```json
{
  "version": 3,
  "effective_from": "2026-10-26T09:00:00Z",
  "created_by": { "id": "0b8f1c5e-2a3b-4c5d-9e6f-7a8b9c0d1e2f", "name": "Sample Dispatcher" },
  "reason": "Diesel price rise",
  "rules": [
    {
      "id": "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b",
      "zone_id": null,
      "water_category_id": null,
      "min_litres": 600,
      "max_litres": null,
      "base_delivery_fee_minor_units": 200000,
      "distance_rate_minor_units_per_km": 15000,
      "additional_trip_minor_units": 150000,
      "handling_minor_units": 50000,
      "margin": { "type": "percentage", "basis_points": 1000 }
    }
  ],
  "changes": [
    { "path": "rules[0].distance_rate_minor_units_per_km", "from": 12000, "to": 15000 }
  ]
}
```

| Field | Rule |
| --- | --- |
| `version` | 1, 2, 3 …, set by the server |
| `effective_from` | When the version took effect (UTC): the time it was saved. No future dating ([open question 16](#open-questions), decided) |
| `created_by`, `reason` | Who saved it and why. `reason` is optional, trimmed, up to 500 characters |
| `rules` | At least one. A quote uses the **one** rule that matches its zone, category and litres ([Matching](#matching-a-quote-to-a-rule)) |
| `rules[].zone_id` | A service zone, or `null` for every zone without a rule of its own (SRS §5 "zone") |
| `rules[].water_category_id` | A water category, or `null` for every category. FR-022 rates "MAY differ between Potable Water and Utility Water"; the pilot prices one category (#10) |
| `rules[].min_litres`, `rules[].max_litres` | The quantity band (SRS §5), whole litres, inclusive. `min_litres` at least 600 (FR-021); `max_litres` `null` for no upper end, else at least `min_litres` |
| `rules[].base_delivery_fee_minor_units` | FR-022 base delivery fee, per order |
| `rules[].distance_rate_minor_units_per_km` | FR-022 distance charge per km of OSRM road distance. How the distance is rounded is [open question 17](#open-questions) |
| `rules[].additional_trip_minor_units` | FR-022 charge for each trip beyond the first (FR-013, at most two trips) |
| `rules[].handling_minor_units` | FR-022 handling cost, **per order** ([open question 18](#open-questions), decided) |
| `rules[].margin` | FR-022 margin: `{"type": "fixed", "amount_minor_units": n}` or `{"type": "percentage", "basis_points": n}` (1 % = 100 basis points, so no fractions are sent). A percentage applies to water + delivery + handling cost |
| `changes` | What changed from the previous version, by field: `path`, `from`, `to`, with `from` `null` for an added rule. Empty on version 1. The client words them; the mock's `note` sentence is not sent |

Every amount is integer kobo, at least 0 (BR-01). `basis_points` is an
integer 0-10,000. Rounding is the quote's job, not the price list's: FR-022
computes a percentage with decimal arithmetic, converts to whole kobo and
rounds the payable total **up** to the next whole naira; #21 documents the
kobo rounding rule.

#### Matching a quote to a rule

A rule matches when its zone is the quote's zone or `null`, its category is
the quote's category or `null`, and the quote's litres are inside its band.
When several match, a rule with a zone beats one without, then a rule with a
category beats one without. Two rules with the same zone, category and
overlapping bands are refused on save (422 `price_rules_overlap`), so the
choice is never ambiguous. No matching rule: the quote is
`manual_quote_required` (FR-021, FR-022), never a guessed price. #21 builds
the quote side.

### Endpoints

| Method | Path | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/admin/price-lists` | `limit`, `offset` | 200 page of `PriceList`, newest first | 422 `validation_error` |
| GET | `/admin/price-lists/current` | none | 200 `PriceList` | 404 `price_list_not_found` (none saved yet) |
| POST | `/admin/price-lists` | `PriceListCreate` | 201 `PriceList` | 404 `service_zone_not_found`, 404 `water_category_not_found`, 409 `price_list_changed`, 409 `price_list_unchanged`, 422 `price_rules_overlap`, 422 `validation_error` |

All endpoints also return the shared 401, 403 and 422 errors from the
[README](README.md#errors).

#### POST /admin/price-lists

`PriceListCreate`:

```json
{
  "base_version": 2,
  "reason": "Diesel price rise",
  "rules": [ { "...": "rule without id" } ]
}
```

| Field | Rule |
| --- | --- |
| `base_version` | The version the admin edited, or `null` for the first list. If it is not the current version (another admin saved meanwhile), 409 `price_list_changed` with `details: {"current_version": n}`; the client shows "Prices changed since you opened this page" and reloads. Nothing is saved |
| `reason` | Optional, as above |
| `rules` | The **whole** new set of rules, not a change to one rule |

- Rules identical to the current version: 409 `price_list_unchanged` (the
  mock's `no_changes`).
- The new version takes effect at once for new quotes. Quotes already given
  keep their version until they expire; orders keep their snapshot (FR-024).

Not in the price list, with the reason:

| Design field (a-pricing, loyalty) | Why not here |
| --- | --- |
| Keke price per 25 L and 50 L can, tanker price per 500/750/1,000 gal | FR-022 prices water per litre from the supplier (decided in #10) |
| Tanker "Ninth Mile water" column (decision 10b) | Water cost per litre is per source and category on the source's activation (FR-011), set by the command-line tool (decision 5). Ninth Mile sources simply have a higher cost per litre (#10) |
| "Rate per km" and "Fixed fee per area" switches (decision 10a) | FR-022 fixes the order: road distance when available, else the zone's fallback rate, else a manual quote. Nothing to switch |
| Rider pay, driver pay | [Open question 11](#open-questions) |
| Points rule (naira per point, welcome bonus, redemption, rounding) | [Open question 10](#open-questions) |

## Error codes added by this contract

| Status | `code` | When |
| --- | --- | --- |
| 404 | `customer_not_found` | No customer account with this id |
| 404 | `driver_not_found` | No driver account with this id (already used by dispatch) |
| 404 | `service_zone_not_found` | Unknown zone id, in a path or a body |
| 404 | `water_category_not_found` | Unknown category id in a price rule or a zone fee |
| 404 | `price_list_not_found` | No price list saved yet |
| 409 | `phone_already_registered` | The phone has an account (already used by auth) |
| 409 | `driver_has_accepted_job` | Deactivating a driver who holds an accepted job ([open question 12](#open-questions)) |
| 409 | `service_zone_name_taken` | Another zone has this name, ignoring case |
| 409 | `price_list_changed` | `base_version` is not the current version |
| 409 | `price_list_unchanged` | The rules equal the current version's |
| 422 | `price_rules_overlap` | Two rules with the same zone and category have overlapping bands; `details` names them (`[{"loc": ["body", "rules", 1], ...}]`) |

Examples: see [examples/README.md](examples/README.md#admin-directory-proposed-18).

## Mapping to the design types

For the link issues that follow; the adapters convert with these rules.

| Backend | Design (`domain/admin.ts`) | Rule |
| --- | --- | --- |
| `AdminCustomerSummary.orders_count` | `AdminCustomerSummary.orders` | Same value |
| `AdminCustomer.created_at` | `customer_since` | Format as a Lagos date |
| `paid_total_minor_units` | `total_paid_minor_units` | Same value |
| `Address` | `addresses[]` | `zone` dropped until the screen shows it |
| `recent_orders[].quantity_litres` + `delivery_type` | `recent_orders[].quantity` | Formatted with the quantity rules in [api-mapping.md](../architecture/api-mapping.md#quantities) |
| `recent_orders[].status` | `AdminOrderStatus` | [api-mapping.md](../architecture/api-mapping.md#admin-order-status) |
| `AdminDriver.is_active` | `approval` | `true` → `approved`, `false` → `suspended`; `pending` has no source ([open question 7](#open-questions)) |
| `is_available` | `online` | Same value |
| `vehicle.delivery_type`, `vehicle.safe_payload_litres` | `vehicle.type`, `vehicle.tank_gallons` | Tanker gallons = litres ÷ 4; Keke `null` |
| `zones[].name` | `service_areas` | Names |
| `live_jobs`, `completed_jobs`, `created_at` | `active_orders`, `trips`, `partner_since` | Same values |
| `ServiceZone.is_active` | `ServiceArea.enabled` | Same value |
| `ServiceZone.fallback_delivery_fees` | `ServiceArea.fixed_fee_minor_units` | The pilot category's fee (one category is priced in the pilot, #10), or `null` when the zone has none. Saving writes that one entry and keeps the others. `station_id` and `distance_km` have no source (`null`). The screen has no `centre` input, so creating a zone from it needs a screen change (G2) in the link issue |
| `PriceList` | `PriceList` | Different shape: the screen is redesigned (decision 1) |

## Data needed

Schema changes for the backend build (each through a reviewed Alembic
migration):

- `service_zones`: `name` (unique, case-insensitive), `is_active`, `centre`
  (PostGIS `geography(Point, 4326)`), `boundary` (`geography(Polygon, 4326)`,
  nullable).
- `service_zone_delivery_fees`: `zone_id`, `water_category_id`,
  `fee_minor_units` (`BigInteger`, at least 0), unique together.
- `customer_addresses`: `customer_id` (`users`), `zone_id`, `label`,
  `address`, `landmark`, `is_default` (one default per customer, enforced by
  a partial unique index). The SRS lists latitude and longitude as optional;
  they are left out until a screen collects them.
- `driver_service_zones`: `driver_profile_id`, `zone_id`, unique together.
- `vehicle_profiles.delivery_type`: `keke` or `tanker`, nullable for
  existing rows.
- `price_list_versions` (`version` unique, `effective_from`, `created_by`,
  `reason`) and `price_rules` (one row per rule, foreign key to its version;
  zone and category foreign keys nullable; amounts `BigInteger` kobo; margin
  type and value).
- Audit actions (NFR-004): `customer_created`, `customer_address_added`,
  `driver_created`, `driver_activated`, `driver_deactivated`,
  `service_zone_created`, `service_zone_updated`, `price_list_saved`.

## Open questions

| # | Question | Source of the gap |
| --- | --- | --- |
| 1 | Which issue builds these endpoints? **Zones: #30**, **price lists: #37** (lane E). Customers and drivers still need build issues | Process |
| 2 | How does a customer or driver created by staff sign in? There is no password reset or invite in the backend; `auth.md` says staff accounts come from the command-line tool | Mock says "Forgot password" later; no SRS rule |
| 3 | May staff send the FR-003 SMS code to a customer who phoned in, and enter the code the customer reads back? Or must the customer verify in the app? | FR-003 says the customer verifies possession; silent on staff help. `auth.md` "Planned" lists a dispatcher fallback needing a written procedure |
| 4 | Does "ordered this week" mean the last 7 days or the calendar week (Monday to Sunday, Lagos)? | Design wording |
| 5 | ~~The Service areas screen has no coordinates field, but FR-010 requires coordinates. Is entering latitude and longitude acceptable, or does the screen need a map?~~ **Decided** (@nnamdi-security, 2026-10-26): `centre` stays required and the admin types latitude and longitude; only the normal ranges are checked | FR-010, decision 10a |
| 6 | ~~How is a typed address matched to a zone without a map pin (FR-020)?~~ **Decided** (@nnamdi-security, 2026-10-26): the customer picks it from `GET /service-zones` (FR-020: the customer submits the zone); staff pick it for addresses they record; no geocoding | FR-020, #30 scope |
| 7 | Do new partners need a `pending` state (papers checked before first activation), beyond FR-002's active and inactive? Settle with #14 (partner sign-up and documents) | Design `approval`, FR-002, FR-012 is about sources not partners |
| 8 | How is a Keke's verified safe payload entered (the design asks only tankers for a capacity)? Settings shows `[SAFE LOAD]` per vehicle type | FR-013, design Settings |
| 9 | Are a plate number and a fleet code (`KK-014`) part of the driver record? The SRS lists neither | Design fields |
| 10 | Do customer points exist at all? If yes, their rules (earning, welcome bonus, redemption, rounding) and staff adjustments. Settle in #11 | Design decision 16; no SRS rule |
| 11 | Is rider and driver pay a price-list rate, a recorded per-order labour or transport cost (FR-042), or out of the MVP? Today's earnings and payout due depend on it (#22 payouts) | Design decision 16; FR-042 |
| 12 | What happens to a job the driver already accepted when the driver is deactivated: withdrawn, finished first, or failed? Proposed: refuse deactivation until it ends | FR-002, deliveries.md rows 10-11 |
| 13 | ~~Is a zone's fallback rate per order or per trip, and does it differ by water category or vehicle type?~~ **Decided** (@nnamdi-security, 2026-10-26): one fee per zone and water category, **per order**; not by vehicle type | FR-010, FR-022 |
| 14 | ~~May an admin-entered road distance per zone (decision 10a) stand in for OSRM?~~ **Decided** (@nnamdi-security, 2026-10-26): no. The zone fee is the fallback; `distance_km` and `station_id` are dropped | FR-022, SRS §12.1 |
| 15 | ~~What does FR-010's zone "eligibility" hold?~~ **Decided** (@nnamdi-security, 2026-10-26): no separate field; in the pilot a zone delivers a category when it has a fee for it. Revisit with OSRM. SRS §5's "default pricing zone" is not stored either: a `zone_id: null` price rule does that job | FR-010 wording |
| 16 | ~~Should a price list be scheduled for a future date?~~ **Decided** (@nnamdi-security, 2026-10-26): no; it takes effect when saved. Future dating can be added later | SRS §5 |
| 17 | How is the OSRM distance rounded before the per-km rate (to 0.1 km, to whole km, up or nearest)? **Open until OSRM exists** (@nnamdi-security, 2026-10-26): the pilot prices delivery from zone fees, so no distance is rounded yet | FR-022 |
| 18 | ~~Are FR-022 "handling rates" per order, per litre or per trip?~~ **Decided** (@nnamdi-security, 2026-10-26): per order | FR-022 |
| 19 | Should delivery rates differ for Keke and tanker beyond what quantity bands give? SRS §5 keys rules by zone, band and category, not vehicle type | SRS §5, design a-pricing |

## Changes

| Date | Change | Agreed by |
| --- | --- | --- |
| 2026-10-27 | Proposed for #74: `GET /admin/service-zones` also returns `pilot_water_category` ([amendment](#proposed-amendment-74-the-pilot-category-in-the-admin-zone-list)) | Not yet |
| 2026-10-26 | Price lists section agreed: open questions 16 (takes effect when saved) and 18 (handling per order) decided; 17 open until OSRM | @nnamdi-security (technical lead, #36) |
| 2026-10-26 | `GET /service-zones` needs no session (any caller), for partner sign-up ([partners.md](partners.md) open question 2) | @nnamdi-security (technical lead) |
| 2026-10-26 | Amended for #30: `fallback_delivery_fee_minor_units` replaced by `fallback_delivery_fees` (one fee per water category, per order); `GET /service-zones` for customers; [Which zone an address is in](#which-zone-an-address-is-in) and [Delivery cost from the zone](#delivery-cost-from-the-zone) added; open questions 5, 6, 13, 14 and 15 decided | Service zones section: @nnamdi-security (technical lead, PR #36). Rest: not yet |
| 2026-10-26 | Proposed (#18, PR #34) | Not yet |
