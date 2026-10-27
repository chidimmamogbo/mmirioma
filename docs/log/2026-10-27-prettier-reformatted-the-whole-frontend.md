# 2026-10-27: Running Prettier reformatted the whole frontend

- **Area:** frontend (tooling)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** During #57, `npx prettier --write src/features src/app src/lib src/mocks src/domain` changed 233 files, almost all of them untouched by the issue: semicolons added, quotes and line breaks changed.
- **Cause:** The frontend has no Prettier configuration and does not use Prettier (no `.prettierrc`, not in `package.json`). `npx` downloaded it and applied its defaults, which differ from the code's style (no semicolons, single quotes, long lines). ESLint is the only checker.
- **Fix / workaround:** Restored `frontend/` with `git checkout -- frontend`, then re-applied only the issue's edits from the scripts that made them. Do not run a formatter the project does not configure; follow the surrounding code's style and let `npm run lint` check it. Before any repository-wide command that writes files, check `git status` right after it.
- **Status:** resolved
- **Refs:** #57
