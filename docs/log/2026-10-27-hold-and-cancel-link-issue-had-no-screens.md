# 2026-10-27: The hold, confirmation and cancel link issue had no screens to link

- **Area:** process
- **Author:** Cloudcrackamara (+ Claude Code)
- **Symptom:** #17 asked to link `/hold`, `/hold/continue`, `/hold/resume`,
  `/proof-overrides`, `/confirmation-options`, `/cancellation-outcome` and
  `/transition`, "only actions the fork's admin screens already show". The
  fork has no hold review or order confirmation screens. Its "Cancel this
  order" takes a free-text reason ("Customer asked to cancel by phone") and
  promises that the customer is told and that a paid order becomes a refund
  as points, while the agreed cancel accepts only `mmirioma_unable`, notifies
  no one and needs the backend status as `expected_status`. Support's
  "Confirm delivery without code" and "Cancel order" act on issues that come
  from the mock.
- **Cause:** the linking plan listed endpoints by lane before the fork's
  screens for them existed, as in
  `2026-10-26-issue-6-had-no-screens-to-link.md`.
- **Fix / workaround:** #17 re-scoped and closed (approved by
  @nnamdi-security on #17). Design issues opened: #128 (hold review
  screens) and #129 (order cancellation). Confirmation stays with #72.
  `cancelOrder` stays "not connected". Before starting a link issue, check
  that a screen shows each action and that its wording matches what the
  endpoint does.
- **Status:** resolved
- **Refs:** #17, #72, #128, #129, `docs/api/deliveries.md`
