# 2026-10-27: The privacy procedure document is missing from the fork

- **Area:** process
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** while extending the privacy tool for #82 (part 4),
  `docs/process/privacy-retention.md` did not exist in the fork, although
  `backend/app/modules/privacy/service.py`, `privacy/cli.py`,
  `auth/retention.py`, `orders/retention.py`, `payments/retention.py` and
  `docs/features/privacy-tool.md` all point to it for the deletion and
  monthly review procedure.
- **Cause:** the fork copied the main repo's backend (PR #4,
  `mmiri-oma/mmirioma@adc8654`) and its privacy tool, but not the process
  document the tool carries out. The main repo has it.
- **Fix / workaround:** #104 copied the procedure from the main repo
  (`c4d972c`) into `docs/process/privacy-retention.md` and extended it with
  what the fork's tool does: `set-deletion-status` for deletion requests made
  in the app, what anonymizing also removes, never-verified accounts with
  audit rows, support requests in the monthly review, rider and driver
  accounts as an open item, and the website copy of the notice. Every link to
  it resolves.
- **Status:** resolved
- **Refs:** #82, #104, PR #4, `docs/features/privacy-tool.md`
