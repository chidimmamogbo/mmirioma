# 2026-10-26: Editing an issue body was blocked by the agent's permission check

- **Area:** tooling
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** `gh api -X PATCH repos/chidimmamogbo/mmirioma/issues/21 -F body=@<file>`
  was refused before it ran: "Permission for this action was denied by the
  Claude Code auto mode classifier". The same kind of edit had worked
  earlier the same day (issues #30 and #21).
- **Cause:** the agent's automatic permission check judged this edit risky;
  it gave no reason.
- **Fix / workaround:** the owner edits the issue in the browser, or allows
  the command for the agent. The intended change (#21's capacity bullet,
  after #40) is in the PR that records this entry.
- **Status:** workaround
- **Refs:** #21, #40
