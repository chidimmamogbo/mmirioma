# 2026-10-28: A doc counted three seeded holds; part 4 of #166 made it four

- **Area:** docs
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** PR #191's review (chidimmamogbo) found that the feature doc said
  the mock has "three seeded held jobs, one of each kind". `partnerSeed.ts`
  seeds four.
- **Cause:** the count was taken from the first part of #166 (#167), which
  seeded three holds; #178 (part 4) later added a second source review, at the
  assigned source, so that Continue can be tried in mock mode. The doc was
  written from a changing feature without rereading the seed.
- **Fix / workaround:** the doc now lists the four (proof review, two source
  reviews, unsafe stop). When a doc states a count taken from code, read it from
  `main` just before the push, not from an earlier part of the same issue.
- **Status:** resolved
- **Refs:** #166, #191, `frontend/src/mocks/partnerSeed.ts`.
