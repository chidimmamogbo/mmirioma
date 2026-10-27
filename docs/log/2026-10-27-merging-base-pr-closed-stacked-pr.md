# 2026-10-27: Merging a PR with branch deletion closed the PR stacked on it

- **Area:** GitHub
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** PR #65 (`feat/21-quotes`) was based on PR #62's branch (`feat/21-order-details`), not on `main`. `gh pr merge 62 --merge --delete-branch` merged #62 and deleted its branch, and GitHub then **closed** #65 instead of moving it to `main`.
- **Cause:** GitHub retargets a dependent PR only in some cases (for example when the base branch is deleted from the web interface's automatic branch deletion). Deleting the base branch through `gh` closes PRs whose base it was.
- **Fix / workaround:** pushed the merged base branch back (`git push origin <merged commit>:refs/heads/feat/21-order-details`), reopened #65, retargeted it with `gh pr edit 65 --base main`, merged `main` into it (one conflict in `backend/app/core/config.py`, both sides kept), waited for CI, merged, then deleted the restored branch. Next time: before merging the base PR, retarget the stacked PR first (`gh pr edit <n> --base main`), or merge the base PR without `--delete-branch`. Check `gh pr list --base <branch>` before deleting a branch.
- **Status:** resolved
- **Refs:** PR #62, PR #65, #21, [stacked PR entry](2026-10-26-stacked-pr-got-no-ci-checks.md)
