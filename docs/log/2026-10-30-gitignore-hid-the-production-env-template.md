# 2026-10-30: `.env.production.example` was git-ignored by `.env.*`

- **Area:** tooling
- **Author:** nnamdi-security + agent
- **Symptom:** the new `.env.production.example` did not appear in `git status`. `.gitignore` ignores `.env.*` and un-ignores only `.env.example`.
- **Cause:** the negation list did not name the new template.
- **Fix / workaround:** added `!.env.production.example` to `.gitignore`. `test_deployment_config.py` checks that `.env.production` is ignored and the example is not. Any new `.env.<name>.example` needs its own negation.
- **Status:** resolved
- **Refs:** #282, `.gitignore`.
