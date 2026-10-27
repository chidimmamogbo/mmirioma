# Mock API samples

Sample responses matching the contracts in [../auth.md](../auth.md),
[../orders.md](../orders.md) and [../deliveries.md](../deliveries.md)
(`delivery-event.json`, the two transition errors, and the driver job samples
`driver-jobs.json` and `driver-job-detail.json`), for building UI before the
endpoints exist. All people, phone numbers and addresses are fictional, and
every record is marked `is_simulated: true` where the field exists.

`driver-jobs.json` shows one driver: a job accepted for a later day
(`upcoming`) and one delivered today (`done`). A driver holds at most one live
job, so `offers`, `today` and `upcoming` never hold more than one job between
them.

Orders are created without a price: Sprint 1 orders are quote requests (see
[../orders.md](../orders.md#why-sprint-1-orders-have-no-price)).
`order-confirmed.json` (agreed 2026-10-24, #99) is the customer's
view of an order after a pilot confirmation, with the dispatcher's manual
quote total, the confirmed window and the water category
([../orders.md](../orders.md#customer-pilot-changes-99)). The seeded
categories have no supported-uses text yet, so it is `null`.

The admin dispatch samples (agreed, [../deliveries.md](../deliveries.md#admin-dispatch-endpoints))
show one order: `dispatch-drivers.json` is the D1 driver list before the
offer; `admin-order-detail.json` is the order after it was offered to Sample
Driver One; `admin-order-history.json` is its history, newest first, with an
earlier offer that Sample Driver Two declined. `error-driver-not-eligible.json`
and `error-assignment-not-found.json` are the assign and withdraw refusals.
`admin-order-detail.json` and `admin-orders-page.json` carry `hold: null` (the
hold review's `hold` field, agreed in PR #91): none of these orders is on hold.

Driver job part 2 samples (agreed, not built yet; #51): `driver-job-detail.json` is a job
just arrived (no code yet: it is issued after unloading, #67); its
`unloading_completed_at` and `unreachable_allowed_at` fields are agreed but
not returned by the built API yet;
`driver-job-unloading-complete.json` is the same job after unloading was
recorded complete, with its code issued; `driver-proof-request.json` and
`error-delivery-code-invalid.json` are the proof request and a wrong-code
reply. Added in the #51 design check: `driver-job-offer.json` (J2 offer, no
receiver) and `driver-job-accepted.json` (the accept response);
`driver-transition-request.json` and `driver-arrive-request.json`;
`driver-job-unreachable.json` (arrived, two contact attempts, wait over, so
`record_failed_attempt` is allowed) and `error-unreachable-wait.json` (failed
step too early); `driver-proof-alternative-request.json` and
`error-delivery-code-expired.json`. `backend/tests/test_driver_job_examples.py`
checks the driver job samples against the built schemas and the part 2
contract.

Order confirmation samples (agreed, [../deliveries.md](../deliveries.md#order-confirmation-endpoints),
built in #113): `confirmation-options.json` (two categories; one source
eligible for Potable Water, one suspended with an expired approval, neither
activated for Utility Water; never a cost per litre) and
`order-confirm-request.json` (the confirm body). `admin-order-detail.json`
now shows the order as confirmed with a manual quote before it was offered
(`water_category`, `source`, `delivery_window`, `price`,
`confirmation_sms`). Every entry of `admin-order-history.json` has
`confirmation: null`; `admin-order-history-confirmed.json` shows the two
confirmation entries (row 7 with its `confirmation` line, then row 26 with
`manual_quote`). It is a separate file because the admin client accepts
`manual_quote` only after #114. Amounts are integer kobo:
`4500000` is ₦45,000.00.

Order details and price samples (**agreed**,
[../order-details-and-price.md](../order-details-and-price.md), #10):
`quote-create-request.json` asks for a 750-gallon Tanker of borehole water
with the address and zone (both needed for a price; no category: the server
uses the pilot category); `quote-available.json` is the server's answer
(3,000 L, the full total only);
`quote-manual.json` is a manual-quote answer (`no_vehicle_plan`);
`order-create-with-quote-request.json` places the order with that
`quote_id`; `order-with-details.json` is the order just after,
`awaiting_confirmation` with its frozen quote and the category accepted
(`quote.water_category`); `error-quote-expired.json` is the refusal after
`price_valid_until`. "Utility Water" is the pilot category (#42). Every
amount is illustrative, not a
real price: `2000000` is ₦20,000.00.

Customer account samples (**proposed**,
[../customer-account.md](../customer-account.md), #11) follow Sample
Customer: `customer-profile.json` (no email, photo, preferences or points:
left out by the contract's decisions, #48); `saved-addresses-page.json` (Home is the
default; each address has the zone the customer picked) and
`address-create-request.json`; `order-feedback-request.json`
(the design's two answers plus the optional FR-051 ones);
`customer-notifications-page.json` (one unread, `read_at: null`; the same
shape as `partner-notifications.json`); `support-request-create-request.json`
and `support-requests-page.json`; `deletion-request.json` (requested on a
Monday, to be acknowledged by the Thursday); `error-default-address.json`.

Partner account samples (**agreed**, [../partners.md](../partners.md), #14,
revised in #47): `partner-register-request.json` is a tanker driver signing
up with a declared 4,000 gallons; `partner-profile-pending.json` is that
driver just after, `pending`, offline and with the phone not yet verified,
with 16,000 declared litres and no verified payload
(`safe_payload_litres: null`). `partner-profile.json` is an approved Keke
rider whose phone and payload are verified. `partner-profile-update-request.json`
turns SMS updates off; `partner-availability-request.json` goes online, and
`error-partner-not-approved.json` is the refusal for a pending partner.
`partner-notifications.json` holds one unread job offer and one read approval
message (`unread_count: 1`); `partner-notifications-read-request.json` marks
the offer read by id. The zone id and name are samples, not #30's seeded
zones.

If a contract changes, update these files in the same PR.

The cash samples ([../payments.md](../payments.md), agreed; the history entry
shape is amendment 1, proposed in #123) follow two orders, MO-7KQ2M9XH4T and
MO-3HF8P2LQ6D, held by Sample Driver. `cash-collection-request.json` and
`cash-collection.json` are the driver recording ₦40,000 against ₦45,000 due,
with a note; `driver-cash.json` is My cash (K2); `cash-handover-request.json`
hands it over. `admin-cash-day.json` is the cash page (K3) and
`admin-cash-driver.json` the driver's cash in K4.
`cash-correction-request.json`, `cash-remittance-request.json` and
`cash-remittance.json` are the correction and the receipt, ₦2,000 short, with
one SMS not accepted; `cash-reconciliation-request.json` and
`cash-reconciliation.json` reconcile it. `admin-order-history-cash.json` holds
three cash history entries (`?include=holds`). `error-cash-already-recorded.json`
and `error-cash-collection-changed.json` are the cash refusals. Amounts are
integer kobo; the notes write naira as "N" to stay plain ASCII.
`driver-job-unloading-complete.json` carries the Cash card (`cash`, and
`record_cash` in `allowed_actions`); the other job samples have `cash: null`.
`admin-order-detail.json` has `payment` for a confirmed pay-on-delivery order
whose cash is not recorded yet.

## Admin directory (proposed, #18)

Samples for [../admin-directory.md](../admin-directory.md), **proposed, not
agreed**. Every amount is a SAMPLE in integer kobo, not a real price.

- Customers: `admin-customers-page.json` (the list, one customer created by
  staff and not yet verified), `admin-customer.json` (the detail, with an
  address in an inactive zone and an order from before #21 with
  `delivery_type: null`), `admin-customer-create-request.json`,
  `admin-customer-address-request.json`.
- Drivers: `admin-drivers-page.json` (an active tanker driver and an inactive
  driver with no vehicle profile), `admin-driver-create-request.json` (3,000
  gallons, stored as 12,000 litres), `admin-driver-activation-request.json`.
- Service zones: `admin-service-zones.json`, one active zone with a fallback
  fee for one category and one inactive zone with a boundary and no fees;
  `admin-service-zone-write-request.json` (create or replace); and
  `service-zones.json`, the customer's list of active zones (names only, no
  fees).
- Price lists: `admin-price-list.json` (version 3: two bands for every zone
  and a zone's own rule), `admin-price-list-create-request.json`.
- Refusals: `error-price-list-changed.json`, `error-price-rules-overlap.json`,
  `error-service-zone-name-taken.json`.

## Change password and public contact (agreed, #8)

`change-password-request.json` is the body of `POST /auth/password`, and
`error-password-incorrect.json` its 403 for a wrong current password
([../auth.md](../auth.md#change-password-8)). The passwords are
samples, not real ones. `public-contact.json` is `GET /public/contact`
([../public-site.md](../public-site.md#get-publiccontact)).

## Admin operations (proposed, #22)

Samples for [../admin-operations.md](../admin-operations.md), all from
simulated records (`is_simulated: true`, as `simulated=only` returns them).
Delivery type and zone are `null` (`by_delivery_type`, `by_zone`, the live
map's `delivery_type` and `zone`) because orders gain them only in #21.

- Dashboard and map: `admin-shell.json`, `admin-dashboard.json`,
  `admin-live-map.json` (one delivery on its way; one usable and one
  unusable source), `admin-activity.json`.
- Reports: `admin-report.json` (last 7 days; no pay, refunds or costs).
- Support: `admin-support-requests-page.json` (one open, one resolved),
  `admin-support-request.json` (the resolved one),
  `admin-support-resolve-request.json`,
  `error-support-request-already-resolved.json`.
- Audit log, notifications, settings: `admin-audit-logs-page.json`,
  `admin-notifications-page.json` (two unread), `admin-settings.json`.
