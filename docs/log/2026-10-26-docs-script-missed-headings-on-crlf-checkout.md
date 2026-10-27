# 2026-10-26: A docs edit script missed headings on a CRLF checkout

- **Area:** tooling
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** A small Node script that replaces a section of
  `docs/api/order-details-and-price.md` stopped with `Error: markers`: it could
  not find the line `## Open questions`, although the heading was there.
  Nothing was written.
- **Cause:** On Windows, Git checks files out with CRLF line endings
  (`core.autocrlf`). Splitting on `\n` left a `\r` at the end of every line,
  so the exact line match failed. The same script had worked on a file that
  had just been written with LF endings.
- **Fix / workaround:** Split on `/\r?\n/` and write the file back with the
  line ending it had. Better: edit Markdown with the editor's find and replace,
  which does not care about line endings.
- **Again on 2026-10-27 (#9):** the same trap hit multi-line replacements in
  `.ts` and `.tsx` files (`frontend/src/mocks/seed.ts`,
  `features/customer/pages/OrderDetail.tsx`). They silently did nothing or
  printed "missing", while the one-line ones worked. Fixed for good with a
  replace helper that normalizes to LF, checks every pattern was found
  (non-zero exit if not), then restores CRLF. Rule: never assume `\n` in a
  pattern on a Windows checkout; check that every replacement applied.
- **Status:** resolved
- **Refs:** #42, #9
