# 2026-10-28: The customer pilot changes contract links a design and a prompt that are not in the fork

- **Area:** docs
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** while writing the follow-up for the confirmed delivery window
  (#192), `docs/design/customer-pilot-status.md` (G2, 2026-10-24) and
  `docs/design/prompts/11-customer-pilot-order-status.md`, both linked from
  `docs/api/orders.md` ("Customer pilot changes (#99)"), did not exist, so
  where the window shows on the customer screens could not be read. A link
  check of `orders.md` then found five more dead links, all older than this
  change: `docs/design/customer-ordering.md`, `docs/design/admin-orders.md`,
  `docs/design/admin-dispatch.md` and `docs/process/pilot-plan.md` (some are
  linked twice).
- **Cause:** the contract was written and agreed in the upstream repo, whose
  design and prompt were not brought across with it. Only the contract text
  was.
- **Fix / workaround:** the contract now says the pilot status design and
  prompt are not in the fork; #192 designs and approves the window's place
  before building it. The other dead links are not fixed here (they need the
  files brought across, or the links removed, by whoever owns those
  documents). When a contract is copied from another repo, check that every
  file it links exists here.
- **Status:** workaround
- **Refs:** #99, #165, #192, `docs/api/orders.md`.
