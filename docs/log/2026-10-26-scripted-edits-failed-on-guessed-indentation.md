# 2026-10-26: Scripted test edits failed because the indentation was guessed

- **Area:** tooling
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** two Python replace scripts stopped with `AssertionError` on
  their exact-match check (for example on `assert call["data"] ==
  ConfirmInput(` and on the field set in `test_orders_api.py`); nothing was
  written by the failing step.
- **Cause:** the search text was written from memory with the wrong
  indentation (8 spaces instead of 4). The first script failed on its first
  replacement and wrote nothing; the corrected rerun wrote the confirmation
  test file, then failed on the orders test file for the same reason.
- **Fix / workaround:** read the exact lines (`sed -n`) first, then replace.
  Keep the exact-match count check in such scripts: it is what stopped a
  wrong edit.
- **Status:** resolved
- **Refs:** #21
