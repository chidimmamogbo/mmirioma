# 2026-10-23: Every pull request conflicted on LOG.md

- **Area:** process (GitHub)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** With six pull requests open, every one but the newest
  conflicted with `main` on `LOG.md`. After each was brought up to date and
  one was merged, all the remaining ones conflicted on `LOG.md` again, so
  merging six pull requests needed five rounds of updating branches.
- **Cause:** Every entry was added at the same place, the top of `LOG.md`
  (newest first). Two branches that both add an entry change the same lines,
  which Git cannot merge on its own. GitHub's merge button does not use
  `.gitattributes` merge drivers, so `merge=union` would not have helped
  there.
- **Fix / workaround:** One file per entry in `docs/log/`
  (`YYYY-MM-DD-short-title.md`); `LOG.md` is kept as the archive up to
  2026-10-23. Separate files never conflict. To resolve an old `LOG.md`
  conflict, keep both sides, newest entries first, and check that every
  heading is still on its own line (`LOG.md`, 2026-10-15).
- **Status:** resolved
- **Refs:** PRs #127, #130-#135, `docs/log/README.md`, CLAUDE.md "Issue log"
