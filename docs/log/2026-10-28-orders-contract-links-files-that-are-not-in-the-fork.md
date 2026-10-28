# 2026-10-28: The orders contract links six files that are not in the fork

- **Area:** docs
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** while filing the follow-up for the customer's confirmed delivery
  window (#188), `docs/design/customer-pilot-status.md` (the approved design,
  G2, 2026-10-24) and `docs/design/prompts/11-customer-pilot-order-status.md`,
  both linked from `docs/api/orders.md` ("Customer pilot changes (#99)"), did
  not exist, so where the window shows on the customer screens could not be
  read. A link check of `orders.md` found four more missing files, linked
  seven times in all: `docs/design/customer-ordering.md`,
  `docs/design/admin-orders.md`, `docs/design/admin-dispatch.md` and
  `docs/process/pilot-plan.md`. Six distinct files in total.
- **Cause:** the contract was written and agreed in the upstream repo, and only
  its text came across; the designs, the prompt and the pilot plan it links
  did not.
- **Fix / workaround:** none for the links yet. #188 designs and approves the
  window's place before building it, so it does not depend on the missing
  design. Fixing the rest means bringing those files across, or removing the
  links, which belongs to whoever owns each document. When a contract is copied
  from another repo, check that every file it links exists here.
- **Status:** open
- **Refs:** #99, #165, #188, `docs/api/orders.md`.
