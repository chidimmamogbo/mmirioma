# 2026-10-27: An apostrophe broke a single-quoted string on the Privacy page

- **Area:** frontend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** after a scripted text replacement in
  `frontend/src/features/marketing/LegalPages.tsx` (#117), `npm run lint`
  failed with `457:85  error  Parsing error: ',' expected`. An earlier
  combined command printed nothing at all, because the chain stopped at the
  failing lint step with its output hidden, and a cleanup step then removed
  the `node_modules` link (`sh: 1: eslint: not found` on the rerun).
- **Cause:** the new notice sentence contains "staff's", and the page's
  string was single-quoted, so the apostrophe ended it. The same replacement
  in `PRIVACY_NOTICE.md` (Markdown) was fine.
- **Fix / workaround:** use a double-quoted string for that row, as other
  rows with apostrophes do. When copying notice text into `LegalPages.tsx`,
  check the quote style of the target string, and run lint with its output
  visible.
- **Status:** resolved
- **Refs:** #117, `frontend/src/features/marketing/LegalPages.tsx`.
