# Public pages: landing, FAQ, terms, privacy

Status: built (2026-10-19) from `design/MmiriOma-landing-handoff`. Design
record and differences: [docs/design/landing-v1.md](../design/landing-v1.md).

## 1. Overview and purpose

The public website in front of the apps: what MmiriOma does, delivery
options, how to become a rider or driver, how to install the apps, FAQs and
the legal pages. Anyone can open them, signed in or not.

## 2. Feature workflow

- `/`: hero → benefits → how it works → Keke and Tanker options (sizes, no
  prices) → for drivers (approval steps) → install the apps → service areas
  and FAQs → "Before you order" (worries, closing buttons) → footer. Header links jump to sections; below 960 px they move into a menu.
  The header stays stuck to the top while scrolling.
- "Order Water" → `/order` (sign-in first when signed out).
- "Become a Rider or Driver" → `/partner/signup`.
- Every public page has a floating "Chat on WhatsApp" button (bottom right;
  icon only below 640 px; hidden while WhatsApp support is off) and, after 600 px of scrolling, "Back to top" above
  it. Back to top scrolls up (instantly under reduced motion) and moves focus
  to the logo link.
- Unknown addresses show the 404 page (`src/app/NotFound.tsx`): the next step
  depends on where the link pointed (`/partner/...` → driver app, `/admin/...`
  → dashboard, otherwise "Order Water"), plus home and WhatsApp (or the
  support phone while WhatsApp is off).
- "Install Customer App" / "Install Driver App": see [pwa.md](pwa.md).
- `/faq`: search box and category buttons over 17 questions; counts follow
  the search; "Clear search" resets both.
- `/terms`, `/privacy`: "On this page" links to each section; `/privacy#cookies`
  jumps to section 13. `/privacy` is the website copy of `PRIVACY_NOTICE.md`
  (version 2.0, #93, #104), section by section; change both together.

## 3. Important files

| Path | Responsibility |
| --- | --- |
| `frontend/src/features/marketing/routes.tsx` | The four public routes |
| `Landing.tsx`, `FaqPage.tsx`, `LegalPages.tsx` | The pages |
| `MarketingParts.tsx` | Header with mobile menu, footer, install button, picture and heading helpers |
| `content.ts` | Copy shared by pages and tests: nav, areas, FAQs, worries (`OBJECTIONS`), `ORDER_CTA`, `filterFaqs` |
| `SiteExtras.tsx` | Floating WhatsApp and Back to top buttons |
| `queries.ts`, `publicApi.ts` | The support contact: `useSupportContact`, `useWhatsappNumber` (mock or `GET /public/contact`) |
| `frontend/src/lib/api/publicSite.ts` | Typed `getPublicContact` client |
| `frontend/src/lib/whatsapp.ts` | `wa.me` links and the fallback support number |
| `frontend/src/mocks/publicMock.ts` | Mock of docs/api/public-site.md |
| `icons.tsx` | The design's icons, path for path |
| `marketing.css` | Breakpoint rules for the hero and drivers backgrounds and grids |
| `useMarketingPage.ts` | Fonts, title and description, scrolling to `#section` |
| `frontend/public/marketing/` | Images (WebP plus PNG/JPG) |
| `frontend/src/styles/theme.css` | `mk-*` colours and the Outfit / DM Sans font tokens |

## 4. Database models and relationships

None. The support contact comes from backend settings
([public-contact.md](public-contact.md)). The newsletter is left out of the
pilot (#8): the form was removed in #57 and nothing stores emails.

## 5. API endpoints and request/response behavior

[docs/api/public-site.md](../api/public-site.md) (**agreed**, #8):
`GET /public/contact` for the support phone and WhatsApp number, built in
#56 ([public-contact.md](public-contact.md)) and linked in #57. The
newsletter endpoint was dropped (out of the pilot). While the contact is
loading or cannot be read, the pages use the official number with WhatsApp
on (`lib/whatsapp.ts`), so help is always reachable.

## 6. Important business rules

- No prices on public pages (prices come from the server inside the app,
  FR-022).
- No water-quality claims, no invented numbers, no promises the app does not
  keep (live tracking, choosing a delivery time). Changed lines are listed in
  landing-v1.md.
- Service areas are a sample list until the pilot zone is confirmed.
- Support contact (FR-055): the backend's `SUPPORT_PHONE` and
  `SUPPORT_WHATSAPP_ENABLED`, never an admin screen. With `whatsapp: null`,
  every WhatsApp button is hidden and the 404 page, FAQ, landing page and
  Contact us offer the phone instead.

## 7. Authentication and authorization

Public. `/` never redirects signed-in people (it is the page we share); the
installed customer app opens at `/app` instead.

## 8. Error handling and edge cases

- The FAQ shows an empty state with "Clear search" when nothing matches.
- Fonts fall back to the bundled offline copies if Google Fonts fails.
- Images have fixed sizes (no layout shift) and load lazily below the hero.
- The mobile menu closes on a link, Escape or any navigation, and the page
  behind it does not scroll while it is open; it scrolls itself when taller
  than the screen.
- Page wrappers use `overflow-x: clip`, not `hidden`: `hidden` makes the
  wrapper a scroll container and the sticky header would stop sticking.
  Hash links stop 92 px down, below the header.

## 9. Testing instructions

```bash
cd frontend
npm test
```

`src/features/marketing/marketing.test.tsx`: FAQ filter and counts, copy
checks (FAQs and worries), FAQ empty state and Clear search, mobile menu, `/`
with its order and apply links, section order (benefits before how it
works; worries last, no newsletter), the WhatsApp button link, the 404 page
and its driver-app variant, `/app` still redirecting.
`src/features/marketing/supportContact.test.tsx`: WhatsApp hidden and the
phone offered while it is off, shown when on, Contact us with the real
number. `src/lib/api/publicSite.test.ts`: the client with the contract
example, `null` WhatsApp and 429. `src/mocks/public.test.ts`: wa.me links
and the mock contact. Manual: compare with
`screens-png/` at 390, 768, 1024 and 1440 px.

## 10. Known limitations

- The legal text needs review before launch (open items in landing-v1.md).
- Social links and real partner logos are hidden until they exist. The footer's "Staff Login" opens `/admin/login`.
- The public pages ship in the main bundle (about 113 kB gzipped) so a shared
  link opens at once; every app page loads as its own chunk.
- The website's Privacy page still lists rider and driver data the pilot
  does not collect (photo, ID and vehicle papers, bank details for payouts,
  live location, earnings; #47 decisions). It needs the legal review and an
  edit to match `PRIVACY_NOTICE.md`.
