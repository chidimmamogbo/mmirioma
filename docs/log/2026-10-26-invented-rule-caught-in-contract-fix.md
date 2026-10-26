# 2026-10-26: An invented rule slipped into a contract fix and was removed

- **Area:** process
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** while aligning saved addresses with the zones contract on
  PR #33, the agent wrote "an inactive zone is 422 `validation_error`" for
  `POST /me/addresses`. No contract or SRS rule says so; the admin address
  rule (`admin-directory.md`) allows an inactive zone and leaves the check
  to ordering.
- **Cause:** filling a gap with a plausible rule instead of copying the
  agreed one (CLAUDE.md: never invent business rules).
- **Fix / workaround:** caught on re-reading before the push and replaced
  with the admin rule (inactive allowed; the quote answers
  `outside_service_zone`). When aligning two contracts, copy the agreed
  rule word for word, or raise an open question.
- **Status:** resolved
- **Refs:** #11, #30, PR #33, `docs/api/customer-account.md`
