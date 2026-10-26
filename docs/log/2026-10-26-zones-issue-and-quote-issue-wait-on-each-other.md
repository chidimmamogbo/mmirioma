# 2026-10-26: Zones issue and quote issue wait on each other

- **Area:** process
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** #30 (service zones) asks for "`POST /quotes` (#21) uses the
  zone rate", but `POST /quotes` does not exist yet and #21 lists #30 on its
  "Depends on" line, so neither issue could finish first. Separately, #18's
  contract (`docs/api/admin-directory.md`, PR #34) was merged while still
  `Status: proposed`, so "#18 is in" did not mean the zones contract was
  agreed (G3).
- **Cause:** the two issues were written before the zones contract moved
  into #18, and merging a proposal does not change its status line.
- **Fix / workaround:** split agreed by @nnamdi-security: #30 builds zones,
  zone fees, the admin and customer zone endpoints and a pricing service
  function for the delivery cost; #21 calls it from `POST /quotes`, and the
  quote item of #30's "Done when" moves to #21. Zone decisions recorded in
  the amendment PR (branch `docs/30-zone-amendments`). Check a contract's
  `Status:` line, not the PR state, before building.
- **Status:** resolved
- **Refs:** #18, #21, #30, PR #34, `docs/api/admin-directory.md`
