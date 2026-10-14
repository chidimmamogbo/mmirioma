# Requirements map (PRD and SRS)

Sources at the repository root. **Read the actual sections; this file is only an index**
and a summary of rules that affect almost every change.

- `MmiriOma_MVP_SRS.md`: normative (MUST/SHALL = required, SHOULD = preferred, MAY = optional).
- `MmiriOma_MVP_PRD.md`: product intent, priorities, journeys.

## Where to look

| Topic | SRS | PRD |
|---|---|---|
| Roles, staff login, contact verification | §3.1 FR-001–003 | §4 |
| Service zones, water sources, safety gate, vehicle capacity | §3.2 FR-010–013 | §8 |
| Address, quantity, pricing, quote snapshot, slots, idempotency, receipt | §3.3 FR-020–027 | §6.1–6.2, §7 |
| Dispatch queue, assignment, driver, state machine, pickup, proof, exceptions | §3.4 FR-030–037 | §6.1, §6.3 |
| Payments, reconciliation, costs, refunds | §3.5 FR-040–043 | §3.3 |
| Notifications, feedback, dashboard, export, repeat preference | §3.6 FR-050–054 | §5 (P1) |
| Business rules | §4 BR-01–11 | n/a |
| Data model (entities, money, enums) | §5 | n/a |
| API contracts (illustrative) | §6 | n/a |
| Security, reliability, usability, maintainability | §7 NFR-001–034 | §9 |
| Edge cases (`quote_expired`, `slot_unavailable`, ...) | §8 | §6.3 |
| Acceptance tests T-01–T-14 | §9 | §12 |
| PRD to SRS traceability | §10 | n/a |
| Priorities P0/P1/P2 | §3 headings | §5 |
| **Open decisions: do not decide them in code** | §12 | §13 |

## Cross-cutting rules (apply everywhere)

- **Priorities:** P0 first. P1 only after the P0 flow is stable. P2 is deferred: do not build it.
- **Money:** integer kobo, NGN only, never floats (SRS §5, BR-01). API amounts use minor units (e.g. `total_minor_units`).
- **Never trust client totals:** the server computes quotes from the active rule; `POST /orders` takes a quote ID and an idempotency key, never a price (FR-022, §6).
- **Quote snapshots are frozen:** rule changes never alter accepted orders (FR-024, BR-01, T-09).
- **No fabrication:** no invented prices, routes, or verification. Use `manual_quote_required` / assisted quote or a manual fallback (FR-021, FR-022, §6, §12).
- **State machine:** `draft/quote_requested → awaiting_confirmation → confirmed → assigned → accepted → collected → en_route → delivered`, plus `cancelled`, `failed`, `disputed`. Validate by role and prior state server-side (FR-033).
- **Authorization:** server-side role checks; customers see only their own orders; drivers see only assigned jobs; minimum necessary customer data (FR-001, PRD §4).
- **Payments:** never inferred from a customer upload or reference; only authorized staff verify; duplicate references flagged (FR-040–041, BR-07).
- **Concurrency and retries:** the last slot cannot be double-booked; retries never duplicate orders or payments (FR-025, FR-026, NFR-010, NFR-011).
- **Audit:** state changes, source overrides, payment verifications, and cost edits are auditable (NFR-004).
- **Safety gate:** ineligible, expired, or revoked sources block assignment. A database flag is not legal compliance (FR-012, BR-10).
- **Real vs simulated:** demo/test orders are flagged and excluded from real metrics (BR-09, NFR-031).
- **Time:** store UTC, display Africa/Lagos (SRS §2.1).
- **Privacy:** no personal data in logs; request/correlation IDs on errors (NFR-015); minimal data in exports and demos (BR-11).
- **Architecture:** a modular monolith; no microservices (SRS §1, NFR-034).

Note: the SRS links to `PRD.md`; the actual file is `MmiriOma_MVP_PRD.md`.
