# Push notifications (not in the MVP)

**Status: not in the MVP.** Decided by @chidimmamogbo on 2026-10-26 (#8),
confirmed by @nnamdi-security (technical lead) the same day.
Proposed by the new-design frontend fork on 2026-10-19; never agreed, and
not to be built for the pilot. Reasons:

- **Not an SRS channel.** FR-050 lists the notification channels as SMS,
  transactional email and staff-operated manual messaging (WhatsApp only
  under FR-055). Web Push is none of them.
- **New infrastructure.** It needs a new library (`pywebpush` or similar) and
  a VAPID key pair in the backend settings, which need approval first
  (CLAUDE.md, "Do not introduce new ... libraries, services").
- **Events outside the MVP.** Two of the events below have no basis in the
  pilot: payouts (left out in #47 and #43) and "new order near you" (the
  backend offers each job to one driver; there is no pool,
  [api-mapping.md](../architecture/api-mapping.md#open-questions) question 6).

The frontend keeps running on its mock (`frontend/src/mocks/pushMock.ts`) in
mock mode. With the real API, the "Phone notifications" switches keep showing
"not connected yet"; the in-app notification lists
([customer-account.md](customer-account.md), [partners.md](partners.md)) are
the record of what users are told.

The proposal below is kept unchanged as a reference for a later version.

Web Push lets the installed apps (and browsers that support it) show
notifications while the app is closed. A subscription belongs to one browser
or installed app on one device, for the signed-in user.

## Keys

- VAPID key pair. The **public** key goes to the frontend as
  `VITE_VAPID_PUBLIC_KEY` (base64url); the **private** key stays in backend
  settings and is never sent to the browser.
- The backend signs and sends messages to each subscription's `endpoint`
  (browser push service). Suggested library: `pywebpush` (needs approval,
  CLAUDE.md "new libraries").

## Endpoints

All under `/api/v1`, session cookie and CSRF as in [auth.md](auth.md).

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| PUT | `/push/subscription` | `{endpoint, keys: {p256dh, auth}, new_orders}` | 200 `PushSettings` | 401, 403 `csrf_failed`, 422 `validation_error` |
| GET | `/push/subscription?endpoint=…` | none | 200 `PushSettings` (`enabled: false` when unknown) | 401 |
| DELETE | `/push/subscription` | `{endpoint}` | 204 | 401, 403 |

`PUT` creates or updates the subscription for this endpoint and user (a new
sign-in on the same device moves it to the new user). `new_orders` is only
meaningful for the `driver` role and defaults to `false`.

```json
// PushSettings
{ "enabled": true, "new_orders": false }
```

## Message payload

The service worker (`frontend/src-sw/sw.ts`) shows exactly this JSON:

```json
{ "title": "Rider assigned", "body": "Chinedu accepted MO-7KQ2.", "url": "/orders/MO-7KQ2M9XH4T/track", "tag": "MO-7KQ2M9XH4T" }
```

- `url` must be an in-app path starting with `/`; anything else opens `/app`.
- `tag` groups updates (one notification per order).
- No personal data beyond what the in-app notification shows; no phone
  numbers or delivery codes.

## Events

| Role | Event | Title | URL |
| --- | --- | --- | --- |
| customer | rider or driver accepted | "Rider assigned" / "Driver assigned" | `/orders/{ref}/track` |
| customer | water collected, on the way | "Your water is on the way" | `/orders/{ref}/track` |
| customer | delivered (code verified) | "Water delivered" | `/orders/{ref}/delivered` |
| customer | payment confirmed by staff | "Payment confirmed" | `/orders/{ref}` |
| driver | admin assigned an order | "New order for you" | `/partner` |
| driver | payout paid | "Payout sent" | `/partner/{rider|driver}/earnings` |
| driver (opt-in) | new pool order they can take | "New order near you" | `/partner/{rider|driver}/orders/{ref}` |

Each push mirrors an in-app notification; push is never the only record.

## Rules

- Send only to subscriptions of the user the event concerns.
- On push-service 404 or 410, delete the subscription.
- Deleting an account deletes its subscriptions; sign-out leaves them, but
  the next `PUT` from that device re-assigns them.
- Rate-limit "New order near you" (suggested: at most one per order per
  partner, and none while offline or not approved).

## Open questions

1. Who builds the sending side, and which library (`pywebpush` or another)?
2. Should sign-out delete this device's subscription (more private) or keep
   it until the next sign-in (current proposal)?
