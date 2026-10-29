# SMS (Termii) and the live SMS test

## 1. Overview and purpose

Customers receive SMS for phone verification (FR-003) and the P0
notifications of SRS v0.2 FR-050: order confirmed, order dispatched, the
delivery code (FR-035), payment acknowledgment (FR-041) and
cancellation/refund outcomes (FR-043, FR-044). Every message goes through one
provider adapter: a mock in development and test, Termii in production.

Before the pilot, each P0 message must be proven on the team's real phones
from a non-production run (#102, Phase 2 step 8). The command
`app.modules.messaging.live_test` sends every built template, with sample
values, to one team phone, and the results go in the pilot plan's
SMS live test record.

## 2. Feature workflow

Sending in the app:

```
feature service (auth, confirmation, deliveries, payments)
  builds the text with its *_message() function    (support number included, FR-055)
  sms.send(phone, text)                            app/modules/messaging/sms.py
    mock:   keeps it in memory, logs it masked on this machine, sends nothing
    termii: POST {TERMII_BASE_URL}/api/sms/send    "code": "ok" = accepted
  on SmsDeliveryError: the feature records "not accepted" or tells the user;
  the order never changes because of it (FR-050)
```

Live test (on a developer machine, never production):

```
python -m app.modules.messaging.live_test --to <team phone>          # preview
python -m app.modules.messaging.live_test --to <team phone> --send   # Termii
  -> one line per message: time (WAT), key, accepted / NOT accepted
  -> the phone's holder records what arrived in the pilot plan
```

## 3. Important files and their responsibilities

| File | Responsibility |
| --- | --- |
| `backend/app/modules/messaging/sms.py` | `SmsProvider`, `MockSmsProvider`, `TermiiSmsProvider`, `mask_phone`, `get_sms_provider` |
| `backend/app/modules/messaging/live_test.py` | Live SMS test command: preview or send every P0 template |
| `backend/app/core/config.py` | `SMS_PROVIDER`, `TERMII_*`, `SMS_TIMEOUT_SECONDS`; production refuses `mock` |
| `backend/app/modules/auth/phone_verification.py` | `code_message`: verification code |
| `backend/app/modules/confirmation/service.py` | `confirmation_message`: order confirmed |
| `backend/app/modules/deliveries/service.py` | `dispatched_message`: order dispatched |
| `backend/app/modules/deliveries/codes.py` | `code_message`: delivery code |
| `backend/app/modules/payments/service.py` | `payment_message`: cash received, with any outstanding amount |

## 4. Database models and relationships

The adapter stores nothing. Features record whether their message was
accepted:

| Message | Where the outcome is stored |
| --- | --- |
| Verification code | Not stored: on failure the code is rolled back and the API returns 503 |
| Order confirmed | `orders.confirmation_sms_status`, `orders.confirmation_sms_attempted_at` |
| Dispatched | Not stored; a failure is logged with the order reference |
| Delivery code | `delivery_codes.sms_status` (`accepted` or `failed`) |
| Payment received | `cash_collections.payment_sms_status`, `payment_sms_attempted_at` |

The live test command reads and writes no database.

## 5. API endpoints and request/response behavior

None for the live test (command line only). The messages are sent by the
endpoints of their features; see
[phone-verification.md](phone-verification.md),
[order-confirmation.md](order-confirmation.md),
[driver-jobs.md](driver-jobs.md) and [cash-remittance.md](cash-remittance.md).

Command options:

| Option | Meaning |
| --- | --- |
| `--to` | Required. The team phone, any Nigerian mobile form (`0803...`, `+234803...`) |
| `--send` | Send with Termii. Without it, the texts are printed and nothing is sent |
| `--only` | Comma-separated keys: `verification_code`, `order_confirmed`, `dispatched`, `delivery_code`, `payment_received`, `payment_part_paid` |

Exit code 0 when everything selected was previewed or accepted, 1 on an
error or if any message was not accepted.

## 6. Important business rules

- **Mock never in production** (SRS §2): with `APP_ENV=production` the app
  refuses to start unless `SMS_PROVIDER=termii`, so no customer is told a
  code was sent when it was not.
- **A channel failure never changes an order** and is never shown as sent
  (FR-050). Each feature's handling is in section 4.
- **No unverified promises** (FR-050): no arrival time, no water-quality
  claim. The confirmed window is the one the dispatcher set; "dispatched"
  says only that the driver started the delivery.
- **Support number in every template** (FR-055), from `SUPPORT_PHONE`.
- **One GSM-7 SMS where possible:** amounts use "N", not "₦" (which would
  force a costlier Unicode SMS). The sample texts are 86 to 153 characters.
  A confirmation whose window crosses midnight names both dates and can
  exceed 160 characters, which Termii sends as two parts.
- **Live test values are samples**, labelled as such: reference
  `MO-SAMPLE0001`, code `123456`, total N45,000.00 (part payment N30,000.00).
  They are not real orders or valid codes.

## 7. Authentication and authorization requirements

- The Termii API key and sender ID are environment secrets (NFR-003,
  NFR-030): the local `.env` for the live test, the server's `deploy/.env`
  in production. Never in the repository, the log, issues or chat.
- The live test runs only outside production and needs shell access to a
  machine with the key; there is no endpoint for it.
- Logs never contain message text from Termii sends or the API key; phone
  numbers are masked (`+234803****567`).

## 8. Error handling and edge cases

- `--send` with `SMS_PROVIDER=mock`: refused ("SMS_PROVIDER is mock, which
  sends nothing"), because nothing would reach the phone.
- `APP_ENV=production`: refused.
- A message Termii does not accept is reported as `NOT accepted: <reason>`
  (network error, HTTP status, or a body without `"code": "ok"`). The other
  messages are still sent.
- "Accepted by Termii" is not proof of receipt: DND filtering, an
  unregistered sender ID or a network problem can still stop it. Only the
  phone's holder can record "received".
- `--only cancellation_outcome`: refused; that SMS is not built and is sent
  manually under fallback F10 (section 10).

## 9. Testing instructions

```bash
cd backend
pytest tests/test_sms_live_test.py tests/test_sms.py tests/test_config.py
```

- `tests/test_sms_live_test.py`: every built P0 message covered, one SMS
  each with the support number, preview sends nothing, `--send` sends every
  text to the normalized number, failures reported, mock and production
  refused, unknown and unbuilt keys rejected.
- `tests/test_sms.py`: the Termii request and response handling.
- `tests/test_config.py`: production refuses `SMS_PROVIDER=mock`.

Live test on real phones:

1. In your local `.env` (never committed): `SMS_PROVIDER=termii`,
   `TERMII_API_KEY`, `TERMII_SENDER_ID`, `TERMII_CHANNEL=dnd`, and the
   account's `TERMII_BASE_URL`. Keep `APP_ENV` as `development`. The test
   suite still uses the mock provider: `tests/conftest.py` sets
   `SMS_PROVIDER=mock`, which takes precedence over `.env`.
2. Preview: `python -m app.modules.messaging.live_test --to <team phone>`.
3. Send: add `--send`. Copy the result lines.
4. The phone's holder fills the
   SMS live test record:
   who, when, received or not, and any difference from the preview.
5. Repeat on a phone on the Do-Not-Disturb list, which only the `dnd` route
   reaches.

## 10. Known limitations

- The cancellation and refund outcome SMS (FR-043, FR-044) is not built.
  For the pilot an administrator sends the outcome manually (pilot plan
  fallback F10, agreed 2026-10-23); the live test lists it as not available.
- The dispatched SMS outcome is only logged, not stored, so staff cannot see
  in the app whether it was accepted.
- Termii's delivery reports are not read: the app knows "accepted", never
  "delivered".
- The live test sends sample texts directly; it does not exercise each
  feature's flow end to end. The flows' sending is covered by their tests
  with the mock provider.
