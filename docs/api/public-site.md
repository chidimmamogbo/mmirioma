# Public website endpoints (v1)

**Status: proposed** by the new-design fork (2026-10-21), not agreed. The
frontend uses a mock of these (`frontend/src/mocks/publicMock.ts`); with the
real API it reports "not connected yet" until they exist. Conventions
(errors, formats, phone numbers) are in [README.md](README.md).

Both endpoints are **public**: no session cookie, no CSRF token (no session
to protect). Both must be rate limited per IP.

## GET /public/contact

The company contact numbers admin sets in Settings ("Company WhatsApp",
"Support phone"). The website's floating "Chat on WhatsApp" button, the FAQ
help card, the 404 page and the customer app's Contact us page open
`https://wa.me/<number>` with this number.

**200**

```json
{ "whatsapp": "+2348133774902", "phone": null }
```

| Field | Type | Notes |
| --- | --- | --- |
| `whatsapp` | E.164 string or `null` | `null` until admin saves one; the frontend then uses the interim number `+2348133774902` (owner decision 2026-10-21, `frontend/src/lib/whatsapp.ts`). |
| `phone` | E.164 string or `null` | Support phone line, not used by the website yet. |

Cacheable for a few minutes (`Cache-Control: public, max-age=300`).

### Admin side (existing settings save)

Saving settings must validate `support_whatsapp` as a Nigerian mobile number
(the auth contract's phone rules) and store it as E.164; an empty value means
"use the default". Invalid: **422** `validation_error`, details
`[{ "loc": ["body", "support_whatsapp"], "msg": "...", "type": "value_error" }]`.

## POST /newsletter/subscriptions

Newsletter sign-up from the form before the footer of every public page.

**Request**

```json
{ "email": "ada@example.com" }
```

- Trimmed and lower-cased before storing; at most 254 characters; must look
  like `name@domain.tld`.

**202** (the same body for a new address and for one already on the list, so
the form cannot be used to find out who is subscribed)

```json
{ "status": "subscribed" }
```

**Errors**

| Status | `code` | When |
| --- | --- | --- |
| 422 | `validation_error` | Not an email; details `[{ "loc": ["body", "email"], ... }]` |
| 429 | `too_many_attempts` | Rate limit hit; `details.retry_after_seconds` |

**Rules for the backend**

- Every email sent must carry a working one-click unsubscribe link: the form
  promises "Unsubscribe any time".
- Use the address only for the newsletter (the form says so, and the Privacy
  Policy section 2 says it is kept until the person unsubscribes).
- Store `email` and `subscribed_at` (UTC); a later unsubscribe sets
  `unsubscribed_at` rather than deleting, so a re-subscribe is a new consent.

## Open questions

1. Single opt-in (as proposed) or a confirmation email first (double opt-in)?
   Double opt-in needs an email provider, which is not in the approved stack.
2. Who sends the newsletter, and from which tool? Not decided; no admin page
   lists subscribers yet.
3. Should `GET /public/contact` also return support hours once they are agreed?
