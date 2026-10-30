# 2026-10-30: `gh issue create --repo chidimmamogbo/mmirioma` created issue #282 in the organization repo

- **Area:** GitHub
- **Author:** nnamdi-security + agent
- **Symptom:** `gh issue create --repo chidimmamogbo/mmirioma ...` printed `https://github.com/mmiri-oma/mmirioma/issues/282`, not a URL under `chidimmamogbo`. The standing rule then was never to open issues in `mmiri-oma/mmirioma`.
- **Cause:** the fork had been transferred to `mmiri-oma/mmirioma` (the old name redirects). The agent did not check the repo name (`gh repo view --json nameWithOwner`) before creating the issue, and the local `origin` and CLAUDE.md still named the old repo.
- **Fix / workaround:** the owner confirmed `mmiri-oma/mmirioma` is now the team repo, so #282 stayed. `origin` was repointed and CLAUDE.md and `work-issue.md` were updated (already done on `main`). Before the first write to a repo after any move, run `gh repo view <repo> --json nameWithOwner,isFork` and pass `--repo mmiri-oma/mmirioma`.
- **Status:** resolved
- **Refs:** #282, CLAUDE.md "Team workflow".
