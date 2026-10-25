# 2026-10-23: `python -I` ignores `PYTHONIOENCODING`, so "₦" still failed to print

- **Area:** tooling
- **Author:** Daveoski + Claude Code
- **Symptom:** The #125 end-to-end script, run with `python -I`, failed on
  its first line containing "₦": `UnicodeEncodeError: 'charmap' codec can't
  encode character '₦' in position 38: character maps to <undefined>`.
  Setting `PYTHONIOENCODING=utf-8` before the command changed nothing.
- **Cause:** The Windows console uses cp1252, which has no "₦" (same as the
  LOG.md entry on printing issue JSON). `-I` (isolated mode, used for
  scripts that read untrusted files) ignores every `PYTHON*` environment
  variable, including `PYTHONIOENCODING`. The request before the failing
  print had already gone through, so each failed run confirmed one more demo
  order.
- **Fix / workaround:** Put `sys.stdout.reconfigure(encoding="utf-8")` at the
  top of the script; it works with `-I`. In API scripts, print before
  sending, or make each step safe to repeat.
- **Status:** resolved
- **Refs:** #125, `docs/features/cash-remittance.md` (end-to-end run)
