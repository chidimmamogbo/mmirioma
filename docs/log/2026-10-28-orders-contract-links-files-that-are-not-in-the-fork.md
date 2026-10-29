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
- **Fix / workaround:** #188 designed and approved the window's place itself
  (`docs/design/customer-delivery-window.md`), so it did not depend on the
  missing design. For `orders.md`, the nine links to the six files are now
  plain text, with a note under the Status paragraph that the documents are in
  the main repo (`mmiri-oma/mmirioma`, read only; all six exist there). Nothing
  was copied across: the designs and the pilot plan belong to the main repo.
  A link check of `orders.md` finds no broken link now. When a contract is
  copied from another repo, check that every file it links exists here.
  Still linked and still missing, outside `orders.md`: `deliveries.md` (the
  admin dispatch design, `pilot-plan`), `payments.md` (`pilot-plan`) and some
  feature docs (`docs/features/admin-dispatch.md`, `admin-order-directory.md`,
  `customer-ordering.md`, `order-confirmation.md`, `sms.md`, `water-sources.md`).
- **Status:** resolved for `orders.md`; open for the other documents above
- **Refs:** #99, #165, #188, `docs/api/orders.md`.
