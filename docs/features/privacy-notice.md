# Privacy notice

Issue: [#100](https://github.com/mmiri-oma/mmirioma/issues/100) (Phase 2,
step 6) · Requirements: NFR-005, NFR-003, FR-055 · Pilot condition: G7 ·
Design: [privacy-notice.md](../design/privacy-notice.md) (approved
2026-10-23) · Contract: none (no endpoints;
[docs/api/README.md](../api/README.md#privacy-notice-page-no-endpoints))

## 1. Overview and purpose

NFR-005 asks MmiriOma to publish a simple privacy notice and define a
retention and deletion process. This feature:

- keeps the notice in [PRIVACY_NOTICE.md](../../PRIVACY_NOTICE.md) at the
  repository root, written to match what the pilot software and staff
  actually do;
- shows that file on a public page, `/privacy`, linked from the customer
  welcome, create account and sign-in screens and from the footer of the
  signed-in customer screens;
- documents the manual staff procedure for requests and retention in
  [docs/process/privacy-retention.md](../process/privacy-retention.md).

## 2. Feature workflow

1. A visitor or customer opens `/privacy` directly or from a link. The page
   renders at once; it does not wait for the session check.
2. From create account (C2) or sign in (C3) the link opens a new tab, so a
   half-filled form is kept. Elsewhere it opens in the same tab.
3. Privacy requests (access, correction, deletion) arrive on the support line
   or the privacy email and are handled by staff by the procedure; nothing
   in the app automates them.
4. To change the notice, edit `PRIVACY_NOTICE.md` (new version and date) and
   release the frontend; the page shows the new text.

## 3. Important files and their responsibilities

| File | Responsibility |
| --- | --- |
| `PRIVACY_NOTICE.md` | The notice: the single source of the published text |
| `docs/process/privacy-retention.md` | Staff procedure: request handling, monthly retention review, backups, open items |
| `frontend/vite.config.ts` (`privacyNotice()`) | Exposes `PRIVACY_NOTICE.md` as `virtual:privacy-notice` at build, dev and test time |
| `frontend/src/features/privacy/notice.ts` | Imports the text, parses it once, `PRIVACY_PATH` |
| `frontend/src/features/privacy/markdown.ts` | Minimal Markdown parser for what the notice uses (headings, paragraphs, line breaks, lists, tables, bold, `https`/`mailto`/`tel` links) |
| `frontend/src/features/privacy/PrivacyNoticePage.tsx` | P1: renders the blocks; tables as cards below 768 px |
| `frontend/src/features/privacy/PrivacyLinks.tsx` | `PrivacyNoticeLine` (C2, C3; new tab) and `CustomerFooter` (O1-O4) |
| `frontend/src/features/auth/components/TextLink.tsx` | `newTab` option: icon and "(opens in a new tab)" |
| `frontend/src/App.tsx` | Public `/privacy` route |
| `WelcomePage.tsx`, `CreateAccountPage.tsx`, `SignInPage.tsx`, `CustomerLayout.tsx` | The link placements |

## 4. Database models and relationships

None. The page stores nothing and reads nothing from the database. The
retention procedure describes which existing tables hold personal data
(users, sessions, phone verifications, orders, delivery records).

## 5. API endpoints and request/response behavior

None. The text is bundled at build time.

## 6. Important business rules

- The notice describes only what exists: no email collection, no photos,
  cash on delivery only (F4), refunds outside the app (F7), the 10-minute
  delivery code issued after unloading (#67), optional driver GPS with
  consent (FR-035), Termii for SMS, and Railway (Amsterdam, Netherlands) as
  the host since version 1.1 (2026-10-23), so data is processed outside
  Nigeria.
- Retention periods are the draft's, adopted by the technical lead on
  2026-10-23 for the data the pilot holds, applied by a **monthly manual
  review**; automation is deferred.
- The support number in the notice is the SRS number (FR-055); a change of
  number needs a new notice version.
- No consent box or "you agree" text: the links inform only (design
  Decision 2).

## 7. Authentication and authorization requirements

None: `/privacy` is public and identical for everyone, signed in or not.
The links appear only on customer screens; staff sign-in has none.

## 8. Error handling and edge cases

- No loading or error states: the text ships with the app.
- Markdown the parser does not support shows as plain text, and the test
  "uses only Markdown the page can render" fails, so it is caught before
  release.
- Links in the notice other than `https:`, `mailto:` and `tel:` are shown as
  plain text.
- Tables: on phones each row is a card; from 768 px a table. Only one is
  displayed, so screen readers read each row once.

## 9. Testing instructions

```bash
cd frontend
npx vitest run src/features/privacy   # parser, notice content, page, links
npm run lint && npm run typecheck && npm test && npm run build
```

Manual: `npm run dev`, open `/privacy` at 360 px and at 1280 px; follow the
links from `/`, `/create-account` (new tab), `/sign-in` (new tab) and, signed
in as a customer, the footer.

## 10. Known limitations

- Deletion, correction and the monthly review are done by staff with the
  command-line tool ([privacy-tool.md](privacy-tool.md)); nothing is
  automatic.
- No legal review has been done yet (procedure, open item 1).
- English only.
