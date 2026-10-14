# MmiriOma — MVP Software Requirements Specification (SRS)

**Version:** 0.1 — Engineering review draft  
**Date:** 13 October 2026  
**Related document:** [PRD.md](PRD.md)  
**Target:** Working web MVP plus at least one safely and lawfully completed real-world pilot  
**Normative wording:** **MUST/SHALL** = required; **SHOULD** = preferred; **MAY** = optional

## 1. Scope and boundaries

This document specifies a minimum, deployable software system to manage small-volume water delivery in one pilot service zone of Enugu, with assisted quotation for oversized orders. It covers customer booking, admin-controlled prices and delivery windows, source eligibility, operator assignment, delivery proof, payments recorded manually, operational costs and basic reporting.

It **does not** authorize water production, assert water potability, define a compliant treatment process or replace regulatory consultation. It also does not require owning vehicles, GPS telemetry, AI agents, subscriptions billing or a dedicated supplier application.

**Requirements are intentionally technology-neutral**: the team should choose one stack it can reliably build, test, deploy and maintain in four weeks. A modular monolith with responsive web pages and JSON APIs is sufficient. Do not split into microservices.

## 2. System context

**Actors:** Customer, Administrator/Dispatcher, Driver/Delivery Partner, optional Pilot Supervisor, external messaging/payment systems (optional), Supplier (managed admin record, not logged-in actor).

**Logical components:**

1. Customer mobile web application.
2. Role-protected administration/dispatch web application.
3. Driver mobile web interface.
4. Backend API and business rules.
5. Relational database and event/audit records.
6. Optional messaging and mapping adapters with manual fallback.

### 2.1 Operating assumptions

- Pilot serves one configured zone; no nationwide availability promise.
- Manual dispatch is acceptable and preferred over premature routing automation.
- Payments can initially be cash on delivery or independently verified bank transfers.
- Customer may place an order without a password-based full account, but contact confirmation and abuse prevention are required for real delivery.
- The app only offers water categories backed by a currently eligible source and valid handling pathway.
- All timestamps stored in UTC and displayed in **Africa/Lagos** time zone.

## 3. Functional requirements

Each requirement has an identifier and testable condition. Priority **P0** blocks release; **P1** should be implemented after the P0 flow is stable; **P2** deferred.

### 3.1 Identity and access

**FR-001 (P0) Roles.** The system SHALL enforce Customer, Dispatcher/Admin and Driver roles on the server for both web and API operations. Customers may read only their own orders through secure authenticated or appropriately verified access. Drivers can see only assigned jobs and the delivery details necessary to fulfil them.

**FR-002 (P0) Staff login.** Staff and drivers SHALL authenticate securely. Admin can activate/deactivate partner accounts; deactivated accounts cannot access future job data.

**FR-003 (P0) Customer contact.** Before a real order is confirmed, the system SHALL collect a usable phone number and validate possession through OTP or a dispatcher-controlled, documented pilot verification procedure. SMS/WhatsApp OTP is optional if no service is funded; skip any claim of automated verification when manual.

### 3.2 Service zone and water sources

**FR-010 (P0) Service area.** Dispatcher SHALL configure active/inactive service zones, zone fee or route cost rule, and eligibility. Out-of-zone checkout SHALL show request-assistance state rather than quote an unsupported instant delivery.

**FR-011 (P0) Source records.** Admin SHALL create supplier/source records with name, contact, approximate pickup location, supplied category, price per quantity unit, verified status, effective dates and documentary references.

**FR-012 (P0) Safety gate.** A source/category combination lacking required approved status, necessary current records or operational supervisor authorization SHALL NOT be available for confirmed real-order dispatch. Expired or revoked status blocks new assignments. Specific compliance criteria are configured after qualified guidance; do not equate a database flag with legal compliance.

**FR-013 (P0) Capacity.** Admin SHALL configure delivery operator vehicle type, safe usable water payload in litres (adjusted for container/equipment weight), available time windows and whether the operator can handle a given transfer method. Requests above allowed capacity SHALL be declined for instant assignment or routed to assisted quotation.

### 3.3 Quote and checkout

**FR-020 (P0) Address.** Customer SHALL submit contact name, phone, delivery address, landmark/instructions and service zone; map pin MAY be provided but is not mandatory.

**FR-021 (P0) Quantity.** System SHALL support admin-configured quantity options/bands. For unsupported or oversized amounts, create a manual-quote enquiry rather than silently accept a standard order. Pilot defaults, pending approval: 25L, 50L, 100L, 200L, 300L and 500L; availability depends on safe fulfilment capacity.

