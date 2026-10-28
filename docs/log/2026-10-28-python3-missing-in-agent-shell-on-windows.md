# 2026-10-28: `python3` is not available in the agent's Git Bash on Windows

- **Area:** tooling
- **Author:** Bonvee120 + agent
- **Symptom:** A heredoc script run as `python3 - <<'EOF' ...` to append tests to a file printed `Python was not found; run without arguments to install from the Microsoft Store, or disable this shortcut from Settings > Apps > Advanced app settings > App execution aliases.` and the file was not changed. The command went on to run the next step, so the tests that were meant to be added were silently missing from that run.
- **Cause:** On this Windows machine `python3` resolves to the Microsoft Store shortcut, not to a Python install. Only the backend virtualenv has Python.
- **Fix / workaround:** Edit files with the editor tools (or `sed`/`cat` in Git Bash) instead of ad-hoc Python. Do not chain a file edit with later commands in one shell line, so a failed edit cannot go unnoticed.
- **Status:** workaround
- **Refs:** #138
