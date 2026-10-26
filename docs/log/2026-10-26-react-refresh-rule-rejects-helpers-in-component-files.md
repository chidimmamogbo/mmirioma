# 2026-10-26: ESLint refused helper functions exported from a component file

- **Area:** frontend (lint)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `npx eslint src` failed with `Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components` for `cleanCode`, `resendWaitMs`, `waitText` and `sentNow` in `src/features/auth/PhoneCodeParts.tsx`.
- **Cause:** The `react-refresh` rule (`reactRefresh.configs.vite` in `eslint.config.js`) allows only components as exports from a `.tsx` file, so Vite's Fast Refresh can swap it safely.
- **Fix / workaround:** Moved the pure helpers to `src/features/auth/phoneCode.ts`, with their test `phoneCode.test.ts`. Put shared functions and constants in a `.ts` file from the start.
- **Status:** resolved
- **Refs:** #6
