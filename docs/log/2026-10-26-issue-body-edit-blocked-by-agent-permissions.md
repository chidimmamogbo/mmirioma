# 2026-10-26: Editing an issue body was blocked by the agent's permission check

- **Area:** tooling
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** `gh api -X PATCH repos/chidimmamogbo/mmirioma/issues/21 -F body=@<file>`
  was refused before it ran: "Permission for this action was denied by the
  Claude Code auto mode classifier". The same kind of edit had worked
  earlier the same day (issues #30 and #21).
- **Cause:** the agent's automatic permission check judged this edit risky;
  it gave no reason.
- **Fix / workaround:** the owner added an allow rule to their own Claude
  Code user settings (`~/.claude/settings.json`, not committed):
  `"permissions": {"allow": ["Bash(gh api -X PATCH repos/chidimmamogbo/mmirioma/issues/*)"]}`.
  The rule covers only issue edits on this fork. Run the `gh api` command on
  its own, not chained after other commands, so it matches the rule. The #21
  capacity bullet (after #40) was then updated. Without the rule, edit the
  issue in the browser.
- **Status:** resolved
- **Refs:** #21, #40, PR #49
