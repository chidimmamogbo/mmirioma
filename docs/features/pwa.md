# Installable apps, offline shell and push notifications

Status: built on mocks (2026-10-19). Decisions in
[docs/design/landing-v1.md](../design/landing-v1.md). Push is not connected
to a server yet ([docs/api/push.md](../api/push.md), proposed).

## 1. Overview and purpose

Customers and partners can install MmiriOma on their phone from the browser,
with no app store. There are two apps:

| App | Name under the icon | Opens at | Owns |
| --- | --- | --- | --- |
| Customer | MmiriOma | `/app` (signed in: home; else sign-in) | everything outside `/partner/` |
| Partner | MO Partner ("MmiriOma Partner") | `/partner/` (rider or driver home) | `/partner/...` |

Installed apps keep the app shell for offline use and can receive push
notifications.

## 2. Feature workflow

1. **Install.** On Chrome, Edge and Samsung Internet the browser offers an
   install prompt once the page is installable; we keep that offer and show
   it from our buttons:
   - landing page "Install Customer App" (prompt) and "Install Driver App"
     (opens `/partner/login`, a partner page, with a full page load);
   - an "Install the app" card on the customer, rider and driver homes, and
     on the partner login ("Not now" hides it for 7 days);
   - an "Install the app" row in the customer and partner menus.
   On iPhone and iPad the buttons open a how-to sheet (Share → Add to Home
   Screen). Running as the installed app, buttons hide (menus, cards) or say
   "Open app" (landing). If the browser cannot install, the landing buttons
   go to sign-in instead.
2. **Offline.** The service worker keeps the built app (JS, CSS, fonts,
   icons, illustrations). With no connection, screens still open and a
   "You're offline" notice shows; data and actions need the network.
3. **Push.** A dashboard card "Turn on notifications" (shown after the
   install card, or once installed) or the "Phone notifications" switch in
   account settings asks for permission, then saves this browser's
   subscription. Partners can also turn on "New orders near you" (off by
   default). Tapping a notification opens the right screen in the right app.
4. **Staying signed in.** Sessions last 7 days from sign-in (auth.md). The
   mock keeps its sign-in in localStorage so the installed app stays signed in
   after it is closed.

## 3. Important files

| Path | Responsibility |
| --- | --- |
| `frontend/public/manifest.webmanifest`, `partner.webmanifest` | The two apps (name, start URL, scope, icons) |
| `frontend/src-sw/sw.ts` | Service worker: app-shell cache, Google Fonts cache, push display, notification click |
| `frontend/vite.config.ts` | `vite-plugin-pwa` (`injectManifest`): builds the worker and injects the list of files to keep offline |
| `frontend/tsconfig.sw.json` | Type settings for the worker (WebWorker types) |
| `frontend/src/features/pwa/installPrompt.ts` | Catches `beforeinstallprompt`, iPhone and installed detection, `promptInstall()` |
| `frontend/src/features/pwa/manifest.ts` | Which app a path belongs to; switches the manifest link |
| `frontend/src/features/pwa/registerServiceWorker.ts` | Registers `/sw.js` (dev: `/dev-sw.js?dev-sw`) |
| `frontend/src/features/pwa/useInstallAction.ts`, `InstallParts.tsx` | Install button logic, iPhone how-to sheet, install card, menu row |
| `frontend/src/features/pwa/push.ts`, `pushApi.ts`, `queries.ts`, `PushParts.tsx` | Permission and subscription, API functions, hooks, settings rows, dashboard card |
| `frontend/src/features/pwa/remindLater.ts` | "Not now" for 7 days |
| `frontend/src/features/pwa/OfflineBanner.tsx`, `src/app/AppRoot.tsx` | Offline notice; root layout that switches the manifest |
| `frontend/src/mocks/mockPush.ts`, `pushMock.ts` | Mock push: which new notifications to show; saved settings |

## 4. Database models and relationships

None in this fork. The proposed contract needs a `push_subscriptions` table:
user, endpoint (unique), keys, `new_orders`, created and last-used times.

## 5. API endpoints and request/response behavior

Proposed in [docs/api/push.md](../api/push.md): `PUT`, `GET` and `DELETE
/push/subscription`, plus the message payload `{title, body, url, tag}`. In
real-API mode the frontend returns `not_connected` until it is agreed.

## 6. Important business rules

- Push only for: customer rider assigned, on the way, delivered, payment
  confirmed; partner assigned by admin, payout; "new order near you" only when
  the partner opts in. Every push mirrors an in-app notification.
- Permission is asked only when the person taps "Turn on" or the switch,
  never on page load.
- No data is cached offline and no action is queued (no false sync, SRS).
- A notification may only open an in-app path; anything else opens `/app`.

## 7. Authentication and authorization

Push settings are per signed-in user and per browser. The service worker
never reads the session; it only shows what the server sent.

## 8. Error handling and edge cases

- Permission refused: the switch shows "Blocked for this site. Allow
  notifications in your browser settings."; the card hides.
- iPhone outside the installed app: "add the app to your home screen first".
- Browser without push: "This browser cannot show notifications."
- An install offer from one app's manifest is dropped when the page moves to
  the other app, so "Install" never installs the wrong app.
- New builds replace the old offline copy straight away; built files have
  hashed names, so an open page keeps working until it reloads.

## 9. Testing instructions

```bash
cd frontend
npm test
```

- `src/features/pwa/pwa.test.ts`: app per path, manifest switch, iPhone
  detection, "Not now" timing, VAPID key decoding.
- `src/mocks/push.test.ts`: 7-day mock session, push settings, which events
  push, new-order alerts.

Manual (mock mode, Chrome on Android or desktop):

1. `npm run build` with `VITE_USE_MOCKS=true`, then `npm run preview`.
2. Open `/`, tap "Install Customer App", install; it opens at `/app`.
3. Open `/partner/login`, use the install card; the partner app opens at
   `/partner/`.
4. Sign in as the demo rider, turn on "Phone notifications" and "New orders
   near you" in Account settings, and allow. Sign out, sign in as the demo
   customer and place a Keke order: the rider's "New order near you"
   notification appears (the mock shows it in the same browser).
5. DevTools → Network → Offline, reload: screens open and the offline notice
   shows.

## 10. Known limitations

- Push needs the backend (contract, keys, sending); mock push only works in
  the same browser.
- On iPhone, push works only in the installed app (iOS 16.4+) and there is no
  install prompt.
- Both apps use the same drop icon (from `web-ready-logos/`), so they look
  alike on the home screen; the names under the icons differ.
- Install prompts do not fire inside iframes or on plain `http` hosts other
  than localhost.
