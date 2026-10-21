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
  and FAQs → "Before you order" (worries, closing buttons) → newsletter →
  footer. Header links jump to sections; below 960 px they move into a menu.
  The header stays stuck to the top while scrolling.
- "Order Water" → `/order` (sign-in first when signed out).
- "Become a Rider or Driver" → `/partner/signup`.
- Every public page has a floating "Chat on WhatsApp" button (bottom right;
  icon only below 640 px) and, after 600 px of scrolling, "Back to top" above
  it. Back to top scrolls up (instantly under reduced motion) and moves focus
  to the logo link.
- Newsletter: one email field before the footer of every public page.
- Unknown addresses show the 404 page (`src/app/NotFound.tsx`): the next step
  depends on where the link pointed (`/partner/...` → driver app, `/admin/...`
  → dashboard, otherwise "Order Water"), plus home and WhatsApp.
- "Install Customer App" / "Install Driver App": see [pwa.md](pwa.md).
- `/faq`: search box and category buttons over 17 questions; counts follow
  the search; "Clear search" resets both.
- `/terms`, `/privacy`: "On this page" links to each section; `/privacy#cookies`
  jumps to section 9.

## 3. Important files

| Path | Responsibility |
| --- | --- |
| `frontend/src/features/marketing/routes.tsx` | The four public routes |
| `Landing.tsx`, `FaqPage.tsx`, `LegalPages.tsx` | The pages |
| `MarketingParts.tsx` | Header with mobile menu, footer, install button, picture and heading helpers |
| `content.ts` | Copy shared by pages and tests: nav, areas, FAQs, worries (`OBJECTIONS`), `ORDER_CTA`, `filterFaqs` |
| `SiteExtras.tsx` | Floating WhatsApp and Back to top buttons; newsletter section |
| `NewsletterForm.tsx` | The newsletter form (React Hook Form + Zod), loaded as its own chunk |
| `queries.ts`, `publicApi.ts` | Company WhatsApp number and newsletter sign-up (mock or not connected) |
| `frontend/src/lib/whatsapp.ts` | `wa.me` links and the interim number |
| `frontend/src/mocks/publicMock.ts` | Mock of docs/api/public-site.md |
| `icons.tsx` | The design's icons, path for path |
| `marketing.css` | Breakpoint rules for the hero and drivers backgrounds and grids |
| `useMarketingPage.ts` | Fonts, title and description, scrolling to `#section` |
| `frontend/public/marketing/` | Images (WebP plus PNG/JPG) |
| `frontend/src/styles/theme.css` | `mk-*` colours and the Outfit / DM Sans font tokens |

## 4. Database models and relationships

None in the backend yet. The proposed contract stores newsletter emails;
the mock keeps them in `MockState.newsletter`.

## 5. API endpoints and request/response behavior

[docs/api/public-site.md](../api/public-site.md) (**proposed**):
`GET /public/contact` for the WhatsApp number and
`POST /newsletter/subscriptions`. In mock mode both work against the mock
database. With the real API, the WhatsApp button falls back to the interim
number and the newsletter form shows "Newsletter sign-up is not connected to
the server yet.".

## 6. Important business rules

- No prices on public pages (prices come from the server inside the app,
  FR-022).
- No water-quality claims, no invented numbers, no promises the app does not
  keep (live tracking, choosing a delivery time). Changed lines are listed in
  landing-v1.md.
- Service areas are a sample list until the pilot zone is confirmed.
- WhatsApp: admin's "Company WhatsApp" in Settings, else `+2348133774902`
  (owner, 2026-10-21, until the company line is bought).
- Newsletter: the reply is the same for new and existing emails (no way to
  check who is subscribed); emails are stored lower-cased, once.

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
- Newsletter: empty or invalid email shows a field error; a server error
  shows under the field; success replaces the form with a status message.

## 9. Testing instructions

```bash
cd frontend
npm test
```

`src/features/marketing/marketing.test.tsx`: FAQ filter and counts, copy
checks (FAQs and worries), FAQ empty state and Clear search, mobile menu, `/`
with its order and apply links, section order (benefits before how it
works; worries, then newsletter), the WhatsApp button link, the 404 page and
its driver-app variant, `/app` still redirecting, newsletter validation and
success. `src/mocks/public.test.ts`: wa.me links, the WhatsApp setting
(validation, E.164, admin only), newsletter storage. Manual: compare with
`screens-png/` at 390, 768, 1024 and 1440 px.

## 10. Known limitations

- The legal text needs review before launch (open items in landing-v1.md).
- Social links and real partner logos are hidden until they exist. The footer's "Staff Login" opens `/admin/login`.
- The public pages ship in the main bundle (about 113 kB gzipped) so a shared
  link opens at once; every app page and the newsletter form load as their
  own chunks.
- No admin page lists newsletter subscribers, and nothing sends the
  newsletter yet (contract open questions).
- The Privacy Policy line about newsletter emails (section 2) is new and
  needs the same legal review as the rest.