**FR-022 (P0) Price calculation.** Server SHALL compute and return a quote using an active price rule with water cost, quantity, delivery distance/zone fee, handling and applicable fees/adjustments. Do not trust customer-submitted totals. When distance cannot be reliably calculated, fall back to an admin-configured fixed zone price or manual quote. **No fabricated route estimates.**

**FR-023 (P0) Quote disclosure.** Customer SHALL see final total price, quantity, applicable water category/use description, delivery time window, and price validity before confirming. Discount/repricing SHALL require explicit approval if customer total changes.

**FR-024 (P0) Quote snapshot.** At order creation the backend SHALL persist quote amount, currency (NGN), rule version, cost components and expiry. Editing current pricing rules SHALL NOT retroactively alter an accepted order.

**FR-025 (P0) Available slots.** System SHALL allow the admin to configure date/time slots, service-zone availability and max confirmed order capacity. Slot allocation SHALL prevent overbooking under concurrent checkout/confirmation requests.

**FR-026 (P0) Idempotency.** Duplicate checkout submissions with the same idempotency key SHALL create no more than one order; customer retry SHALL show the existing result.

**FR-027 (P0) Order receipt.** Successful submission SHALL return a non-guessable/public-safe order reference and its current status. An enquiry/awaiting-confirmation state must not appear as guaranteed fulfilment.

### 3.4 Dispatch and fulfilment

**FR-030 (P0) Dispatcher queue.** Dispatcher SHALL list/filter orders by status, date and zone and inspect order detail including constraints, customer window, source eligibility, payment and costs.

**FR-031 (P0) Assignment.** Dispatcher SHALL assign only active drivers meeting capacity, service area, availability and handling requirements. Assignment SHALL be logged with actor/time; concurrent assignments shall not overcommit a driver.

**FR-032 (P0) Driver acceptance.** Driver SHALL accept or decline assigned work. Admin SHALL be informed of rejection or timeout through dashboard state; system SHALL not claim acceptance beforehand.

**FR-033 (P0) State machine.** Allowed ordinary progression is `draft/quote_requested → awaiting_confirmation → confirmed → assigned → accepted → collected → en_route → delivered`; alternatives include `cancelled`, `failed` and `disputed`. State transitions SHALL be validated server-side by role and prior state; unauthorized/invalid transitions return a meaningful error. State names may be simplified in implementation but meanings must remain distinguishable.

**FR-034 (P0) Source pickup record.** Driver or dispatcher SHALL record actual source, pickup time, source reference and volume collected. Source mismatch or safety failure SHALL require dispatcher review before continuing.

**FR-035 (P0) Proof of delivery.** Completion SHALL capture delivery time, volume delivered, receiver acknowledgement (name + code/signature or dispatcher-verifiable confirmation) and confirmation that driver performed agreed unloading. Photograph MAY be supported only with explicit consent and secure retention; not required for MVP.

**FR-036 (P0) Exceptions.** Dispatcher SHALL record late, missing, incorrect-volume, unsafe-access, source-quality concern, vehicle failure and customer-unavailable incidents; orders may be reassigned or cancelled with reason. Changed windows/prices require customer acknowledgment.

**FR-037 (P1) Customer status.** Customer SHALL see major confirmed state changes and latest announced window without false real-time GPS tracking.

### 3.5 Payments and cost accounting

**FR-040 (P0) Payment methods.** System SHALL support manually recorded cash-on-delivery or bank-transfer payments with explicit `unpaid`, `awaiting_verification`, `partially_paid` (only if enabled), `paid`, `refunded` and `disputed` states. Payment status SHALL never be inferred solely from customer upload or reference entry.

**FR-041 (P0) Reconciliation.** Only authorized staff SHALL confirm receipt of a bank transfer or cash handover. Record amount, method, evidence reference, verifier, time and notes. Duplicate transaction references or confirmations SHALL be flagged, not double-counted.

**FR-042 (P0) Actual costs.** Staff SHALL record per-order procurement, transport, labour/handling, consumables, payment fees, subsidies and refunds separately. Cost corrections SHALL have an audit record. The system SHALL calculate contribution as recognized collected revenue minus recorded variable fulfilment costs; do not label contribution as net profit.

**FR-043 (P0) Refund/cancellation record.** Cancelled prepaid orders SHALL be flagged for human refund action; only verified completed refunds SHALL be marked refunded. No automatic funds movement is assumed.

### 3.6 Messaging, feedback and reporting

**FR-050 (P1) Notifications.** System SHOULD support configurable event messages for order created, confirmed, driver assigned, delayed, delivered or cancelled. The channel may be SMS, WhatsApp provider or staff-operated manual messaging; channel failure SHALL not mutate actual order status. Template language must not promise unverified delivery or water quality.

