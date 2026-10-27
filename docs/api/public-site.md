# Public website endpoints (v1)

Requirements: FR-055, NFR-002 · Issue: #8 · Built in: #56

**Status: agreed** (G3) on 2026-10-26 by @nnamdi-security, technical lead
(#36). Proposed on 2026-10-21 by the new-design fork, **revised 2026-10-26 in
#8** after decisions by @chidimmamogbo (see [Changes](#changes)). Built in
#56 ([public-contact.md](../features/public-contact.md)).

The frontend uses a mock (`frontend/src/mocks/publicMock.ts`); with the real
API it reports "not connected yet" until the endpoint exists. Conventions
(errors, formats, phone numbers) are in [README.md](README.md).

## GET /public/contact

The company's support contact, for the website's floating "Chat on WhatsApp"
button, the FAQ help card, the 404 page and the customer app's Contact us
page. FR-055: the official support number is **+234 813 377 4902**, used
consistently in every customer-facing contact interface, and it "SHALL come
from one central configuration value rather than being repeated in code".

**Public:** no session cookie, no CSRF token. Rate limited per IP (NFR-002):
**120 requests per client IP per 10 minutes** (decided by the technical lead
in #56; generous for carrier NAT, and browsers cache the answer for 5
minutes).

**200** ([examples/public-contact.json](examples/public-contact.json))

```json
{ "phone": "+2348133774902", "whatsapp": "+2348133774902" }
```

| Field | Type | Notes |
| --- | --- | --- |
| `phone` | E.164 string | The backend's `SUPPORT_PHONE` setting (`backend/app/core/config.py`, default the official number), the same value the SMS templates use. Always present |
| `whatsapp` | E.164 string or `null` | The number for `https://wa.me/` links: the support number when WhatsApp support is switched on, else `null`, and the website then hides its WhatsApp buttons and shows the phone number |

Rules:

- **One central value (FR-055).** Both numbers come from backend settings
  read through `get_settings()`, never from the database or an admin screen.
  Changing the number is a configuration change by the technical lead.
- **WhatsApp is on** (FR-055 requires it to be confirmed active first):
  confirmed by @chidimmamogbo on 2026-10-26 that WhatsApp is active on
  +234 813 377 4902. The build adds a setting `SUPPORT_WHATSAPP_ENABLED`
  (default `false`; set to `true` for the pilot), so it can be switched off
  without a code change.
- Cacheable for a few minutes (`Cache-Control: public, max-age=300`).

Removed in #8: the admin Settings field "Support WhatsApp" that saved another
number. An admin-edited number would be a second source next to
`SUPPORT_PHONE`, which FR-055 rules out. The frontend's
`DEFAULT_WHATSAPP` in `frontend/src/lib/whatsapp.ts` stays only as the
fallback while the endpoint cannot be read; the link issue keeps it equal to
the official number.

| Status | `code` | When |
| --- | --- | --- |
| 429 | `too_many_attempts` | Per-IP limit; `Retry-After` and `details.retry_after_seconds` |
| 503 | `service_unavailable` | Shared ([README](README.md#errors)) |

## Newsletter: not in the pilot

**Decided** (@chidimmamogbo, 2026-10-26): the newsletter sign-up is **left
out of the pilot**. No endpoint is proposed. Reasons:

- There is no email provider (SRS §12), so no newsletter can be sent and the
  form's promise "Unsubscribe any time" cannot be kept.
- The pilot collects no email addresses: decided for customers and partners
  in #48 and #47, as the privacy notice says ("We do not collect your email
  address", `PRIVACY_NOTICE.md` §3).

The form before the footer of the public pages is removed or hidden in the
link issue, and the website's Privacy page loses its newsletter line. The
earlier proposal (`POST /newsletter/subscriptions`, single opt-in) is in the
git history of this file, for when an email provider is approved.

## Open questions

1. ~~Single or double opt-in for the newsletter?~~ Not needed: newsletter
   out of the pilot.
2. ~~Who sends the newsletter?~~ Not needed, as above.
3. Should `GET /public/contact` also return support hours once they are
   agreed? No SRS rule yet; not proposed.

## Changes

| Date | Change | Agreed by |
| --- | --- | --- |
| 2026-10-27 | Built in #56; the per-IP limit set to 120 requests per 10 minutes | @nnamdi-security (technical lead, #56) |
| 2026-10-26 | Revised in #8: contact read from backend settings only (FR-055), `phone` always set, `whatsapp` on by a setting (WhatsApp confirmed active); admin "Support WhatsApp" field removed; newsletter left out of the pilot | @nnamdi-security (technical lead, #36), with @chidimmamogbo's decisions on #8 |
| 2026-10-21 | Proposed: contact numbers from admin Settings, newsletter sign-up | Superseded |
