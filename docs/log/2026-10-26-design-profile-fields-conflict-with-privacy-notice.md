# 2026-10-26: Design profile fields conflict with the privacy notice

- **Area:** process
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** While writing the #11 customer account contract, the new
  design's profile (`CustomerProfile` in `frontend/src/domain/orders.ts`) has
  an optional `email` (design decision 6, "for updates, newsletters and promo
  alerts"), a `photo_url`, and SMS / WhatsApp / offers switches. The
  published `PRIVACY_NOTICE.md` §3 says "We do **not** collect your email
  address, photographs of you or your premises ... in the app". Loyalty
  points (decision 16, SAMPLE) have no rule in the SRS or PRD.
- **Cause:** The design and its decisions were written without checking the
  privacy notice, which came from the main repo (#100).
- **Fix / workaround:** `docs/api/customer-account.md` leaves email, photo,
  the switches and points out of the proposed responses and lists each as
  an open question: email needs a notice update first (NFR-005), marketing
  needs consent wording, WhatsApp waits for FR-055, points need SRS rules.
- **Status:** open (waiting on the technical lead and @chidimmamogbo)
- **Refs:** #11, `docs/api/customer-account.md`, `PRIVACY_NOTICE.md`
