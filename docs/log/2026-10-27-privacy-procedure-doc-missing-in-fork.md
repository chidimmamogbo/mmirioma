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
- **Fix / workaround:** none yet. The tool's steps are described in
  `docs/features/privacy-tool.md`. A follow-up should copy the procedure into
  the fork and add the steps #82 introduced: `set-deletion-status` after a
  deletion request made in the app, and support requests in the monthly
  review.
- **Status:** open
- **Refs:** #82, PR #4, `docs/features/privacy-tool.md`
