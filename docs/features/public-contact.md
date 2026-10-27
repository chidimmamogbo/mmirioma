# Public support contact

Requirements: FR-055, NFR-002 · Contract:
[public-site.md](../api/public-site.md), `GET /public/contact` (agreed in
#8) · Issue: #56 · Screens: [public-pages.md](public-pages.md) (linked in
#57)

## 1. Overview and purpose

The website's "Chat on WhatsApp" button, the FAQ help card, the 404 page and
the customer app's Contact us page show MmiriOma's support number. FR-055
requires one official number, **+234 813 377 4902**, read from one central
configuration value. This endpoint gives the frontend that value, so the
number is no longer repeated in frontend code or saved by an admin screen.

## 2. Feature workflow

```
GET /api/v1/public/contact          no session, no CSRF
  per-IP limit (120 / 10 min)  ──>  429 too_many_attempts
  settings: SUPPORT_PHONE, SUPPORT_WHATSAPP_ENABLED
  200 {phone, whatsapp | null}      Cache-Control: public, max-age=300
```

## 3. Important files

| File | Responsibility |
| --- | --- |
| `backend/app/modules/public/router.py` | The endpoint, its response model and its per-IP limiter |
| `backend/app/core/config.py` | `support_phone` (also used by SMS templates) and `support_whatsapp_enabled` |
| `.env.example` | `SUPPORT_PHONE`, `SUPPORT_WHATSAPP_ENABLED` |
| `backend/tests/test_public_contact_api.py` | Tests |
| `docs/api/examples/public-contact.json` | The contract example |

## 4. Database models and relationships

None: both values are settings.

## 5. API endpoints and request/response behavior

`GET /api/v1/public/contact`, public. 200:

```json
{ "phone": "+2348133774902", "whatsapp": "+2348133774902" }
```

- `phone`: `SUPPORT_PHONE` in E.164 form; always present.
- `whatsapp`: the same number when `SUPPORT_WHATSAPP_ENABLED=true`, else
  `null` (the website then hides its WhatsApp buttons).
- Header `Cache-Control: public, max-age=300`.

Errors: 429 `too_many_attempts` with `Retry-After` and
`details.retry_after_seconds`; 503 as shared.

## 6. Important business rules

- **One central value (FR-055):** both numbers come from settings read
  through `get_settings()`, never from the database or an admin screen.
  Changing the number is a configuration change by the technical lead.
- **WhatsApp only once confirmed active (FR-055):** confirmed on 2026-10-26
  (#8), but the setting defaults to `false`; set
  `SUPPORT_WHATSAPP_ENABLED=true` for the pilot. Switching it off needs no
  code change.
- **Rate limit (NFR-002):** 120 requests per client IP per 10 minutes,
  decided by the technical lead in #56.

## 7. Authentication and authorization requirements

None: no session cookie or CSRF token. A cookie that is sent is ignored.

## 8. Error handling and edge cases

| Case | Result |
| --- | --- |
| Over 120 requests from one IP in 10 minutes | 429 `too_many_attempts`, `Retry-After` |
| `SUPPORT_PHONE` not in E.164 form | The app refuses to start (settings validation) |
| `POST` or another method | 405 |

## 9. Testing instructions

```bash
cd backend && source .venv/bin/activate
pytest tests/test_public_contact_api.py
curl -i http://localhost:8000/api/v1/public/contact
```

`test_public_contact_api.py` (no database): the example with WhatsApp on,
`null` by default, both numbers from `SUPPORT_PHONE`, no session needed, the
cache header, the 121st request is 429, `POST` is 405.

## 10. Known limitations

- While the contact cannot be read, the screens fall back to the official
  number with WhatsApp on (`frontend/src/lib/whatsapp.ts`), linked in #57.
- The rate-limit counter lives in the process (cleared on restart, separate
  per worker), like the auth limits; behind a reverse proxy, run uvicorn with
  `--proxy-headers` or every client shares the proxy's limit.
- Support hours are not returned (open question 3 of the contract).
