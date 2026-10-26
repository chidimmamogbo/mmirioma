# Issue log

Every problem, error or surprise hit while working on MmiriOma, and how it was
resolved. Read it before starting work: it saves repeating the same mistakes.
The rules are in [CLAUDE.md](../../CLAUDE.md#issue-log-docslog).

**One file per entry**, named `YYYY-MM-DD-short-title.md` (lower case, words
joined by hyphens), for example `2026-10-23-log-md-conflicts-on-every-pr.md`.
Separate files never conflict when several pull requests add entries at once,
and the names sort by date.

Entries up to 23 October 2026 are in [LOG.md](../../LOG.md) at the repository
root, which is kept as the archive. Search both:

```bash
grep -ril "<words from the error>" docs/log LOG.md
ls docs/log            # every entry, oldest first
```

Never put secrets, credentials, tokens or personal data (real phone numbers,
addresses) in an entry.

## Entry template

Copy into a new file:

```markdown
# YYYY-MM-DD: <short title>

- **Area:** backend | frontend | database | CI | tooling | GitHub | process
- **Author:** <GitHub username> (+ agent, if one was used)
- **Symptom:** what happened, with the exact error message if there was one.
- **Cause:** why it happened (or "unknown" if not found yet).
- **Fix / workaround:** what was done, or what to do next time.
- **Status:** resolved | workaround | open
- **Refs:** issue/PR numbers, files, commits.
```

To change an entry's status later, edit its file (or, for an archived entry,
its section in `LOG.md`) rather than adding a duplicate.
