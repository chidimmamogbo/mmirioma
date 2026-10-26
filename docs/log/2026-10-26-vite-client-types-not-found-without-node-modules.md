# 2026-10-26: `vite/client` types not found in tsconfig.app.json

- **Area:** tooling
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** VS Code showed an error on `frontend/tsconfig.app.json`:
  `Cannot find type definition file for 'vite/client'. The file is in the
  program because: Entry point of type library 'vite/client' specified in
  compilerOptions`.
- **Cause:** `frontend/node_modules` did not exist in a fresh clone, so
  `vite/client.d.ts` was missing. The config itself is correct.
- **Fix / workaround:** `cd frontend && npm ci` (installs from the committed
  lockfile). `npm run typecheck` then passed and the error cleared. Do not
  remove `"types": ["vite/client"]`: `import.meta.env` needs it. `npm ci` also
  warned `EBADENGINE` for jsdom 30 and friends on Node v24.14.0 (they want
  `^24.15.0`); the install and typecheck still worked, but upgrade Node to
  24.15 or later if tests misbehave.
- **Status:** resolved
- **Refs:** `frontend/tsconfig.app.json`, `frontend/package-lock.json`
