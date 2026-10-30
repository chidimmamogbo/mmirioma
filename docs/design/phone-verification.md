# Phone verification design (customer app)

<!-- Workflow: docs/process/ui-driven-development.md. Fork gates: CLAUDE.md,
"Team workflow". -->

Issue: [#6](https://github.com/mmiri-oma/mmirioma/issues/6) · Requirements:
FR-003, FR-004, FR-050, FR-055, NFR-002, NFR-012, NFR-020, NFR-021, NFR-022 ·
Contract: [auth.md](../api/auth.md#phone-verification-fr-003-fr-004) (agreed,
G3) and [orders.md](../api/orders.md) (`phone_not_verified`) · Based on: the
main repo's approved phone verification design
(`mmiri-oma/mmirioma-original`, `docs/design/phone-verification.md`)
Designer: @chidimmamogbo + Claude Code · Reviewed by: @chidimmamogbo on 2026-10-26 · Status: approved

**Approved (G2)** by @chidimmamogbo on 2026-10-26, at preview version
`1793033918-0b04`, including the new wording (decision 13).

The customer app's screens for verifying the phone number with an SMS code
before the first water request (FR-003), and for changing it (FR-004).

**Behaviour, states and screen-to-endpoint mapping come from the approved main
repo design** (approved G2 on 2026-10-19 by @nnamdi-security, canvas version
`1792404379-080b`, with its review corrections 9-13), which already matches
the agreed auth contract. This document places those screens in the fork's
customer app and redraws them with its design system. Every change from the
approved design is listed under [Decisions](#decisions).

## Design link

- Clickable preview (every state, phone width, sample data):
  <https://claude.ai/artifact/RefzjgcQeFbDqtZqFa9uqB>, version
  `1793033918-0b04`. A review aid, not committed code. States placed
  differently for the fork are tagged "fork"; states whose text the approved
  design does not quote are tagged "new wording". Private until shared from
  its Share menu.
- Reference: the main repo's design document and its Claude Design canvas.

## Where the screens sit

| Place | Fork route | From the approved design |
| --- | --- | --- |
| V1 Send a code | `/verify-phone` | V1 |
| V2 Enter the code, V3 Verified | `/verify-phone` (steps of one screen) | V2, V3 |
| P1 New number, P2 Enter the code, P3 Number changed | `/profile/phone` (steps of one screen) | P1, P2, P3 |
| After Create account | `/signup` goes to `/verify-phone` | E1 |
| Not verified banner | Home (`/home`) | E2 (My orders there) |
| Request water, not verified | Review (`/order/review`) | E3 (O2 there) |
| Status badge, "Verify", "Change phone number" | My profile (`/profile`) | E4 (account menu there) |

## Screens and states

Phone numbers, names and codes are SAMPLE DATA. Every state below is from
the approved design unless marked *fork*.

| Screen | States designed | Build now / design ahead |
| --- | --- | --- |
| After Create account | Goes straight to V1; "Do this later" goes to Home | Build now (#6) |
| Home *fork* | Not verified (banner, no close button, "Verify phone"); verified (no banner) | Build now (#6) |
| Review | Not verified (banner, "Send request" off, rest unchanged); refused with 403 `phone_not_verified` (details kept); after verifying (details kept) | Build now (#6) |
| My profile *fork* | Not verified yet (badge, "Verify"); verified; after a change (new number, verified); "Change phone number" | Build now (#6) |
| V1 Send a code | Default, sending, too many codes, too many attempts, SMS failed, no connection, security check failed, session ended, already verified (shown as V3) | Build now (#6) |
| V2 Enter the code | Default with countdown, code incomplete, verifying, wrong code with 4 tries left, wrong code with 1 try left, last try used, expired or replaced, countdown finished, new code sent, resend refused, SMS failed on resend, no connection, SMS slow hint, too many attempts on Verify | Build now (#6) |
| V3 Verified | Success; Continue returns to Review (details kept) or Home | Build now (#6) |
| P1 New number | Default, field errors, sending, wrong password, same number, number has another account, too many attempts, too many codes, SMS failed, no connection, security check failed, session ended | Build now (#6) |
| P2 Enter the code | Every V2 state, plus "number taken meanwhile" (banner, "Change number" back to P1) | Build now (#6) |
| P3 Number changed | Success; Done goes to My profile, showing the new number as Verified | Build now (#6) |

### Wording

Quoted from the approved design: the banner "Verify your phone number to send
your first water request.", "4 tries left" / "1 try left", "No SMS yet? Check
the number above, then send a new code.", "Send a new code in 0:42" and "You
can send a new code now." Every other line in the preview is new wording to
review (decision 13).

## Screen-to-endpoint table

| Screen | Element / action | Endpoint | Fields used |
| --- | --- | --- | --- |
| V1, V2/P2 "Send a new code" | Send code | `POST /auth/phone-verification` | 202 `phone`, `expires_at`, `resend_available_at`; 409 `phone_already_verified` (shown as V3); 429 `too_many_attempts` (`retry_after_seconds`); 503 `sms_unavailable` |
| V2 | Verify | `POST /auth/phone-verification/verify` | `{code}`; 200 user (`phone_verified`); 400 `verification_code_invalid` (`attempts_remaining`), `verification_code_expired`; 422 `validation_error`; 429 |
| P1 | Send code | `POST /auth/phone-change` | `{phone, password}`; 202 as V1; 403 `password_incorrect`; 409 `phone_unchanged`, `phone_already_registered`; 429; 503 |
| P2 | Verify | `POST /auth/phone-change/verify` | `{code}`; 200 user (new `phone`, `phone_verified`); 400 as V2; 409 `phone_already_registered` |
| Home, Review, My profile | Banner, badge, number | `GET /auth/me` | `user.phone_verified`, `user.phone` |
| Review | Send request refused | `POST /orders` | 403 `phone_not_verified` |
| All | Session ended, security check | shared errors | 401 `not_authenticated`, 403 `csrf_failed` |

Every row maps to the agreed contracts; no contract change is needed.

## Decisions

Decisions 1-8 and corrections 9-13 of the approved design apply unchanged:
straight to V1 after sign-up with "Do this later"; a banner that cannot be
closed while unverified; "already verified" is a success; a wrong code clears
the field and shows the tries left; the resend countdown from
`resend_available_at`, measured from when the response arrived; the SMS slow
hint after 60 seconds; the current number kept until P2 succeeds; the badge
with icon and words; the order form unchanged apart from the banner and the
disabled or refused "Send request"; the order draft kept in app memory only;
no `maxlength` on the code field (spaces and dashes removed, first 6 digits
kept); the V1 "Too many attempts" banner for a 429 on Verify.

Fork-only:

9. **Supersedes fork design decision 7** (`handoff-v1.md`: "Verify phone"
   not used, manual verification by admin). That decision predates SRS v0.2
   FR-003, which requires an SMS code before the first order, and the
   backend refuses unverified customers (403 `phone_not_verified`).
10. **The banner sits on Home**, the fork's landing screen, instead of My
    orders. Same text and behaviour.
11. **The account menu items sit on My profile**, which already shows the
    phone with a "Verified" / "Not verified yet" chip. It gains a "Verify"
    row while unverified and a "Change phone number" row.
12. **E3 is the fork's Review screen** (`/order/review`), the screen that
    sends the request. Both its buttons ("Send request" and the quote
    request) are off while unverified. The order flow is #9's lane; this
    change is made in #6 by the owner's decision (2026-10-26).
13. **New wording, to review:** every state not quoted above (see
    [Wording](#wording)).

## Open questions

None for building. WhatsApp links stay off until WhatsApp is confirmed active
on the support number (FR-055), as in the approved design.

## Changes to the design system

Drawn with existing tokens, as in the approved design: the **code field**
(one large input, 30 px digits with wide tracking; default, focus, error,
off), the **resend countdown row**, the **verification badge**, the
**success screen** and the **phone display block**. No new colour.