**FR-051 (P1) Feedback.** Customer SHOULD be able to rate timeliness, unloading experience, received quantity and willingness to reorder. Feedback SHALL be linked to order and protected against trivial duplicate spam.

**FR-052 (P1) Dashboard.** Dashboard SHOULD show orders by status, completed deliveries, on-time count/rate, collected revenue, refunds, variable costs, contribution per order and service-zone results. Pilot/test orders must be separately labelled/excluded from real traction totals.

**FR-053 (P1) Export.** Admin SHOULD export non-sensitive aggregated results and authorized order-level CSV for pilot analysis, with proper access controls and minimal customer data.

**FR-054 (P1) Repeat preference.** System MAY store preferred repeat frequency and notify staff, but must NOT create guaranteed subscriptions or automatic billing without customer confirmation and implementation.

## 4. Business rules

| Rule | Requirement |
|---|---|
| BR-01 | Every accepted quote uses NGN and a frozen price snapshot. |
| BR-02 | A quote can only reference an available eligible source and service region. |
| BR-03 | Actual delivery allocation cannot exceed verified vehicle/operational carrying capacity. |
| BR-04 | Customer is not expected to lift/empty water for a service advertised as hands-off. |
| BR-05 | Substantial price/window change requires documented customer agreement. |
| BR-06 | An order marked delivered requires proof of completion and quantity. |
| BR-07 | Paid state requires independent staff/provider-confirmed payment, not a customer assertion. |
| BR-08 | One live fulfilment is not proof of scale, repeat retention or sustainable profit. |
| BR-09 | Unverified/test/simulated orders are excluded from real sales metrics. |
| BR-10 | Water-source status can be revoked and blocks subsequent assignments. |
| BR-11 | Customer data is not included in public investor demo unless consent and minimization rules are satisfied. |

## 5. Core data model

Minimum recommended entities and example fields (not an exhaustive physical schema):

| Entity | Minimum fields |
|---|---|
| users | id, name, phone/email, password hash when applicable, role, status, verified_at |
| customers | id, user_id nullable, contact name/phone, verification status |
| addresses | id, customer_id, zone_id, freeform address, landmark, latitude/longitude optional |
| service_zones | id, label, active, area definition/rule, default pricing zone |
| water_sources | id, supplier name, pickup details, category, cost rate, approval state, valid_through, document reference |
| vehicle_profiles | id, type, verified safe payload, handling capabilities |
| drivers | id, user_id, vehicle_profile_id, active, availability |
| delivery_slots | id, zone_id, date, start/end UTC, order/volume capacity, reserved capacity |
| pricing_rules | id, version, zone, quantity band, source/category, base/handling/zone fees, effective dates |
| quotes | id, customer/session, quantity, category, pricing snapshot JSON, total, currency, expires_at |
| orders | id, public reference, customer/address, quote, quantity, source, slot, amount, state, confirmed_at |
| assignments | id, order_id, driver_id, status, accepted_at, rejected_at, assignment history |
| order_events | id, order_id, actor, event type, from/to status, timestamp, metadata |
| pickup_records | id, order_id, source_id, collected volume, timestamp, handler |
| delivery_proofs | id, order_id, delivered volume, receiver, ack method/reference, unloaded_by_driver, timestamp |
| payments | id, order_id, method, amount, status, reference, verified_by, verified_at |
| order_costs | id, order_id, type, amount, subsidy flag, changed_by, reason |
| exceptions | id, order_id, category, description, resolution status, actor, timestamps |
| feedback | id, order_id, rating, timeliness, handling, reorder intent, message |
| audit_logs | id, actor, action, target type/id, time, security relevant metadata |

Use relational constraints, indexed foreign keys, numeric money as integer **kobo**, integer litres (or decimal where needed), and explicit status enumerations. Avoid floating-point money values.

## 6. API contracts (illustrative, not mandatory endpoint names)

