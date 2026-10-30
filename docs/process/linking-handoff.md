# Linking hand-off

For the supervisors who choose between this fork (`chidimmamogbo/mmirioma`)
and the main repo. It says what the fork does with the real backend, what it
leaves on mocks on purpose, what is still wrong, and how to see it run. State
is `main` at 787a346, 29 October 2026. It describes the fork only; it makes no
claim about the main repo.

## What the fork is

The new-design frontend and its own copy of the backend (copied from
`mmiri-oma/mmirioma@adc8654`, PR #4). Every screen runs on typed mocks when
`VITE_USE_MOCKS=true` and on the real API when it is `false`. Linking meant
replacing each mock function with an adapter in a feature's `real/` folder, as
described in [linking-plan.md](linking-plan.md) and
[api-mapping.md](../architecture/api-mapping.md). Both milestones are done:
"Linking MVP" (59 issues) and "Admin screens linking" (6 issues). 153 pull
requests are merged. `main` is protected: a PR merges only with both CI jobs
green and one reviewer's approval.

## Linked to the real backend

- Sign-in, sign-up, sign-out, password change and phone verification.
- Customer: ordering with the server's quote, order list and detail, tracking,
  feedback, notifications, support, profile, addresses and receipts.
- Admin orders: list, confirm with a window and the customer's agreement,
  assign a driver, holds, cancel, the Rider column, the order panel.
- Admin pages: dashboard, live map, activity, reports, support, audit log,
  notifications, settings (read), customers, riders, service areas, pricing,
  cash, My account (api-mapping.md has a section for each).
- Driver and rider app: job offers, accept or decline, pickup, delivery
  code, delivered, problem reports, cash record and hand-over.

Each area has a feature document in [docs/features](../features/) and a
section in api-mapping.md.

## Mock-only by decision

These have no endpoint in the agreed contracts. In real mode they are switched
off, not left broken: the menu entry, button or route is hidden, and a link to
a hidden route goes to the dashboard. The flags are in
`frontend/src/lib/features.ts`. Mock mode still shows them all.

| Area | Flag | Reason |
| --- | --- | --- |
| Loyalty points | `POINTS_ENABLED` | No SRS or PRD rule |
| Rider and driver earnings, payouts | `PARTNER_PAY_ENABLED` | Partner pay is out of the MVP |
| Payments page | `PAYMENTS_PAGE_ENABLED` | The Cash page replaces it: payment is marked paid when an admin receives the cash |
| Order for a customer from the office | `ORDER_FOR_CUSTOMER_ENABLED` | No admin endpoint |
| Mark phone verified, adjust points, add rider | `DIRECTORY_EDITS_ENABLED` | The directory contract decided against them |
| Refill stations page | `STATIONS_PAGE_ENABLED` | Stations stay on the command-line tool |
| Customer profile photo | `CUSTOMER_PROFILE_EDITS_ENABLED` | Privacy notice says no photographs |
| Phone notifications | `PUSH_ENABLED` | Not in the MVP |
| Partner documents upload | `PARTNER_DOCUMENTS_ENABLED` | Out of the MVP; the admin checks documents |
| Saving settings | none | Settings come from backend configuration |

## Known gaps

- Issue #243: the Rider column reads "None yet" once an order is delivered or
  cancelled. The panel half is merged (PR #246). The list half waits on the
  contract amendment in PR #247 and then needs backend and adapter work.
- Issue #250: the driver app records the arrival on its own, the contact
  attempts, the 10-minute wait and the failed delivery (FR-038, T-25), in both
  partner apps. Known limits: arrival and attempts are self-reported times (no
  location), and "The dispatcher will contact you." needs a dispatcher to follow
  up a failed delivery. See [partner-app.md](../features/partner-app.md).
- `addCustomerAddress` is linked, but no real-mode screen reaches it: it needs
  a `zone_id` and the design's form has none.
- The Dashboard search box still says "Search orders, customers, riders,
  stations", but stations are not searchable.
- The receipt shows the customer's water-source preference, not the station
  the dispatcher chose.
- The demo seed makes dashboards read zero: demo orders are simulated, and the
  dashboards count real orders only (BR-09).

## Checked end to end

On 29 October 2026 one delivery ran through the real backend, in the browser:
customer order (₦8,800 from the server), dispatcher confirm and assign, driver
accept, pickup, delivery code and delivered, driver cash record and hand-over,
admin receive and reconcile, and the customer's delivered view with its
timeline and receipt. Two findings from that run are fixed (#241 in PR #245,
#242 in PR #244). The third is #243 above. The write-up is
[the log entry](../log/2026-10-29-end-to-end-run-on-the-real-backend.md).
Not exercised: rating a delivery, failed deliveries, and holds in the
browser.

## See it run

Setup for a scratch database, the demo seed, a priced zone and the two dev
servers is in [local-quote-setup.md](local-quote-setup.md) and
[demo-data.md](../features/demo-data.md). Start the backend with
`SMS_PROVIDER=mock`; the delivery code then appears in the backend log. Demo
accounts are in the seed output.

## Open log entries that matter

Most `open` and `workaround` entries in [docs/log](../log/) are tooling notes
for Windows and `gh`. These are about the product:

- Design profile fields conflict with the privacy notice (email, photo,
  marketing switches): waiting on the technical lead.
- `docs/api/auth.md` links a design file the fork does not have.
- The frontend suite is slow (about three minutes) and a test has failed once
  in a full run; both pass when run alone.
- The demo seed has no cash records, by design. Cash can still be tried: the
  end-to-end run recorded and received cash through the driver app (the log
  entry is marked resolved).
