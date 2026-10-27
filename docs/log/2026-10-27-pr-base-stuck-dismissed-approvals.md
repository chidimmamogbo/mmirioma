# 2026-10-27: a PR's base commit stayed stale and dismissed every approval

- **Area:** GitHub
- **Author:** chidimmamogbo (+ Claude Code)
- **Symptom:** approving PR #100 and merging failed with `GraphQL: Waiting on code owner review from Cloudcrackamara and/or chidimmamogbo. (mergePullRequest)`, then `the base branch policy prohibits the merge`. Each approval showed as `DISMISSED` seconds later, although no commit was pushed. `gh api repos/<repo>/pulls/100 --jq .base.sha` returned `83e1204` (main after #87, hours old) while main was `1d1b075`.
- **Cause:** GitHub had not recalculated the PR against main after several merges (#91, #92). With "dismiss stale approvals" on, the approval was judged against a diff that no longer matched and was dismissed.
- **Fix / workaround:** set the base again without changing it: `gh api -X PATCH repos/<repo>/pulls/<n> -f base=main`. The base SHA then matched main; approve again (that base change dismisses the earlier approval once more) and merge. For a stacked PR, refresh the base after the PR under it merges, before approving (done for #116).
- **Status:** workaround
- **Refs:** PR #100, PR #116
