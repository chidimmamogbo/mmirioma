# Partner apps: Keke rider (and tanker driver)

Status: Keke rider app (Phase 4) and tanker driver app (Phase 5) built on
mocks. Design source: `design/MmiriOma-design-handoff` (`r-*` and `t-*`
screens); decisions in
[docs/design/handoff-v1.md](../design/handoff-v1.md).

## 1. Overview and purpose

The mobile web app delivery partners use to go online, take orders from the
pool or from admin, collect water at a refill station, deliver it, finish
with the customer's delivery code, and follow their sample earnings.

## 2. Feature workflow

1. **Sign in** at `/partner/login` (one login for riders and tanker drivers).
   New partners create an account at `/partner/signup` and choose Keke or
   Tanker (decision 9). Tanker drivers type how many gallons their tanker
   carries (most carry about 4,000, enough for four 1,000 gal tanks); 500 to
   20,000 is accepted (`src/domain/tankCapacity.ts`). They stay "waiting for approval" until admin approves.
2. All partner pages live under `/partner/`, the installed partner app's
   scope (see [pwa.md](pwa.md)). `/partner` sends each partner to their app: `/partner/rider` (Keke) or `/partner/driver`
   (tanker). Opening the other app's link redirects to their own.
3. **Home** (`/partner/rider`): online switch, today's stats, active delivery, first
   open order. An order admin assigned appears as a bottom sheet (`r-assigned`):
   start it, or decline with a reason (decision 13).
4. **Available orders** (`/partner/rider/orders`): the pool for the partner's vehicle
   type, no countdown; list or map view. Accepting gives the order to the
   first partner; others see "already taken".
5. **Trip**: go to the station (`refill`) → confirm pickup (`pickup`: full load
   required, receipt and photo optional) → go to the customer (`customer`) →
   enter the customer's 6-digit code (`code`: 3 tries, resend after 2 minutes,
   then ask admin) → done (`done`).
6. **Account**: earnings and withdraw request, history, notifications,
   vehicle and papers (upload), report a problem, profile, settings (optional
   email), change password.
7. **Tanker drivers** (`/partner/driver`, green theme, `t-*`): the dashboard lists
   tanker orders near you; the orders list filters by Ground or Overhead tank
   and only shows orders the driver's tank can carry. The trip is a
   full-screen map to the station (`refill`) → count the gallons in with the
   tank gauge (`loading`: the order's full gallons required, valves and
   receipt ticks and a meter photo optional) → the customer (`customer`, with
   the tank note) → the same code step → done. Earnings list trips and
   payouts together; "Request payout" opens the withdraw form. History,
   papers, notifications and support are the rider screens with tanker words
   (decision 18).

## 3. Important files

