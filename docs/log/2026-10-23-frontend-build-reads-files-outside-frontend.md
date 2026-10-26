# 2026-10-23: The frontend build needs files outside `frontend/`

- **Area:** frontend (build), tooling
- **Author:** Bonvee120 + Claude Code
- **Symptom:** Not an error yet, found while writing `backend/Dockerfile` for
  #103: a build stage with only `frontend/` copied in would fail. `npm run
  build` runs `tsc -b`, and `tsconfig.app.json` includes all of `src`, test
  files too, which import `../../../../docs/api/examples/*.json`. The Vite
  config also reads `../PRIVACY_NOTICE.md` (#100).
- **Cause:** The tests type-check against the contract examples, and the
  privacy page shows the root notice.
- **Fix / workaround:** The Dockerfile copies `PRIVACY_NOTICE.md` and
  `docs/api/examples/` into the build stage, and `.dockerignore` keeps
  `docs/api/examples` while excluding the rest of `docs/`. Any new file the
  frontend imports from outside `frontend/` must be added there too, or the
  Railway build fails.
- **Status:** workaround
- **Refs:** #103, `backend/Dockerfile`, `.dockerignore`
