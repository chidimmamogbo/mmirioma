# 2026-10-28: The hold review feature doc described files that do not exist in the fork

- **Area:** docs
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** while checking whether #166 was complete, the "Screens" section
  of `docs/features/admin-hold-review.md` listed
  `frontend/src/features/admin-holds/HoldReviewPage.tsx` and six more files,
  a `/admin/orders/:ref/hold` page, and tests under `admin-holds/`. None of
  them exist in the fork, which built a side sheet in
  `frontend/src/features/admin/hold/`. The doc also named upstream issue
  numbers (#86, #88, #93, #94, #109, #113) that mean something else here, and
  said "No end-to-end run on the real API yet".
- **Cause:** the feature doc came across from the upstream repo with its
  backend, and the fork's screens (#166) were built later from the fork's own
  design (#128) without the doc's "Screens" section being rewritten. The
  closing comment on #166 repeated the doc's out-of-date "known limit" for
  Continue.
- **Fix / workaround:** rewrote the "Screens", frontend testing and known
  limitations parts to match the fork, and recorded the real-API run of
  2026-10-28. When a document is copied between repos, check every file path
  and issue number in it against the fork before the feature is called done.
- **Status:** resolved
- **Refs:** #166, #190, `docs/features/admin-hold-review.md`.