| Path | Responsibility |
| --- | --- |
| `frontend/src/domain/partner.ts` | Job, profile, earnings, notification, issue and decline types and labels |
| `frontend/src/features/partner/partnerApi.ts` | Typed API functions: the mock, or the real API for the six account functions (#67); the rest still fail with `not_connected` |
| `frontend/src/features/partner/real/account.ts` | Account adapters (#67): sign-up, profile and preferences, going online, notifications; converts with [partners.md](../api/partners.md#mapping-to-the-design-types) |
| `frontend/src/lib/api/partners.ts` | Zod-checked client for the partner account endpoints and `GET /service-zones` |
| `frontend/src/features/partner/queries.ts` | Query hooks; pool and active jobs refresh every 30 s |
| `frontend/src/features/partner/partnerContext.ts` | Which app (`/partner/rider` or `/partner/driver`), words per vehicle, `jobStepPath` |
| `frontend/src/features/partner/PartnerArea.tsx` | Signed-in partner guard and vehicle redirect |
| `frontend/src/features/partner/pages/` | Screens; `Rider*` for Keke, `Driver*` for tanker, `PartnerShared.tsx`, `PartnerAccount.tsx`, `JobDetail.tsx` and `CodeStep.tsx` serve both |
| `frontend/src/features/partner/components/JobStep.tsx` | Loads a job and redirects when it is not at the screen's stage |
| `frontend/src/components/art/Art.tsx` | Tanker maps and the `TankGauge` used on the loading screen |
| `frontend/src/mocks/partnerMock.ts` | Mock server rules for partners |
| `frontend/src/mocks/orderSync.ts` | Keeps the customer's order in step with the partner's job |
| `frontend/src/mocks/partnerSeed.ts` | Sample partners, jobs, earnings and notifications |

## 4. Database models and relationships

None yet. The mock follows the SRS entities: drivers and vehicle profiles,
assignments (with accept/decline history), pickup records (FR-034) and
delivery proofs (code acknowledgement, FR-035). One job per order; the
customer order and the partner job share the order reference.

## 5. API endpoints and request/response behavior

Six account functions call the agreed [partner account contract](../api/partners.md)
when `VITE_USE_MOCKS=false` (#67):

| Function | Endpoint |
| --- | --- |
| `partnerSignup` | `GET /service-zones`, then `POST /auth/partner-register` |
| `getPartnerProfile` | `GET /driver/profile` |
| `updatePartnerProfile` | `PATCH /driver/profile` (preferences only) |
| `setOnline` | `PUT /driver/availability` |
| `listPartnerNotifications` | `GET /driver/notifications` (newest 50) |
| `markPartnerNotificationsRead` | `POST /driver/notifications/read` with no ids (marks all) |

Sign-up matches the typed area to an active zone by name, ignoring case and
extra spaces, and sends its id as `service_zone_id`. The profile has no
email, documents, payout account or "News and offers" switch, so the adapter
returns `null`, `[]`, `null` and `false` for them. When admin has not set a
vehicle description yet, the adapter writes one from the sign-up details:
"Tricycle" for a Keke, "4,000 gal (16,000 L) tank" for a tanker. The
transfer methods become "Ground tanks", "Overhead tanks", "Ground and
overhead tanks", or "Not set yet" when the list is empty.

The job functions, earnings, payouts, history, document upload and problem
reports still run on mocks. In real-API mode they fail with `not_connected`.
Error codes used by the mock: `job_not_found` (404), `order_taken` (409),
`partner_not_approved` (403), `not_assigned_to_you` (409),
`invalid_job_transition` (409), `load_not_confirmed` (422), `invalid_code`
(422, `details.tries_left`), `code_locked` (423), `too_many_attempts` (429,
`retry_after_seconds`), `insufficient_balance` (422), `no_payout_account` (409).

## 6. Important business rules

- One `driver` role; vehicle type decides the app and the pool (decision 9).
  Tanker drivers see only orders their tank can carry.
- No countdown on the pool. Admin can assign; the partner may accept or
  decline with a reason; a declined order goes back to the pool and is not
  offered to that partner again (decision 13, FR-032).
- Only approved partners can go online and accept (FR-002, FR-012 analogue).
- Pickup must confirm the full load (FR-034). Delivery completes only with
  the customer's code (FR-035); after 3 wrong codes admin must confirm.
- Earnings and payouts are SAMPLES (decision 16). Partners never see an
  order's payment status (FR-040, BR-13; driver-cash decision 3): the done
  screens have no payment row, and the K1 Cash card (#20) goes there.
- A job may come without the cans or tank (until #21), road distances and
  times (no OSRM) or pay (out of the MVP). Screens show the ordered litres in
  litres and gallons, and leave the rest out
  ([api-mapping.md](../architecture/api-mapping.md#partner-job-fields-the-backend-does-not-send)).
- A job may also come without the receiver (offers, FR-032, and ended
  jobs), the full addresses (offers and history) or the code tries (before
  the code is issued). Screens then name the area, leave out the customer
  row and the call buttons, and the code screen says it is waiting for the
  code. Mock mode keeps every value.
- Failed and disputed jobs show in history as "Delivery failed" and "Under
  review"; they are never hidden.
- No invented turn-by-turn directions: the map badge says where to head;
  "Start navigation" hands the address to the phone's maps app.

## 7. Authentication and authorization

`/partner/rider/*` and `/partner/driver/*` need a signed-in `driver`. A partner sees only
pool orders they are eligible for and their own jobs; others return 404
(FR-001, T-07). Customer phone numbers are shown only on the partner's own
active job, for calling.

## 8. Error handling and edge cases

- Every screen has loading, error and empty states; offline and
  waiting-for-approval explain why the pool is empty.
- Errors that block a footer button show next to that button.
- Reloading a trip screen at the wrong stage redirects to the right step.
- Taken orders, a locked code and a resend that is too soon each show a
  clear message.
- Real API: server errors reach the screens unchanged as `ApiError`. Going
  online while pending or suspended shows the server's `partner_not_approved`
  message. A driver with no driver profile gets the error screen
  (`no_driver_profile`).
- Real API sign-up: an area that matches no active zone, or a zone the
  server refuses, fails with the client-only code `service_area_not_served`
  ("We do not serve "X" yet. Areas we serve: …"), shown as the top notice.
  In a `validation_error`, `declared_capacity_gallons` is renamed
  `tank_gallons` so the message appears under the field.
- Real API: saving an email or changing "News and offers" fails with
  `not_connected` before any request is sent.
- Real API: a notification `kind` this build does not know is shown with
  the `account` style (shield icon; tapping it opens the profile) and the
  server's title and body. An `approval_status` it does not know is read as
  `pending`.

## 9. Testing instructions

```bash
cd frontend
npm test
```

`src/features/partner/partnerHelpers.test.ts` covers tanker card lines,
`/partner/driver` step paths and the Lagos greeting.
`src/mocks/partner.test.ts` covers vehicle and tank filtering, offline and
unapproved partners, first-to-accept, decline rules, load checks, code tries
and lock, payment of the partner, and the customer's order following the
partner's job. Manual: sign in at `/partner/login` with the demo rider in
`src/mocks/partnerSeed.ts` (mock mode only); finish MO-7KQ2 with the code the
customer demo account sees on its tracking screen. For tankers, sign in with
the demo tanker driver, accept MO-5KL3ZT8QWE (750 gal), load 750 gallons and
finish with the code shown under the keypad (mock mode).

## 10. Known limitations

- Mock data lives in this browser only (localStorage), shared by its tabs.
- Map pins on the "Map" tab and the tanker maps are illustrative, not real positions.
- The gallon count is entered by the driver; nothing reads a real meter.
- Photos and papers are not uploaded anywhere; the mock only records them.
- Admin, phone and WhatsApp numbers are placeholders.
- The decline flow needs a contract change before the real API.
- Real API sign-up takes a typed area, not a zone list, so a partner must
  spell the zone's name. The demo seed creates no zones; create one before
  trying sign-up locally.
- Real API notifications show only the newest 50.
- Drivers made with the command-line tool before it asked for a delivery
  type are shown the tanker app when they have a declared capacity, else the
  Keke app.
- Problem reports, declines and sign-ups also reach the admin support queue,
  activity and notifications; admin assignments, reassignments, suspensions,
  station closures and payouts arrive as partner notifications
  ([admin.md](admin.md)).
