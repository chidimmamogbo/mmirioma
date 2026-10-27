# Privacy notice

Issue: #93 (version 1.2, published as 2.0 in #104) · First built in the
main repo:
[#100](https://github.com/mmiri-oma/mmirioma/issues/100) · Requirements:
NFR-005, NFR-003, FR-055 · Pilot condition: G7 · Design: the main repo's
[privacy-notice.md](https://github.com/mmiri-oma/mmirioma/blob/main/docs/design/privacy-notice.md)
(approved 2026-10-23); in the fork the page uses the public site's legal
page layout ([public-pages.md](public-pages.md)) · Contract: none (no
endpoints)

## 1. Overview and purpose

NFR-005 asks MmiriOma to publish a simple privacy notice and define a
retention and deletion process. In the fork:

- the notice is [PRIVACY_NOTICE.md](../../PRIVACY_NOTICE.md) at the
  repository root, written to match what the pilot software and staff
  actually do; it is the source of the text;
- the website's Privacy page, `/privacy`, is a hand-made copy of it,
  section by section, with the same facts (PR #106);
- the staff procedure for requests and retention is
  [docs/process/privacy-retention.md](../process/privacy-retention.md).

The main repo instead rendered the Markdown file on its page at build time.
The fork's new-design website has its own legal page layout, so it keeps a
copy, and both change together.

## 2. Feature workflow

1. A visitor, customer or partner opens `/privacy` directly or from a link:
   the site footer (with `/privacy#cookies` for section 13), customer sign-in
   and sign-up, My profile, the partner account menu, or the Terms page.
2. The page shows the 16 sections, an "On this page" list of links, and the
   version and date.
3. Privacy requests (access, correction, deletion) arrive on the support
   line, the privacy email, or "Delete my account" in the app. Staff handle
   them by the procedure; the app records a deletion request and its status
   but deletes nothing itself.
4. To change the notice, follow the procedure's "Changing the notice":
   edit `PRIVACY_NOTICE.md` (new version and date) and the page together.

## 3. Important files and their responsibilities

| File | Responsibility |
| --- | --- |
| `PRIVACY_NOTICE.md` | The notice: the source of the published text |
| `docs/process/privacy-retention.md` | Staff procedure: request handling, deletion requests made in the app, monthly retention review, backups, open items |
| `frontend/src/features/marketing/LegalPages.tsx` | `PrivacyPage` and `PRIVACY`: the website copy of every section, and `PRIVACY_VERSION` |
| `frontend/src/features/marketing/routes.tsx` | The public `/privacy` route |
| `frontend/src/features/marketing/MarketingParts.tsx` | Footer links to `/privacy` and `/privacy#cookies` |
| `frontend/src/features/customer/pages/SignIn.tsx`, `SignUp.tsx`, `Profile.tsx` | Customer links to the notice |
| `frontend/src/features/partner/pages/PartnerAccount.tsx` | Partner link to the notice |
| `frontend/src/features/marketing/privacyNotice.test.tsx` | The page has every notice section in order, the notice's version, the section 9 app channel, and none of the old policy's claims |

## 4. Database models and relationships

None. The page stores nothing and reads nothing from the database. The
procedure and [privacy-tool.md](privacy-tool.md) describe which tables hold
personal data.

## 5. API endpoints and request/response behavior

None. The text ships with the frontend.

## 6. Important business rules

- The notice describes only what exists: no email collection, no photos,
  cash on delivery only (F4), refunds outside the app (F7), the 10-minute
  delivery code issued after unloading (#67), optional driver GPS with
  consent (FR-035), Termii for SMS, and Railway (Amsterdam, Netherlands) as
  the host, so data is processed outside Nigeria.
- Version 2.0 (27 October 2026) adds the data the fork collects: saved
  addresses, rider and driver details, in-app messages, in-app support
  requests, order feedback and deletion requests. It is 2.0, not 1.2,
  because what is collected changed (the procedure's version rule;
  privacy contact, 2026-10-27, #104).
- Section 9 names "Delete my account" in the app as a way to ask for
  deletion, with the same identity check by call-back.
- Retention periods are applied by a **monthly manual review** with the
  privacy tool; automation is deferred.
- The support number in the notice is the SRS number (FR-055); a change of
  number needs a new notice version.
- No consent box or "you agree" text: the links inform only.

## 7. Authentication and authorization requirements

None: `/privacy` is public and identical for everyone, signed in or not.

## 8. Error handling and edge cases

- No loading or error states: the text ships with the app.
- The notice and the page can drift apart, because the page is a copy. The
  test catches a missing, extra or reordered section and a version mismatch,
  but not a changed sentence: whoever edits one edits the other in the same
  change.

## 9. Testing instructions

```bash
cd frontend
npx vitest run src/features/marketing   # privacy page, public pages, support contact
npm run lint && npm run typecheck && npm test && npm run build
```

Manual: `npm run dev`, open `/privacy` at 360 px and at 1280 px, and follow
the links from the footer, customer sign-in, sign-up and My profile, and the
partner account menu.

## 10. Known limitations

- The page is a hand-made copy of the notice; sentences are kept in step by
  review, not by a test.
- Deletion, correction and the monthly review are done by staff with the
  command-line tool ([privacy-tool.md](privacy-tool.md)); nothing is
  automatic. Rider and driver accounts are not covered by the tool yet
  (procedure, open item 4; #119).
- No legal review has been done yet (procedure, open item 1).
- English only.
