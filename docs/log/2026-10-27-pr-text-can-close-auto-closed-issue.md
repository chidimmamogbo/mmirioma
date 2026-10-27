# 2026-10-27: "this one can close #88" in a PR description closed #88

- **Area:** GitHub
- **Author:** chidimmamogbo (+ Claude Code)
- **Symptom:** #88 (link the customer account screens) closed when PR #114 merged, although part 2 (#98) was still open. #114's description said `Refs #88 (with parts 1-3 merged, this one can close #88)`.
- **Cause:** GitHub treats "close #N", "closes #N", "fix #N" and "resolve #N" anywhere in a PR description as a closing keyword, even inside a sentence that says the opposite of closing it now.
- **Fix / workaround:** reopened #88 with a comment. In a partial PR, write only `Refs #N` and never put a closing keyword next to an issue number; say "the last part closes the issue" without the number. Check the PR's *Development* sidebar before merging: a linked issue there closes on merge.
- **Status:** resolved
- **Refs:** #88, PR #114, PR #108 (same sidebar link)