All write endpoints use authenticated or verified access, validation and consistent error responses. Sensitive staff endpoints require role checks. Recommended version prefix `/api/v1`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/service-availability?zone=...` | Determine supported zone and categories |
| GET | `/delivery-slots?zone=...&date=...` | Available booking windows |
| POST | `/quotes` | Server-side quotation or assisted quote status |
| POST | `/orders` | Idempotent verified contact checkout |
| GET | `/orders/{reference}` | Authenticated/verified customer tracking |
| GET | `/admin/orders` | Filtered dispatch queue |
| POST | `/admin/orders/{id}/confirm` | Confirm source, price and slot |
| POST | `/admin/orders/{id}/assign` | Assign eligible driver |
| POST | `/driver/jobs/{id}/accept` | Accept assignment |
| POST | `/driver/jobs/{id}/transition` | Valid state change |
| POST | `/driver/jobs/{id}/proof` | Delivery proof and unload confirmation |
| POST | `/admin/orders/{id}/payments` | Authorized reconciliation |
| POST | `/admin/orders/{id}/costs` | Record variable costs |
| POST | `/admin/orders/{id}/exceptions` | Log incidents and resolution |
| POST | `/orders/{reference}/feedback` | Verified customer feedback |
| GET | `/admin/reports/pilot` | Genuine operational metrics |

**Example `POST /quotes` request:**

```json
{
  "service_zone_id": "zone-001",
  "water_category_id": "domestic-verified",
  "quantity_litres": 200,
  "address_id": "addr-001",
  "desired_slot_id": "slot-001"
}
```

**Example success response (illustrative money only):**

```json
{
  "quote_id": "quote-001",
  "currency": "NGN",
  "total_minor_units": 200000,
  "price_valid_until": "2026-10-14T13:00:00Z",
  "status": "quote_available",
  "requires_manual_approval": false
}
```

If no price is reliable, use a structured `manual_quote_required` response instead of fake numbers. `POST /orders` MUST accept a quote identifier and unique idempotency key, not a client-supplied price.

## 7. Non-functional requirements

### 7.1 Security and privacy

- **NFR-001 (P0):** HTTPS for any deployed system handling real customer or payment details; secure cookies/tokens, CSRF protection as applicable, password hashing and server-side authorization.
- **NFR-002 (P0):** Validate all inputs; use parameterized queries/ORM; rate-limit authentication, quote, OTP and order endpoints; guard against enumeration of public references.
- **NFR-003 (P0):** Encrypt sensitive data in transit; restrict access to contact/address information; avoid recording payment secrets. No collection of bank card credentials in MVP.
- **NFR-004 (P0):** Record auditable state changes, source overrides, payment verifications and cost edits.
- **NFR-005 (P0):** Publish a simple privacy notice, define retention/deletion process and review Nigeria Data Protection Act obligations with qualified guidance as appropriate.

### 7.2 Reliability and performance

- **NFR-010 (P0):** Two concurrent attempts to reserve the last slot cannot both succeed; transactional concurrency control required.
- **NFR-011 (P0):** Network retry of payment/order creation must not cause duplicate rows or double-counting.
- **NFR-012 (P0):** Recoverable errors should display clear guidance and retain user-entered non-sensitive form fields.
- **NFR-013 (P1):** On ordinary mobile connectivity, aim for p95 API reads under 1 second and core screens usable within approximately 3 seconds, excluding external network/provider delays; measure on realistic throttling before claiming success.
- **NFR-014 (P0):** Database backup/restore approach defined and tested once before live pilot.
- **NFR-015 (P0):** System errors logged with correlation/request IDs without exposing customers' personal data in logs.

### 7.3 Usability and accessibility

- **NFR-020 (P0):** Responsive customer and driver flows usable on an entry-level Android browser; administration usable on laptop and mobile.
- **NFR-021 (P1):** Clear labels, accessible contrast, keyboard support and no reliance on colour alone for status.
- **NFR-022 (P0):** All server mutations provide loading, success and error states; form double-submit is prevented at UI and API levels.

### 7.4 Maintainability and operations

- **NFR-030 (P0):** Environment-specific configuration/secrets are not committed to repository.
- **NFR-031 (P0):** Database schema managed through migrations; seeded **demo** fixtures cannot be confused with genuine pilot orders.
- **NFR-032 (P0):** Automated tests cover calculation, access control, order transitions, duplicate checkout and payment reconciliation; run before demo deployment.
- **NFR-033 (P0):** One reproducible deployment procedure and a rollback plan must exist.
- **NFR-034 (P1):** Backend modules separate pricing, orders, dispatch, payments and reporting concerns while remaining one service.

## 8. State and edge-case specifications

- **Quote expires:** Order submission fails with `quote_expired`; customer must requote.
- **Zone becomes unavailable:** Pending requests can be declined; do not accept fresh orders.
- **Approved source revoked:** New dispatch blocked; existing pending orders escalated for revalidation.
- **Last slot booked concurrently:** One booking succeeds; other receives `slot_unavailable`.
- **Driver rejects job:** Assignment returns to dispatcher; customer is not told driver accepted.
- **Delivery late:** Record reason; notify/propose revised window; do not falsify delivery time.
- **Partial delivery:** Record delivered quantity and open dispute/adjustment; don't mark original quantity fully delivered.
- **Customer unreachable:** Follow documented retry and failed-delivery policy.
- **Driver reports unsafe transfer:** Stop work; dispatcher handles safe alternative.
- **Bank transfer screenshot:** Status remains awaiting verification until independently checked.
- **Customer retries order:** Same idempotency key returns the same order.
- **App loses connectivity:** Driver may collect offline notes for later supervised entry; no false real-time sync claim.
- **Demo mode:** Simulated sources/customers/orders flagged; excluded from live pilot reports.

## 9. Test plan and acceptance criteria

| Test ID | Scenario | Pass criterion | Requirement |
|---|---|---|---|
| T-01 | Valid customer requests eligible 200L quote | Correct server total based on active rule; clear breakdown for admin | FR-022–024 |
| T-02 | Customer chooses unsupported zone | Manual enquiry or rejection; no confirmed booking | FR-010 |
| T-03 | 3,000L request beyond vehicle capacity | No single-tricycle auto-assignment; manual quote | FR-013, FR-021 |
| T-04 | Source approval expires | New order cannot dispatch against source | FR-012 |
| T-05 | Two bookings race for final slot | Only one confirmed slot allocation | FR-025 |
| T-06 | Duplicate checkout retries | Exactly one order created | FR-026 |
| T-07 | Driver attempts another driver's order | Access denied | FR-001 |
| T-08 | Driver tries `delivered` without proof | Transition rejected | FR-033, FR-035 |
| T-09 | Admin changes price rule after confirmation | Original order total unchanged | FR-024 |
| T-10 | Customer sends bank transfer proof | Payment remains unverified until staff reconciliation | FR-040–041 |
| T-11 | Order completed with cost records | Contribution correctly computed; not called net profit | FR-042 |
| T-12 | Customer disputes missing volume | Order flagged disputed with event history | FR-036 |
| T-13 | Simulated order in report | Excluded from real pilot totals | FR-052, BR-09 |
| T-14 | Complete pilot run-through | Booking, assignment, driver proof and reconciliation demonstrated without DB edits | All P0 |

### 9.1 Mandatory pilot evidence

For each **actual** delivery, securely retain: anonymized order ID, date/time, ordered quantity, source and eligibility evidence reference, driver assignment, promised window, actual completion time, delivered volume, payment verification status, supplier/transport/handling costs, incident details, and customer feedback where provided. Obtain permission before taking or displaying images/testimonials.

The demo should label what was **actually measured**, what was **simulated**, and what is **forecast**.

## 10. Requirements traceability

| PRD requirement | Primary SRS links |
|---|---|
| PR-01 | FR-010, FR-020 |
| PR-02 | FR-003, FR-020 |
| PR-03 | FR-013, FR-021 |
| PR-04 | FR-022–024, FR-042 |
| PR-05 | FR-025 |
| PR-06 | FR-026–027, FR-033, FR-037 |
| PR-07 | FR-030–031, FR-036 |
| PR-08 | FR-032–035 |
| PR-09 | FR-011–012, FR-034 |
| PR-10 | FR-040–041, FR-043 |
| PR-11 | FR-042, FR-052 |
| PR-12 | FR-050 |
| PR-13 | FR-051 |
| PR-14 | FR-054 |
| PR-15 | FR-013, FR-021 |
| PR-16 | FR-052–053 |

## 11. Proposed implementation sequence

**Sprint A — Foundation and order path:** roles, zones/sources, data model, pricing rules, quote, checkout, idempotency, slots.

**Sprint B — Fulfilment:** admin queue, assignment, driver workflow, server-state validations, source eligibility, delivery evidence.

**Sprint C — Reconciliation and hardening:** payment verification, cost recording, incident handling, metrics, UI polish, automated tests, deployed demo.

**Sprint D — Pilot rehearsal and delivery:** operator dry-run, safe/approved live pilot, collection of genuine outcomes, pitch demo and backups.

Prioritize a complete **vertical slice** over building a large number of disconnected screens.

## 12. Unresolved technical/product decisions

1. Selected language/framework, database, deployment host and communication provider.
2. Pilot address coverage definition: manual zone names, polygons or map-based geocoding.
3. Price approach: configured flat zone fees or reliable actual road distance from a provider.
4. Contact verification approach with limited funding.
5. Payment method and manual reconciliation SOP.
6. Document storage and access policy for source/lab evidence.
7. Approved proof-of-delivery method and consent language.
8. Operational safety requirements and water-category labeling after regulatory advice.
9. Dataset and workflow for actual versus simulated delivery records.

The team must resolve these before coding dependent features. Where external providers or regulatory approvals are unavailable, implement transparent manual fallback rather than imitating completed integration or compliance.
