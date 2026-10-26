# 2026-10-26: Two log entries with one filename conflicted on merge

- **Area:** process
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** merging `main` into PR #35's branch gave
  `CONFLICT (add/add): Merge conflict in docs/log/2026-10-26-gh-issue-view-printed-nothing.md`.
  @Bonvee120 (#35) and @Cloudcrackamara (#34) had each logged the same `gh`
  problem under the same name.
- **Cause:** the one-file-per-entry rule avoids conflicts only while names
  differ; two people hitting one problem on one day pick the same title.
- **Fix / workaround:** combined both into one entry (both authors, both
  issues) that points to the cause found in #39. Before adding an entry,
  search `docs/log/` **and open branches** for the problem
  (`git log --all --oneline -- docs/log/`); if an entry exists, update it.
- **Status:** resolved
- **Refs:** #34, #35, #39, `docs/log/2026-10-26-gh-issue-view-printed-nothing.md`
