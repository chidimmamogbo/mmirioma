# 2026-10-26: A scripted edit stopped at a ")" inside a comment

- **Area:** tooling
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** replacing an `import (...)` block with a regex
  (`\([^)]*\)`) left half the old block behind, and ruff reported
  `invalid-syntax: Unexpected indentation`.
- **Cause:** the block's first line carried `# noqa: F401  (pytest fixtures)`;
  the regex ended at that comment's `)`.
- **Fix / workaround:** removed the leftover lines and re-ran ruff. For
  multi-line code edits, replace exact text (or edit by line numbers after
  looking), not a regex over balanced brackets. Shared pytest fixtures are
  now assigned from the module (`api = orders_api.api`), the repo's pattern,
  which also avoids ruff F811.
- **Status:** resolved
- **Refs:** #21, `backend/tests/test_order_details_api.py`
