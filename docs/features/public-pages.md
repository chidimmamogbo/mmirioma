# Public pages: landing, FAQ, terms, privacy

Status: built (2026-10-19) from `design/MmiriOma-landing-handoff`. Design
record and differences: [docs/design/landing-v1.md](../design/landing-v1.md).

## 1. Overview and purpose

The public website in front of the apps: what MmiriOma does, delivery
options, how to become a rider or driver, how to install the apps, FAQs and
the legal pages. Anyone can open them, signed in or not.

## 2. Feature workflow

- `/`: hero → how it works → Keke and Tanker options (sizes, no prices) →
  for drivers (approval steps) → install the apps → service areas and FAQs →
  footer. Header links jump to sections; below 960 px they move into a menu.
- "Order Water" → `/order` (sign-in first when signed out).
- "Become a Rider or Driver" → `/partner/signup`.
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
| `content.ts` | Copy shared by pages and tests: nav, areas, FAQs, `filterFaqs` |
| `icons.tsx` | The design's icons, path for path |
| `marketing.css` | Breakpoint rules for the hero and drivers backgrounds and grids |
| `useMarketingPage.ts` | Fonts, title and description, scrolling to `#section` |
| `frontend/public/marketing/` | Images (WebP plus PNG/JPG) |
| `frontend/src/styles/theme.css` | `mk-*` colours and the Outfit / DM Sans font tokens |

## 4. Database models and relationships

None.

## 5. API endpoints and request/response behavior

None. The pages are static; nothing is fetched.

## 6. Important business rules

- No prices on public pages (prices come from the server inside the app,
  FR-022).
- No water-quality claims, no invented numbers, no promises the app does not
  keep (live tracking, choosing a delivery time). Changed lines are listed in
  landing-v1.md.
- Service areas are a sample list until the pilot zone is confirmed.

## 7. Authentication and authorization

Public. `/` never redirects signed-in people (it is the page we share); the
installed customer app opens at `/app` instead.

## 8. Error handling and edge cases

- The FAQ shows an empty state with "Clear search" when nothing matches.
- Fonts fall back to the bundled offline copies if Google Fonts fails.
- Images have fixed sizes (no layout shift) and load lazily below the hero.
- The mobile menu closes on a link, Escape or any navigation, and the page
  behind it does not scroll while it is open.

## 9. Testing instructions

```bash
cd frontend
npm test
```

`src/features/marketing/marketing.test.tsx`: FAQ filter and counts, FAQ copy
checks, FAQ empty state and Clear search, mobile menu open and close, `/`
showing the landing page and `/app` still redirecting. Manual: compare with
`screens-png/` at 390, 768, 1024 and 1440 px.

## 10. Known limitations

- The legal text needs review before launch (open items in landing-v1.md).
- Social links and real partner logos are hidden until they exist. The footer's "Staff Login" opens `/admin/login`.
- The public pages ship in the main bundle (about 109 kB gzipped) so a shared
  link opens at once; every app page loads as its own chunk.
