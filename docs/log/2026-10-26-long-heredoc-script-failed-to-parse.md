# 2026-10-26: One long Bash script of heredocs failed to parse

- **Area:** tooling
- **Author:** Cloudcrackamara (+ Claude Code)
- **Symptom:** a single Bash call that wrote thirteen JSON example files with
  heredocs (some quoted `<<'EOF'`, some unquoted to expand ids) failed before
  writing anything:
  ``/usr/bin/bash: -c: line 274: unexpected EOF while looking for matching `'``.
- **Cause:** not pinned down; a quote inside one of the mixed quoted and
  unquoted heredocs was read as opening a string. Same family as
  [2026-10-23-shell-edits-garbled-tsx-with-backticks-and-heredocs.md](2026-10-23-shell-edits-garbled-tsx-with-backticks-and-heredocs.md).
- **Fix / workaround:** wrote each file with the editor's file-write tool
  instead, then checked every file with `JSON.parse` in Node. Avoid long
  heredoc scripts for file content.
- **Status:** workaround
- **Refs:** #18, `docs/api/examples/admin-*.json`
- **Seen again** 2026-10-27 (Bonvee120 + Claude Code, #63): one
  `python - <<'EOF'` script that edited two test files, with a `'''`
  string inside the heredoc, failed with
  ``/usr/bin/bash: -c: line 174: unexpected EOF while looking for matching `'``
  and wrote nothing. The editor's edit tool worked.
